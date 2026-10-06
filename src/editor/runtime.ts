import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

const jsonCache = new WeakMap<ProseMirrorNode, JSONContent>();
function sameJSON(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>,
    right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(right, key) &&
        sameJSON(left[key], right[key]),
    )
  );
}
/** ProseMirror nodes are immutable. Reuse unchanged JSON branches between edits. */
export function serializeDocument(
  node: ProseMirrorNode,
  original?: JSONContent,
): JSONContent {
  const cached = jsonCache.get(node);
  if (cached) return cached;
  const result: JSONContent = { type: node.type.name };
  // Match Node.toJSON(), including omitted empty fields and the original attrs.
  for (const _ in node.attrs) {
    result.attrs = node.attrs;
    break;
  }
  if (node.content.size) {
    result.content = [];
    node.forEach((child, _offset, index) =>
      result.content!.push(
        serializeDocument(child, original?.content?.[index]),
      ),
    );
  }
  if (node.marks.length) result.marks = node.marks.map((mark) => mark.toJSON());
  if (node.isText) result.text = node.text;
  // The first edit should also share unchanged branches with the loaded book.
  // Reject noncanonical originals so schema defaults and field omission still
  // match native toJSON exactly. Child identity makes this check incremental.
  const snapshot = original && sameJSON(result, original) ? original : result;
  jsonCache.set(node, snapshot);
  return snapshot;
}

export interface RelativeDecoration {
  from: number;
  to: number;
  attributes: Record<string, string>;
  node?: boolean;
}
/** Cache leaf work, and do no decoration work for selection-only transactions. */
export function cachedDecorationPlugin(
  name: string,
  decorate: (node: ProseMirrorNode) => RelativeDecoration[] | null,
): Plugin<DecorationSet> {
  const cache = new WeakMap<ProseMirrorNode, RelativeDecoration[]>();
  const collect = (node: ProseMirrorNode): RelativeDecoration[] => {
    const cached = cache.get(node);
    if (cached) return cached;
    let result = decorate(node);
    if (!result) {
      result = [];
      const contentStart = node.type === node.type.schema.topNodeType ? 0 : 1;
      node.forEach((child, offset) => {
        for (const entry of collect(child))
          result!.push({
            ...entry,
            from: entry.from + offset + contentStart,
            to: entry.to + offset + contentStart,
          });
      });
    }
    cache.set(node, result);
    return result;
  };
  const build = (doc: ProseMirrorNode) =>
    DecorationSet.create(
      doc,
      collect(doc).map((entry) =>
        entry.node
          ? Decoration.node(entry.from, entry.to, entry.attributes)
          : Decoration.inline(entry.from, entry.to, entry.attributes),
      ),
    );
  const key = new PluginKey<DecorationSet>(name);
  return new Plugin({
    key,
    state: {
      init: (_, state) => build(state.doc),
      apply: (transaction, previous) =>
        transaction.docChanged ? build(transaction.doc) : previous,
    },
    props: {
      decorations: (state) => key.getState(state) || DecorationSet.empty,
    },
  });
}
