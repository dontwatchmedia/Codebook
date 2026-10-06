import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { JSONContent } from "@tiptap/core";
import {
  cachedValidateBook,
  validateBook,
  type Book,
  type BookNode,
} from "./model";
export const desktop = isTauri();
const key = "codebook.library.v1",
  journal = "codebook.recovery.v1";
let queue = Promise.resolve();
const nativeHeads = new Map<string, Book>();
let legacyRecoveryPresent = false;
export type DocumentChange =
  | { kind: "replace"; path: number[]; node: JSONContent }
  | {
      kind: "splice";
      path: number[];
      from: number;
      deleteCount: number;
      content: JSONContent[];
    };
export interface NodeChange {
  id: string;
  node?: BookNode;
  fields?: Record<string, unknown>;
  unset?: string[];
  document?: DocumentChange[];
}
export interface BookPatch {
  id: string;
  baseModified: string;
  modified: string;
  fields: Record<string, unknown>;
  unset: string[];
  nodes: NodeChange[];
  removed: string[];
  order?: string[];
}
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const a = left as Record<string, unknown>,
    b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameValue(a[key], b[key]),
    )
  );
}
function changedFields(before: object, after: object, excluded: string[]) {
  const old = before as Record<string, unknown>,
    next = after as Record<string, unknown>;
  const fields: Record<string, unknown> = {},
    unset: string[] = [];
  for (const key of Object.keys(next))
    if (!excluded.includes(key) && !sameValue(old[key], next[key]))
      fields[key] = next[key];
  for (const key of Object.keys(old))
    if (!excluded.includes(key) && !(key in next)) unset.push(key);
  return { fields, unset };
}
/** Immutable editor JSON lets ordinary typing send only the changed text node. */
export function documentChanges(
  before: JSONContent,
  after: JSONContent,
  path: number[] = [],
): DocumentChange[] {
  if (before === after) return [];
  const fields = changedFields(before, after, ["content"]);
  if (
    Object.keys(fields.fields).length ||
    fields.unset.length ||
    !!before.content !== !!after.content
  )
    return [{ kind: "replace", path, node: after }];
  const old = before.content || [],
    next = after.content || [];
  let first = 0;
  while (
    first < old.length &&
    first < next.length &&
    old[first] === next[first]
  )
    first++;
  let oldEnd = old.length,
    nextEnd = next.length;
  while (
    oldEnd > first &&
    nextEnd > first &&
    old[oldEnd - 1] === next[nextEnd - 1]
  ) {
    oldEnd--;
    nextEnd--;
  }
  if (oldEnd - first !== nextEnd - first)
    return [
      {
        kind: "splice",
        path,
        from: first,
        deleteCount: oldEnd - first,
        content: next.slice(first, nextEnd),
      },
    ];
  const changes: DocumentChange[] = [];
  for (let index = first; index < nextEnd; index++)
    changes.push(...documentChanges(old[index], next[index], [...path, index]));
  return changes;
}
export function bookChanges(before: Book, after: Book): BookPatch {
  const previous = new Map(before.nodes.map((node) => [node.id, node]));
  const currentIds = new Set(after.nodes.map((node) => node.id));
  const nodes: NodeChange[] = [];
  for (const node of after.nodes) {
    const old = previous.get(node.id);
    if (old === node) continue;
    if (!old || old.type !== node.type) {
      nodes.push({ id: node.id, node });
      continue;
    }
    const fields = changedFields(old, node, ["id", "type", "document"]);
    const document =
      old.type === "chapter" && node.type === "chapter"
        ? documentChanges(old.document, node.document)
        : [];
    if (
      Object.keys(fields.fields).length ||
      fields.unset.length ||
      document.length
    )
      nodes.push({
        id: node.id,
        ...fields,
        ...(document.length ? { document } : {}),
      });
  }
  const sameOrder =
    before.nodes.length === after.nodes.length &&
    before.nodes.every((node, index) => node.id === after.nodes[index].id);
  return {
    id: after.id,
    baseModified: before.modified,
    modified: after.modified,
    ...changedFields(before, after, ["id", "version", "nodes", "modified"]),
    nodes,
    removed: before.nodes
      .filter((node) => !currentIds.has(node.id))
      .map((node) => node.id),
    ...(!sameOrder ? { order: after.nodes.map((node) => node.id) } : {}),
  };
}
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const task = queue.catch(() => {}).then(work);
  queue = task.then(
    () => {},
    () => {},
  );
  return task;
}
async function stageNative(book: Book, previous?: Book): Promise<void> {
  if (!cachedValidateBook(book))
    throw new Error(
      "The manuscript did not pass validation. Your previous save is safe.",
    );
  const old = nativeHeads.get(book.id) || previous;
  if (old === book || (old && old.modified > book.modified)) return;
  if (old && old.modified < book.modified) {
    try {
      await invoke("stage_book_patch", { patch: bookChanges(old, book) });
    } catch (error) {
      // A recovered project or interrupted acknowledgement may need one full resync.
      // Disk/validation failures must remain visible; do not hide them by retrying.
      if (!String(error).includes("REVISION_CONFLICT")) throw error;
      await invoke("stage_book", { book });
    }
  } else await invoke("stage_book", { book });
  nativeHeads.set(book.id, book);
}
export interface Backup {
  name: string;
  modified: string;
  book: Book;
}
export async function loadBooks(): Promise<{
  books: Book[];
  recovery: Book[];
  warnings: string[];
}> {
  let books: Book[] = [],
    warnings: string[] = [];
  let diskRecovery: Book[] = [];
  if (desktop) {
    const result = await invoke<{
      books: Book[];
      warnings: string[];
      recovery: Book[];
    }>("load_library");
    books = result.books.filter(cachedValidateBook);
    warnings = result.warnings;
    diskRecovery = result.recovery || [];
    if (books.length !== result.books.length)
      warnings.push(
        "Some projects have invalid content. They were left untouched in your library folder.",
      );
    for (const book of books) nativeHeads.set(book.id, book);
  } else {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || !parsed.every(validateBook))
        throw new Error(
          "Your library could not be read. The stored data has been left untouched.",
        );
      books = parsed;
    }
  }
  const pending = JSON.parse(localStorage.getItem(journal) || "{}") as Record<
    string,
    Book
  >;
  legacyRecoveryPresent = Object.keys(pending).length > 0;
  for (const b of diskRecovery)
    if (
      validateBook(b) &&
      (!pending[b.id] || pending[b.id].modified < b.modified)
    )
      pending[b.id] = b;
  const recovery = Object.values(pending).filter(
    (b) =>
      validateBook(b) &&
      (!books.find((x) => x.id === b.id) ||
        b.modified > books.find((x) => x.id === b.id)!.modified),
  );
  return { books, recovery, warnings };
}
export async function stageBook(book: Book, previous?: Book) {
  // Native recovery is independent of WebView2's delayed localStorage flush.
  if (desktop) return enqueue(() => stageNative(book, previous));
  const pending = JSON.parse(localStorage.getItem(journal) || "{}");
  pending[book.id] = book;
  localStorage.setItem(journal, JSON.stringify(pending));
}
export async function clearRecovery(id: string, modified?: string) {
  if (desktop) {
    await enqueue(async () => {
      await invoke("clear_recovery", { id, modified: modified || null });
      if (!modified) nativeHeads.delete(id);
    });
    if (!legacyRecoveryPresent) return;
  }
  const pending = JSON.parse(localStorage.getItem(journal) || "{}");
  if (!modified || pending[id]?.modified <= modified) {
    delete pending[id];
    localStorage.setItem(journal, JSON.stringify(pending));
    legacyRecoveryPresent = Object.keys(pending).length > 0;
  }
}
export function saveBook(book: Book): Promise<void> {
  if (desktop)
    return enqueue(async () => {
      await stageNative(book);
      await invoke("checkpoint_book", { id: book.id, modified: book.modified });
      // Old browser journals are migrated once; new native edits never duplicate
      // the entire manuscript in synchronous localStorage.
      if (legacyRecoveryPresent) {
        const pending = JSON.parse(localStorage.getItem(journal) || "{}");
        if (pending[book.id]?.modified <= book.modified)
          delete pending[book.id];
        localStorage.setItem(journal, JSON.stringify(pending));
        legacyRecoveryPresent = Object.keys(pending).length > 0;
      }
    });
  if (!validateBook(book))
    return Promise.reject(
      new Error(
        "The manuscript did not pass validation. Your previous save is safe.",
      ),
    );
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (desktop) await invoke("save_book", { book });
      else {
        const books: Book[] = JSON.parse(localStorage.getItem(key) || "[]");
        const old = books.find((b) => b.id === book.id);
        if (old && old.modified > book.modified) return;
        if (old) {
          const backups: Backup[] = JSON.parse(
            localStorage.getItem(`codebook.backups.${book.id}`) || "[]",
          );
          if (
            !backups[0] ||
            Date.now() - Date.parse(backups[0].modified) > 300000
          ) {
            backups.unshift({
              name: old.modified,
              modified: old.modified,
              book: old,
            });
            localStorage.setItem(
              `codebook.backups.${book.id}`,
              JSON.stringify(backups.slice(0, 30)),
            );
          }
        }
        localStorage.setItem(
          key,
          JSON.stringify([...books.filter((b) => b.id !== book.id), book]),
        );
      }
      await clearRecovery(book.id, book.modified);
    });
  queue = task;
  return task;
}
export async function deleteBook(id: string) {
  await queue.catch(() => {});
  if (desktop)
    await enqueue(async () => {
      await invoke("delete_book", { id });
      nativeHeads.delete(id);
    });
  else {
    const books: Book[] = JSON.parse(localStorage.getItem(key) || "[]");
    localStorage.setItem(
      `codebook.deleted.${id}`,
      JSON.stringify(books.find((b) => b.id === id)),
    );
    localStorage.setItem(key, JSON.stringify(books.filter((b) => b.id !== id)));
  }
  await clearRecovery(id);
}
export async function getBackups(id: string): Promise<Backup[]> {
  return desktop
    ? invoke("list_backups", { id })
    : JSON.parse(localStorage.getItem(`codebook.backups.${id}`) || "[]");
}
export async function saveFile(
  filename: string,
  content: string,
  mime: string,
): Promise<boolean> {
  if (desktop) {
    const path = await save({
      defaultPath: filename,
      filters: [
        { name: "Manuscript", extensions: [filename.split(".").pop()!] },
      ],
    });
    if (!path) return false;
    await invoke("write_export", { path, content });
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  return true;
}
export async function storagePath() {
  return desktop
    ? invoke<string>("storage_path")
    : "This browser’s local storage. Download a CodeBook project for an independent backup.";
}
