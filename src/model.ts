import type { JSONContent } from "@tiptap/core";
import { normalizeFormattingValue } from "./formatting";
export type Status =
  "Idea" | "Outline" | "Draft" | "Revision" | "Editing" | "Final";
export type Progress =
  "not-started" | "in-progress" | "complete" | "blocked" | "on-hold";
export type SectionIconName =
  | "document"
  | "layers"
  | "gamepad"
  | "globe"
  | "users"
  | "leaf"
  | "hammer"
  | "code"
  | "lightbulb"
  | "flag";
export interface Chapter {
  id: string;
  type: "chapter";
  title: string;
  parentId: string | null;
  kind: "chapter" | "front" | "back";
  status: Status;
  progress?: Progress;
  icon?: SectionIconName;
  emoji?: string;
  tags: string;
  notes: string;
  goal: number;
  document: JSONContent;
  created: string;
  modified: string;
}
export interface Part {
  id: string;
  type: "part";
  title: string;
}
export type BookNode = Chapter | Part;
export interface Book {
  version: 1;
  mode?: "book" | "bible";
  id: string;
  title: string;
  subtitle: string;
  author: string;
  description: string;
  language: string;
  created: string;
  modified: string;
  goal: number;
  color: string;
  nodes: BookNode[];
}
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
const sectionEmojiPattern =
  /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\u{1F3F4}[\u{E0061}-\u{E007A}]{2,7}\u{E007F}|(?:\p{Emoji_Modifier_Base}\uFE0F?\p{Emoji_Modifier}?|\p{Extended_Pictographic}\uFE0F?)(?:\u200D(?:\p{Emoji_Modifier_Base}\uFE0F?\p{Emoji_Modifier}?|\p{Extended_Pictographic}\uFE0F?))*)$/u;
const sectionEmojiSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
/** Accept one short emoji label; an empty result clears the optional marker. */
export function normalizeSectionEmoji(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return "";
  if (value.length > 32 || !sectionEmojiPattern.test(value)) return null;
  if (
    sectionEmojiSegmenter &&
    [...sectionEmojiSegmenter.segment(value)].length !== 1
  )
    return null;
  return value;
}
export function isValidSectionEmoji(value: unknown): value is string {
  return typeof value === "string" && normalizeSectionEmoji(value) === value;
}
export const emptyDoc = (): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph" }],
});
export const chapters = (book: Book) =>
  book.nodes.filter((n): n is Chapter => n.type === "chapter");
export const plainText = (doc: JSONContent): string =>
  doc.text ??
  (doc.content ?? [])
    .map(plainText)
    .join(
      ["doc", "bulletList", "orderedList", "table", "tableRow"].includes(
        doc.type ?? "",
      )
        ? "\n"
        : doc.type === "listItem"
          ? " "
          : "",
    );
export function docText(doc: JSONContent): string {
  return (
    doc.text ??
    (doc.content ?? [])
      .map(docText)
      .join(
        doc.type === "text"
          ? ""
          : ["paragraph", "heading", "codeBlock"].includes(doc.type ?? "")
            ? ""
            : "\n",
      )
  );
}
export const wordCount = (doc: JSONContent) =>
  (docText(doc).match(/\S+/g) ?? []).length;
export const bookWords = (book: Book) =>
  chapters(book).reduce((sum, c) => sum + wordCount(c.document), 0);

export interface DocumentStats {
  words: number;
  characters: number;
}
interface TextStats extends DocumentStats {
  startsWithWord: boolean;
  endsWithWord: boolean;
}
const documentStats = new WeakMap<JSONContent, TextStats>();
/** Runtime editor snapshots are immutable. Public wordCount/bookWords remain mutation-fresh. */
export function cachedDocumentStats(doc: JSONContent): DocumentStats {
  const cached = documentStats.get(doc);
  if (cached) return cached;
  let result: TextStats;
  if (typeof doc.text === "string") {
    let words = 0;
    const matcher = /\S+/g;
    while (matcher.exec(doc.text)) words++;
    result = {
      words,
      characters: doc.text.length,
      startsWithWord: /^\S/.test(doc.text),
      endsWithWord: /\S$/.test(doc.text),
    };
  } else {
    const concatenate = ["text", "paragraph", "heading", "codeBlock"].includes(
      doc.type || "",
    );
    result = {
      words: 0,
      characters: 0,
      startsWithWord: false,
      endsWithWord: false,
    };
    (doc.content || []).forEach((child, index) => {
      const next = cachedDocumentStats(child) as TextStats;
      if (!concatenate && index) {
        result.characters++;
        result.endsWithWord = false;
      }
      if (next.characters) {
        if (result.characters === 0)
          result.startsWithWord = next.startsWithWord;
        result.words +=
          next.words - (result.endsWithWord && next.startsWithWord ? 1 : 0);
        result.characters += next.characters;
        result.endsWithWord = next.endsWithWord;
      }
    });
  }
  documentStats.set(doc, result);
  return result;
}
export function cachedBookWords(book: Book): number {
  let total = 0;
  for (const node of book.nodes)
    if (node.type === "chapter")
      total += cachedDocumentStats(node.document).words;
  return total;
}
export function makeChapter(
  title = "Untitled chapter",
  parentId: string | null = null,
): Chapter {
  return {
    id: uid(),
    type: "chapter",
    title,
    parentId,
    kind: "chapter",
    status: "Draft",
    progress: "not-started",
    icon: "document",
    tags: "",
    notes: "",
    goal: 2000,
    document: emptyDoc(),
    created: now(),
    modified: now(),
  };
}
export function makeBook(title: string, template = "blank"): Book {
  const part: Part = { id: uid(), type: "part", title: "Fundamentals" };
  const first = makeChapter(
    "Your first chapter",
    template === "blank" ? null : part.id,
  );
  return {
    version: 1,
    ...(template === "bible" ? { mode: "bible" as const } : {}),
    id: uid(),
    title,
    subtitle: "",
    author: "",
    description: "",
    language: "en-US",
    created: now(),
    modified: now(),
    goal: template === "bible" ? 0 : 50000,
    color: "#314d43",
    nodes:
      template === "bible"
        ? [{ ...makeChapter("Overview"), progress: "in-progress", goal: 0 }]
        : template === "blank"
          ? [first]
          : [
              { ...makeChapter("Preface"), kind: "front" },
              part,
              first,
              { ...makeChapter("Appendix"), kind: "back" },
            ],
  };
}
const allowedNodes = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "image",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "horizontalRule",
  "hardBreak",
  "callout",
]);
const allowedMarks = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "textStyle",
]);
const formattingProperties: Record<string, string> = {
  fontFamily: "font-family",
  fontSize: "font-size",
  color: "color",
  backgroundColor: "background-color",
  textAlign: "text-align",
  lineHeight: "line-height",
  marginTop: "margin-top",
  marginBottom: "margin-bottom",
  marginLeft: "margin-left",
  marginRight: "margin-right",
  textIndent: "text-indent",
  paddingLeft: "padding-left",
};
function validateFormattingAttributes(attrs: unknown): boolean {
  if (attrs === undefined || attrs === null) return true;
  if (typeof attrs !== "object" || Array.isArray(attrs)) return false;
  return Object.entries(formattingProperties).every(([attribute, property]) => {
    const value = (attrs as Record<string, unknown>)[attribute];
    return (
      value === undefined ||
      value === null ||
      (typeof value === "string" &&
        normalizeFormattingValue(property, value) !== null)
    );
  });
}
export function validateDocument(doc: JSONContent, depth = 0): boolean {
  return validateDocumentWith(doc, depth, false);
}
const validationCache = new WeakMap<JSONContent, Map<number, boolean>>();
function cachedValidateDocument(doc: JSONContent, depth = 0): boolean {
  if (!doc || typeof doc !== "object") return false;
  const previous = validationCache.get(doc);
  if (previous?.has(depth)) return previous.get(depth)!;
  const valid = validateDocumentWith(doc, depth, true);
  const depths = previous || new Map<number, boolean>();
  depths.set(depth, valid);
  validationCache.set(doc, depths);
  return valid;
}
function validateDocumentWith(
  doc: JSONContent,
  depth: number,
  cached: boolean,
): boolean {
  if (
    !doc ||
    typeof doc !== "object" ||
    depth > 50 ||
    !allowedNodes.has(doc.type ?? "")
  )
    return false;
  if (!validateFormattingAttributes(doc.attrs)) return false;
  if (doc.type === "text" && typeof doc.text !== "string") return false;
  if (
    doc.marks &&
    (!Array.isArray(doc.marks) ||
      doc.marks.some(
        (m) =>
          !m ||
          !allowedMarks.has(m.type) ||
          !validateFormattingAttributes(m.attrs),
      ))
  )
    return false;
  const inline = ["text", "hardBreak"];
  const blocks = [
    "paragraph",
    "heading",
    "bulletList",
    "orderedList",
    "blockquote",
    "codeBlock",
    "image",
    "table",
    "horizontalRule",
    "callout",
  ];
  const children: Record<string, string[]> = {
    doc: blocks,
    paragraph: inline,
    heading: inline,
    codeBlock: ["text"],
    bulletList: ["listItem"],
    orderedList: ["listItem"],
    listItem: blocks,
    blockquote: blocks,
    callout: blocks,
    table: ["tableRow"],
    tableRow: ["tableCell", "tableHeader"],
    tableCell: blocks,
    tableHeader: blocks,
    text: [],
    image: [],
    hardBreak: [],
    horizontalRule: [],
  };
  if (
    doc.content &&
    (!Array.isArray(doc.content) ||
      doc.content.some(
        (n) => !n || !children[doc.type!]?.includes(n.type || ""),
      ))
  )
    return false;
  if (
    doc.type === "image" &&
    (typeof doc.attrs?.src !== "string" ||
      !/^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(
        doc.attrs.src,
      ))
  )
    return false;
  if (doc.type === "heading" && ![1, 2, 3, 4, 5, 6].includes(doc.attrs?.level))
    return false;
  if (
    doc.marks?.some(
      (m) =>
        m.type === "link" &&
        (typeof m.attrs?.href !== "string" ||
          !/^(https?:|mailto:|#)/i.test(m.attrs.href)),
    )
  )
    return false;
  return (
    !doc.content ||
    (Array.isArray(doc.content) &&
      doc.content.every((n) =>
        cached
          ? cachedValidateDocument(n, depth + 1)
          : validateDocumentWith(n, depth + 1, false),
      ))
  );
}
export function validateBook(value: unknown): value is Book {
  return validateBookWith(value, validateDocument);
}
/** For immutable editor snapshots only; imports and mutable callers use validateBook. */
export function cachedValidateBook(value: unknown): value is Book {
  return validateBookWith(value, cachedValidateDocument);
}
function validateBookWith(
  value: unknown,
  validateDoc: (doc: JSONContent) => boolean,
): value is Book {
  if (!value || typeof value !== "object") return false;
  const b = value as Book;
  if (
    b.version !== 1 ||
    typeof b.id !== "string" ||
    !/^[a-zA-Z0-9-]+$/.test(b.id) ||
    typeof b.title !== "string" ||
    (b.mode !== undefined && b.mode !== "book" && b.mode !== "bible") ||
    !Array.isArray(b.nodes) ||
    !b.nodes.length
  )
    return false;
  const ids = new Set<string>();
  if (
    [
      "subtitle",
      "author",
      "description",
      "language",
      "created",
      "modified",
      "color",
    ].some(
      (k) => typeof (b as unknown as Record<string, unknown>)[k] !== "string",
    )
  )
    return false;
  for (const n of b.nodes) {
    if (
      !n ||
      typeof n.id !== "string" ||
      ids.has(n.id) ||
      typeof n.title !== "string"
    )
      return false;
    ids.add(n.id);
    if (n.type !== "part" && n.type !== "chapter") return false;
    if (
      n.type === "chapter" &&
      (n.document?.type !== "doc" || !validateDoc(n.document))
    )
      return false;
    if (
      n.type === "chapter" &&
      (typeof n.tags !== "string" ||
        typeof n.notes !== "string" ||
        !["Idea", "Outline", "Draft", "Revision", "Editing", "Final"].includes(
          n.status,
        ) ||
        !["chapter", "front", "back"].includes(n.kind))
    )
      return false;
    if (
      n.type === "chapter" &&
      ((n.parentId !== null && typeof n.parentId !== "string") ||
        (n.emoji !== undefined && !isValidSectionEmoji(n.emoji)) ||
        (n.progress !== undefined &&
          ![
            "not-started",
            "in-progress",
            "complete",
            "blocked",
            "on-hold",
          ].includes(n.progress)) ||
        (n.icon !== undefined &&
          ![
            "document",
            "layers",
            "gamepad",
            "globe",
            "users",
            "leaf",
            "hammer",
            "code",
            "lightbulb",
            "flag",
          ].includes(n.icon)))
    )
      return false;
  }
  if (!chapters(b).length) return false;
  const nodes = new Map(b.nodes.map((n) => [n.id, n]));
  if (chapters(b).some((c) => c.parentId !== null && !nodes.has(c.parentId)))
    return false;
  // Follow each parent chain once, so deeply nested outlines remain safe and
  // large projects do not require a recursive call for each level.
  const completed = new Set<string>();
  for (const start of b.nodes) {
    const path = new Set<string>();
    let node: BookNode | undefined = start;
    while (node && !completed.has(node.id)) {
      if (path.has(node.id)) return false;
      path.add(node.id);
      node =
        node.type === "chapter" && node.parentId !== null
          ? nodes.get(node.parentId)
          : undefined;
    }
    for (const id of path) completed.add(id);
  }
  return true;
}

const parentOf = (node: BookNode): string | null =>
  node.type === "chapter" ? node.parentId : null;

function childrenByParent(book: Book): Map<string | null, BookNode[]> {
  const children = new Map<string | null, BookNode[]>();
  for (const node of book.nodes) {
    const parent = parentOf(node);
    const siblings = children.get(parent) ?? [];
    siblings.push(node);
    children.set(parent, siblings);
  }
  return children;
}

export interface OutlineEntry {
  node: BookNode;
  depth: number;
}
export interface OutlineIndex {
  nodesById: Map<string, BookNode>;
  childrenByParent: Map<string | null, BookNode[]>;
  entries: OutlineEntry[];
  positionById: Map<string, number>;
  subtreeEndById: Map<string, number>;
  numberById: Map<string, number>;
}
/** Construct once for an immutable nodes snapshot; no global cache hides mutations. */
export function createOutlineIndex(nodes: BookNode[]): OutlineIndex {
  const book = { nodes } as Book;
  const children = childrenByParent(book);
  const entries: OutlineEntry[] = [];
  const positionById = new Map<string, number>();
  const subtreeEndById = new Map<string, number>();
  const numberById = new Map<string, number>();
  let number = 0;
  for (const node of nodes)
    if (node.type === "chapter" && node.kind === "chapter")
      numberById.set(node.id, ++number);
  const pending: { node: BookNode; depth: number; exit?: boolean }[] = (
    children.get(null) || []
  )
    .map((node) => ({ node, depth: 0 }))
    .reverse();
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.exit) {
      subtreeEndById.set(entry.node.id, entries.length);
      continue;
    }
    if (positionById.has(entry.node.id)) continue;
    positionById.set(entry.node.id, entries.length);
    entries.push({ node: entry.node, depth: entry.depth });
    pending.push({ ...entry, exit: true });
    const nested = children.get(entry.node.id) || [];
    for (let index = nested.length - 1; index >= 0; index--)
      pending.push({ node: nested[index], depth: entry.depth + 1 });
  }
  return {
    nodesById: new Map(nodes.map((node) => [node.id, node])),
    childrenByParent: children,
    entries,
    positionById,
    subtreeEndById,
    numberById,
  };
}
/** Skip collapsed subtrees in one pass, without constructing every ancestor path. */
export function visibleOutlineEntries(
  index: OutlineIndex,
  collapsed: ReadonlySet<string>,
): OutlineEntry[] {
  const result: OutlineEntry[] = [];
  for (let cursor = 0; cursor < index.entries.length;) {
    const entry = index.entries[cursor];
    result.push(entry);
    cursor = collapsed.has(entry.node.id)
      ? index.subtreeEndById.get(entry.node.id) || cursor + 1
      : cursor + 1;
  }
  return result;
}

/** The array determines sibling order; parentId determines the outline. */
export function outlineEntries(
  book: Book,
  index?: OutlineIndex,
): OutlineEntry[] {
  return index?.entries || createOutlineIndex(book.nodes).entries;
}

/** All descendants in outline order, excluding the section itself. */
export function descendants(
  book: Book,
  id: string,
  index?: OutlineIndex,
): BookNode[] {
  if (index) {
    const start = index.positionById.get(id);
    return start === undefined
      ? []
      : index.entries
          .slice(start + 1, index.subtreeEndById.get(id))
          .map(({ node }) => node);
  }
  const children = childrenByParent(book);
  const pending = [...(children.get(id) ?? [])].reverse();
  const result: BookNode[] = [];
  const seen = new Set([id]);
  while (pending.length) {
    const node = pending.pop()!;
    if (seen.has(node.id)) continue;
    seen.add(node.id);
    result.push(node);
    const nested = children.get(node.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--) pending.push(nested[i]);
  }
  return result;
}

/** The enclosing sections from root to immediate parent. */
export function ancestors(
  book: Book,
  id: string,
  index?: OutlineIndex,
): BookNode[] {
  const nodes =
    index?.nodesById || new Map(book.nodes.map((node) => [node.id, node]));
  let parent = nodes.get(id);
  const result: BookNode[] = [];
  const seen = new Set([id]);
  while (parent && parentOf(parent) !== null) {
    parent = nodes.get(parentOf(parent)!);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    result.push(parent);
  }
  return result.reverse();
}

const orderedNodes = (book: Book) =>
  outlineEntries(book).map(({ node }) => node);

function subtree(book: Book, node: BookNode): BookNode[] {
  return [node, ...descendants(book, node.id)];
}

function afterSubtree(nodes: BookNode[], book: Book, id: string): number {
  const nested = descendants(book, id);
  const last = nested[nested.length - 1]?.id ?? id;
  return nodes.findIndex((node) => node.id === last) + 1;
}

export function insertChapter(book: Book, chapter: Chapter): Book {
  if (
    book.nodes.some((node) => node.id === chapter.id) ||
    (chapter.parentId !== null &&
      !book.nodes.some((node) => node.id === chapter.parentId))
  )
    return book;
  const nodes = orderedNodes(book);
  const index =
    chapter.parentId === null
      ? nodes.length
      : afterSubtree(nodes, book, chapter.parentId);
  nodes.splice(index, 0, chapter);
  return { ...book, nodes, modified: now() };
}

/** Move the entire section to the end of its new parent's children. */
export function reparentNode(
  book: Book,
  id: string,
  parentId: string | null,
): Book {
  const moving = book.nodes.find((node) => node.id === id);
  if (!moving || moving.type !== "chapter" || moving.parentId === parentId)
    return book;
  if (parentId !== null && !book.nodes.some((node) => node.id === parentId))
    return book;
  const group = subtree(book, moving);
  const ids = new Set(group.map((node) => node.id));
  if (parentId !== null && ids.has(parentId)) return book;
  const rest = orderedNodes(book).filter((node) => !ids.has(node.id));
  group[0] = { ...moving, parentId };
  const index =
    parentId === null
      ? rest.length
      : afterSubtree(rest, { ...book, nodes: rest }, parentId);
  rest.splice(index, 0, ...group);
  return { ...book, nodes: rest, modified: now() };
}

/** Remove only this section; all documents below it are retained. */
export function removeNodePreserveChildren(book: Book, id: string): Book {
  const removed = book.nodes.find((node) => node.id === id);
  if (!removed) return book;
  const parentId = parentOf(removed);
  const nodes = orderedNodes(book)
    .filter((node) => node.id !== id)
    .map((node) =>
      node.type === "chapter" && node.parentId === id
        ? { ...node, parentId }
        : node,
    );
  return { ...book, nodes, modified: now() };
}

export type OutlineDropPlacement = "before" | "inside" | "after" | "root";

/** Whether an outline drop can move a complete branch without creating a cycle. */
export function canMoveNode(
  book: Book,
  movingId: string,
  targetId: string | null,
  placement?: OutlineDropPlacement,
  index?: OutlineIndex,
): boolean {
  const moving =
    index?.nodesById.get(movingId) ||
    book.nodes.find((node) => node.id === movingId);
  if (!moving) return false;
  if (placement === "root") return true;
  const target =
    index?.nodesById.get(targetId || "") ||
    book.nodes.find((node) => node.id === targetId);
  if (!target || movingId === targetId) return false;
  if (index) {
    const start = index.positionById.get(movingId);
    const targetPosition = index.positionById.get(targetId || "");
    if (
      start !== undefined &&
      targetPosition !== undefined &&
      targetPosition > start &&
      targetPosition < (index.subtreeEndById.get(movingId) || 0)
    )
      return false;
  } else if (descendants(book, movingId).some((node) => node.id === targetId))
    return false;
  if (placement === "inside" && moving.type !== "chapter") return false;
  // Parts remain at the top level. A before/after drop on a nested section
  // therefore places a part beside the target's enclosing root branch.
  if (moving.type === "part" && parentOf(target) !== null) {
    const root = ancestors(book, target.id, index)[0];
    if (!root || root.id === movingId) return false;
  }
  return true;
}

export function moveNode(
  book: Book,
  movingId: string,
  targetId: string | null,
  placement?: OutlineDropPlacement,
): Book {
  if (!canMoveNode(book, movingId, targetId, placement)) return book;
  if (placement !== undefined) {
    const moving = book.nodes.find((node) => node.id === movingId)!;
    const target = book.nodes.find((node) => node.id === targetId);
    const group = subtree(book, moving);
    const ids = new Set(group.map((node) => node.id));
    const rest = orderedNodes(book).filter((node) => !ids.has(node.id));
    let parentId: string | null = null;
    let index = rest.length;
    if (placement !== "root" && target) {
      if (placement === "inside") {
        parentId = target.id;
        index = afterSubtree(rest, { ...book, nodes: rest }, target.id);
      } else {
        const anchor =
          moving.type === "part" && parentOf(target) !== null
            ? ancestors(book, target.id)[0]
            : target;
        parentId = parentOf(anchor);
        index =
          placement === "before"
            ? rest.findIndex((node) => node.id === anchor.id)
            : afterSubtree(rest, { ...book, nodes: rest }, anchor.id);
      }
    }
    if (index < 0) return book;
    if (moving.type === "chapter" && moving.parentId !== parentId)
      group[0] = { ...moving, parentId };
    rest.splice(index, 0, ...group);
    const current = orderedNodes(book);
    if (rest.every((node, i) => node === current[i])) return book;
    return { ...book, nodes: rest, modified: now() };
  }
  // Calls without a placement keep the established before-row / first-child
  // part behavior used by older integrations and saved-project workflows.
  if (movingId === targetId) return book;
  const moving = book.nodes.find((node) => node.id === movingId);
  const target = book.nodes.find((node) => node.id === targetId);
  if (!moving || !target) return book;
  const group = subtree(book, moving);
  const ids = new Set(group.map((node) => node.id));
  if (ids.has(target.id)) return book;
  const rest = orderedNodes(book).filter((node) => !ids.has(node.id));
  let beforeId = target.id;
  let index = rest.findIndex((node) => node.id === beforeId);
  if (moving.type === "chapter") {
    group[0] = {
      ...moving,
      parentId: target.type === "part" ? target.id : target.parentId,
    };
    // Dropping onto a part retains the existing first-child behavior.
    if (target.type === "part") index++;
  } else if (parentOf(target) !== null) {
    beforeId = ancestors(book, target.id)[0].id;
    index = rest.findIndex((node) => node.id === beforeId);
  }
  rest.splice(index, 0, ...group);
  return { ...book, nodes: rest, modified: now() };
}

export function moveRelative(book: Book, id: string, direction: -1 | 1): Book {
  const node = book.nodes.find((item) => item.id === id);
  if (!node) return book;
  const siblings = book.nodes.filter(
    (item) => parentOf(item) === parentOf(node),
  );
  const neighbor =
    siblings[siblings.findIndex((item) => item.id === id) + direction];
  if (!neighbor) return book;
  const group = subtree(book, node);
  const ids = new Set(group.map((item) => item.id));
  const rest = orderedNodes(book).filter((item) => !ids.has(item.id));
  const index =
    direction === -1
      ? rest.findIndex((item) => item.id === neighbor.id)
      : afterSubtree(rest, { ...book, nodes: rest }, neighbor.id);
  rest.splice(index, 0, ...group);
  return { ...book, nodes: rest, modified: now() };
}
