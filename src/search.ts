import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { outlineEntries, type Book, type Chapter } from "./model";

export interface SearchMatch {
  from: number;
  to: number;
}

export interface ChapterSearchResults {
  chapter: Chapter;
  document: ProseMirrorNode;
  matches: SearchMatch[];
}

/** Literal, non-overlapping matches expressed in the document's real positions. */
export function findDocumentMatches(
  document: ProseMirrorNode,
  query: string,
  sensitive: boolean,
): SearchMatch[] {
  if (!query) return [];
  // Unicode regex case folding keeps offsets in the original UTF-16 string.
  // Lowercasing the document first can change its length (for example, İ).
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    sensitive ? "gu" : "giu",
  );
  const matches: SearchMatch[] = [];
  document.descendants((node, position) => {
    if (!node.isTextblock) return;
    let text = "",
      start = position + 1;
    const flush = () => {
      expression.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = expression.exec(text)))
        matches.push({
          from: start + match.index,
          to: start + match.index + match[0].length,
        });
      text = "";
    };
    node.forEach((child, offset) => {
      if (child.isText) {
        if (!text) start = position + 1 + offset;
        text += child.text;
      } else {
        // Formatting marks do not interrupt text, but line breaks and inline
        // objects do. In particular, their node sizes must never be skipped.
        flush();
      }
    });
    flush();
    return false;
  });
  return matches;
}

export function findMatches(editor: Editor, query: string, sensitive: boolean) {
  return findDocumentMatches(editor.state.doc, query, sensitive);
}

const documentCache = new WeakMap<
  JSONContent,
  WeakMap<Schema, ProseMirrorNode>
>();
function chapterDocument(chapter: Chapter, schema: Schema): ProseMirrorNode {
  let bySchema = documentCache.get(chapter.document);
  if (!bySchema) {
    bySchema = new WeakMap();
    documentCache.set(chapter.document, bySchema);
  }
  let document = bySchema.get(schema);
  if (!document) {
    document = schema.nodeFromJSON(chapter.document);
    bySchema.set(schema, document);
  }
  return document;
}

/** Search every nested chapter, starting at the current chapter and wrapping. */
export function searchBook(
  book: Book,
  query: string,
  sensitive: boolean,
  startChapterId: string | null | undefined,
  schema: Schema,
): ChapterSearchResults[] {
  if (!query) return [];
  const outline = outlineEntries(book)
    .map(({ node }) => node)
    .filter((node): node is Chapter => node.type === "chapter");
  const start = Math.max(
    0,
    outline.findIndex((chapter) => chapter.id === startChapterId),
  );
  const ordered = [...outline.slice(start), ...outline.slice(0, start)];
  return ordered.flatMap((chapter) => {
    const document = chapterDocument(chapter, schema);
    const matches = findDocumentMatches(document, query, sensitive);
    return matches.length ? [{ chapter, document, matches }] : [];
  });
}

export function matchContext(
  document: ProseMirrorNode,
  match: SearchMatch,
  radius = 48,
): string {
  const from = Math.max(0, match.from - radius);
  const to = Math.min(document.content.size, match.to + radius);
  return `${from > 0 ? "…" : ""}${document.textBetween(from, to, " ", " ")}${to < document.content.size ? "…" : ""}`;
}
