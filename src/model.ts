import type { JSONContent } from "@tiptap/core";
export type Status =
  "Idea" | "Outline" | "Draft" | "Revision" | "Editing" | "Final";
export interface Chapter {
  id: string;
  type: "chapter";
  title: string;
  parentId: string | null;
  kind: "chapter" | "front" | "back";
  status: Status;
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
    id: uid(),
    title,
    subtitle: "",
    author: "",
    description: "",
    language: "en-US",
    created: now(),
    modified: now(),
    goal: 50000,
    color: "#314d43",
    nodes:
      template === "blank"
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
  }
  return (
    chapters(b).length > 0 &&
    chapters(b).every(
      (c) =>
        !c.parentId ||
        b.nodes.some((n) => n.type === "part" && n.id === c.parentId),
    )
  );
}
export function moveNode(book: Book, movingId: string, targetId: string): Book {
  if (movingId === targetId) return book;
  const moving = book.nodes.find((n) => n.id === movingId),
    target = book.nodes.find((n) => n.id === targetId);
  if (
    !moving ||
    !target ||
    (moving.type === "part" &&
      target.type === "chapter" &&
      target.parentId === moving.id)
  )
    return book;
  const group =
    moving.type === "part"
      ? book.nodes.filter(
          (n) =>
            n.id === movingId ||
            (n.type === "chapter" && n.parentId === movingId),
        )
      : [moving];
  const rest = book.nodes.filter((n) => !group.includes(n));
  let index = rest.findIndex((n) => n.id === targetId);
  if (moving.type === "chapter") {
    group[0] = {
      ...moving,
      parentId: target.type === "part" ? target.id : target.parentId,
    };
    if (target.type === "part") index++;
  } else if (target.type === "chapter" && target.parentId)
    index = rest.findIndex((n) => n.id === target.parentId);
  rest.splice(index, 0, ...group);
  return { ...book, nodes: rest, modified: now() };
}
export function moveRelative(book: Book, id: string, direction: -1 | 1): Book {
  const node = book.nodes.find((n) => n.id === id);
  if (!node) return book;
  const siblings = book.nodes.filter((n) =>
    node.type === "part"
      ? n.type === "part" || (n.type === "chapter" && !n.parentId)
      : n.type === "chapter" && n.parentId === node.parentId,
  );
  const neighbor = siblings[siblings.findIndex((n) => n.id === id) + direction];
  if (!neighbor) return book;
  const group = (n: BookNode) =>
    book.nodes.filter(
      (x) =>
        x.id === n.id ||
        (n.type === "part" && x.type === "chapter" && x.parentId === n.id),
    );
  const a = group(node),
    b = group(neighbor),
    nodes = [...book.nodes];
  const start = Math.min(nodes.indexOf(a[0]), nodes.indexOf(b[0]));
  const between = nodes
    .slice(
      start,
      Math.max(nodes.indexOf(a[a.length - 1]), nodes.indexOf(b[b.length - 1])) +
        1,
    )
    .filter((n) => !a.includes(n) && !b.includes(n));
  nodes.splice(
    start,
    a.length + b.length + between.length,
    ...(direction === -1 ? [...a, ...between, ...b] : [...b, ...between, ...a]),
  );
  return { ...book, nodes, modified: now() };
}
