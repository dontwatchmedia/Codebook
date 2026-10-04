import type { JSONContent } from "@tiptap/core";
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
]);
export function validateDocument(doc: JSONContent, depth = 0): boolean {
  if (
    !doc ||
    typeof doc !== "object" ||
    depth > 50 ||
    !allowedNodes.has(doc.type ?? "")
  )
    return false;
  if (doc.type === "text" && typeof doc.text !== "string") return false;
  if (
    doc.marks &&
    (!Array.isArray(doc.marks) ||
      doc.marks.some((m) => !allowedMarks.has(m.type)))
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
  if (doc.type === "heading" && ![1, 2, 3, 4].includes(doc.attrs?.level))
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
      doc.content.every((n) => validateDocument(n, depth + 1)))
  );
}
export function validateBook(value: unknown): value is Book {
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
      (n.document?.type !== "doc" || !validateDocument(n.document))
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

/** The array determines sibling order; parentId determines the outline. */
export function outlineEntries(book: Book): OutlineEntry[] {
  const children = childrenByParent(book);
  const pending = (children.get(null) ?? [])
    .map((node) => ({ node, depth: 0 }))
    .reverse();
  const entries: OutlineEntry[] = [];
  const seen = new Set<string>();
  while (pending.length) {
    const entry = pending.pop()!;
    if (seen.has(entry.node.id)) continue;
    seen.add(entry.node.id);
    entries.push(entry);
    const nested = children.get(entry.node.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--)
      pending.push({ node: nested[i], depth: entry.depth + 1 });
  }
  return entries;
}

/** All descendants in outline order, excluding the section itself. */
export function descendants(book: Book, id: string): BookNode[] {
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
export function ancestors(book: Book, id: string): BookNode[] {
  const nodes = new Map(book.nodes.map((node) => [node.id, node]));
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

export function moveNode(book: Book, movingId: string, targetId: string): Book {
  if (movingId === targetId) return book;
  const moving = book.nodes.find((node) => node.id === movingId);
  const target = book.nodes.find((node) => node.id === targetId);
  if (!moving || !target) return book;
  const group = subtree(book, moving);
  const ids = new Set(group.map((node) => node.id));
  if (ids.has(targetId)) return book;
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
