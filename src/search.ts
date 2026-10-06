import type { Editor, JSONContent } from "@tiptap/core";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
} from "@tiptap/pm/model";
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
// One query per immutable node bounds memory while reusing unchanged sections
// and textblocks when typing changes a single branch of a large chapter.
const matchCache = new WeakMap<
  ProseMirrorNode,
  { key: string; matches: SearchMatch[] }
>();

/** Literal, non-overlapping matches expressed in the document's real positions. */
export function findDocumentMatches(
  document: ProseMirrorNode,
  query: string,
  sensitive: boolean,
): SearchMatch[] {
  if (!query) return [];
  const key = `${sensitive ? "1" : "0"}:${query}`;
  const cached = matchCache.get(document);
  if (cached?.key === key) return cached.matches;
  // Unicode regex case folding keeps offsets in the original UTF-16 string.
  // Lowercasing the document first can change its length (for example, İ).
  const expression = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    sensitive ? "gu" : "giu",
  );
  const collect = (node: ProseMirrorNode): SearchMatch[] => {
    const cached = matchCache.get(node);
    if (cached?.key === key) return cached.matches;
    const matches: SearchMatch[] = [];
    if (!node.isTextblock) {
      const start = node.type === node.type.schema.topNodeType ? 0 : 1;
      node.forEach((child, offset) => {
        for (const match of collect(child))
          matches.push({
            from: match.from + start + offset,
            to: match.to + start + offset,
          });
      });
      matchCache.set(node, { key, matches });
      return matches;
    }
    let text = "",
      start = 1;
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
        if (!text) start = 1 + offset;
        text += child.text;
      } else {
        // Formatting marks do not interrupt text, but line breaks and inline
        // objects do. In particular, their node sizes must never be skipped.
        flush();
      }
    });
    flush();
    matchCache.set(node, { key, matches });
    return matches;
  };
  return collect(document);
}

export function findMatches(editor: Editor, query: string, sensitive: boolean) {
  return findDocumentMatches(editor.state.doc, query, sensitive);
}

const documentCache = new WeakMap<
  JSONContent,
  WeakMap<Schema, ProseMirrorNode>
>();
function cachedDocument(json: JSONContent, schema: Schema): ProseMirrorNode {
  let bySchema = documentCache.get(json);
  if (!bySchema) {
    bySchema = new WeakMap();
    documentCache.set(json, bySchema);
  }
  let document = bySchema.get(schema);
  if (!document) {
    document =
      json.type !== "text" && json.content?.length
        ? schema
            .nodeFromJSON({ ...json, content: undefined })
            .copy(
              Fragment.fromArray(
                json.content.map((child) => cachedDocument(child, schema)),
              ),
            )
        : schema.nodeFromJSON(json);
    bySchema.set(schema, document);
  }
  return document;
}

function orderedChapters(
  book: Book,
  startChapterId: string | null | undefined,
) {
  const outline = outlineEntries(book)
    .map(({ node }) => node)
    .filter((node): node is Chapter => node.type === "chapter");
  const start = Math.max(
    0,
    outline.findIndex((chapter) => chapter.id === startChapterId),
  );
  return [...outline.slice(start), ...outline.slice(0, start)];
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
  return orderedChapters(book, startChapterId).flatMap((chapter) => {
    const document = cachedDocument(chapter.document, schema);
    const matches = findDocumentMatches(document, query, sensitive);
    return matches.length ? [{ chapter, document, matches }] : [];
  });
}

/** Yield between chapters so large-project searches cannot monopolize typing. */
export async function searchBookAsync(
  book: Book,
  query: string,
  sensitive: boolean,
  startChapterId: string | null | undefined,
  schema: Schema,
  signal?: AbortSignal,
): Promise<ChapterSearchResults[]> {
  if (!query) return [];
  const results: ChapterSearchResults[] = [];
  let sliceStart = performance.now();
  for (const chapter of orderedChapters(book, startChapterId)) {
    if (signal?.aborted)
      throw new DOMException("Search cancelled", "AbortError");
    const document = cachedDocument(chapter.document, schema);
    const matches = findDocumentMatches(document, query, sensitive);
    if (matches.length) results.push({ chapter, document, matches });
    if (performance.now() - sliceStart >= 8) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
  return results;
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
