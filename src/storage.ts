import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { validateBook, type Book } from "./model";
export const desktop = isTauri();
const key = "codebook.library.v1",
  journal = "codebook.recovery.v1";
let queue = Promise.resolve();
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
    books = result.books.filter(validateBook);
    warnings = result.warnings;
    diskRecovery = result.recovery || [];
    if (books.length !== result.books.length)
      warnings.push(
        "Some projects have invalid content. They were left untouched in your library folder.",
      );
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
export async function stageBook(book: Book) {
  // Native recovery is independent of WebView2's delayed localStorage flush.
  if (desktop) await invoke("stage_book", { book });
  const pending = JSON.parse(localStorage.getItem(journal) || "{}");
  pending[book.id] = book;
  localStorage.setItem(journal, JSON.stringify(pending));
}
export async function clearRecovery(id: string, modified?: string) {
  if (desktop)
    await invoke("clear_recovery", { id, modified: modified || null });
  const pending = JSON.parse(localStorage.getItem(journal) || "{}");
  if (!modified || pending[id]?.modified <= modified) {
    delete pending[id];
    localStorage.setItem(journal, JSON.stringify(pending));
  }
}
export function saveBook(book: Book): Promise<void> {
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
  if (desktop) await invoke("delete_book", { id });
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
