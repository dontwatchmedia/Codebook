import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import type { DocumentChange } from "../../src/storage";
import {
  makeBook,
  makeChapter,
  type Book,
  type Chapter,
} from "../../src/model";

const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: mock.invoke,
  isTauri: () => true,
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
const text = (value: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text: value }],
});
function fixture() {
  const book = makeBook("Large reference");
  book.modified = "2026-01-01T00:00:00.000Z";
  (book.nodes[0] as Chapter).document = {
    type: "doc",
    content: [text("Original"), text("Untouched")],
  };
  book.nodes.push(makeChapter("Independent chapter"));
  return book;
}
function edit(book: Book, second: number, value: string): Book {
  const chapter = book.nodes[0] as Chapter;
  return {
    ...book,
    modified: `2026-01-01T00:00:0${second}.000Z`,
    nodes: [
      {
        ...chapter,
        document: {
          ...chapter.document,
          content: [text(value), ...chapter.document.content!.slice(1)],
        },
      },
      ...book.nodes.slice(1),
    ],
  };
}
function applyDocument(before: JSONContent, changes: DocumentChange[]) {
  let document = structuredClone(before);
  for (const change of changes) {
    if (change.kind === "replace" && !change.path.length) {
      document = structuredClone(change.node);
      continue;
    }
    let node = document;
    for (const index of change.kind === "replace"
      ? change.path.slice(0, -1)
      : change.path)
      node = node.content![index];
    if (change.kind === "replace")
      node.content![change.path.at(-1)!] = structuredClone(change.node);
    else
      node.content!.splice(
        change.from,
        change.deleteCount,
        ...structuredClone(change.content),
      );
  }
  return document;
}
beforeEach(() => {
  vi.resetModules();
  mock.invoke.mockReset();
  mock.invoke.mockResolvedValue(undefined);
  localStorage.clear();
});

describe("Immutable document deltas", () => {
  it("ignores native-sorted property order in attributes and mark metadata", async () => {
    const { documentChanges } = await import("../../src/storage");
    const before: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { color: "#112233", fontFamily: "Arial", fontSize: "11pt" },
          content: [
            {
              type: "text",
              text: "Original",
              marks: [
                {
                  attrs: { color: "#112233", fontFamily: "Arial" },
                  type: "textStyle",
                },
              ],
            },
          ],
        },
      ],
    };
    const after: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { fontSize: "11pt", fontFamily: "Arial", color: "#112233" },
          content: [
            {
              type: "text",
              text: "Edited",
              marks: [
                {
                  type: "textStyle",
                  attrs: { fontFamily: "Arial", color: "#112233" },
                },
              ],
            },
          ],
        },
      ],
    };
    const changes = documentChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toEqual([0, 0]);
    expect(applyDocument(before, changes)).toEqual(after);
  });
  it("sends a small changed text leaf in a very large chapter and retains all surrounding formatting", async () => {
    const { documentChanges } = await import("../../src/storage");
    const before: JSONContent = {
      type: "doc",
      content: Array.from({ length: 10000 }, (_, index) =>
        text(`Paragraph ${index}: ${"reference material ".repeat(25)}`),
      ),
    };
    const old = before.content![5000];
    old.content![0].marks = [
      {
        type: "textStyle",
        attrs: { fontFamily: "Arial", fontSize: "11pt", color: "#125599" },
      },
      { type: "bold" },
    ];
    const after = { ...before, content: [...before.content!] };
    after.content[5000] = {
      ...old,
      content: [{ ...old.content![0], text: old.content![0].text + "!" }],
    };
    const changes = documentChanges(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toEqual([5000, 0]);
    expect(JSON.stringify(changes).length).toBeLessThan(1000);
    expect(applyDocument(before, changes)).toEqual(after);
  });
  it("splices inserted/deleted blocks and patches separate nested table cells without resending neighbors", async () => {
    const { documentChanges } = await import("../../src/storage");
    const a = text("A"),
      b = text("B"),
      c = text("C");
    const before = { type: "doc", content: [a, b, c] };
    const inserted = {
      type: "heading",
      attrs: { level: 2, fontFamily: "Arial", fontSize: "16pt" },
      content: [{ type: "text", text: "Added" }],
    };
    for (const after of [
      { type: "doc", content: [a, inserted, b, c] },
      { type: "doc", content: [a, c] },
      { type: "doc", content: [] },
    ]) {
      const changes = documentChanges(before, after);
      expect(changes).toHaveLength(1);
      expect(changes[0].kind).toBe("splice");
      expect(applyDocument(before, changes)).toEqual(after);
    }
    const table: JSONContent = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", attrs: { colspan: 2 }, content: [a] },
                { type: "tableCell", content: [b] },
              ],
            },
          ],
        },
      ],
    };
    const changed = structuredClone(table);
    changed.content![0].content![0].content![0].content![0].content![0].text =
      "Edited cell";
    expect(applyDocument(table, documentChanges(table, changed))).toEqual(
      changed,
    );
  });
  it("keeps outline order, deletions, optional metadata and new sections in their patch", async () => {
    const { bookChanges } = await import("../../src/storage");
    const before = fixture();
    const newChapter = makeChapter("Added section");
    const after = {
      ...before,
      title: "New title",
      mode: "bible" as const,
      modified: "2026-01-01T00:00:01.000Z",
      nodes: [newChapter, { ...before.nodes[0], emoji: "✅" }],
    };
    const patch = bookChanges(before, after);
    expect(patch.fields).toEqual({ title: "New title", mode: "bible" });
    expect(patch.removed).toEqual([before.nodes[1].id]);
    expect(patch.order).toEqual(after.nodes.map((node) => node.id));
    expect(patch.nodes[0].node).toBe(newChapter);
    expect(patch.nodes[1].fields).toEqual({ emoji: "✅" });
    expect(patch.nodes[1].document).toBeUndefined();
  });
});

describe("Native incremental persistence", () => {
  async function loaded(book: Book) {
    const storage = await import("../../src/storage");
    mock.invoke.mockResolvedValueOnce({
      books: [book],
      recovery: [],
      warnings: [],
    });
    await storage.loadBooks();
    mock.invoke.mockClear();
    return storage;
  }
  it("sends only deltas while typing, checkpoints by id, and never serializes a native localStorage recovery copy", async () => {
    const original = fixture();
    const storage = await loaded(original);
    const writing = edit(original, 1, "Changed **text**");
    const localWrite = vi.spyOn(Storage.prototype, "setItem");
    await storage.stageBook(writing, original);
    await storage.saveBook(writing);
    expect(mock.invoke.mock.calls.map((call) => call[0])).toEqual([
      "stage_book_patch",
      "checkpoint_book",
    ]);
    const patch = mock.invoke.mock.calls[0][1].patch;
    expect(patch.nodes).toHaveLength(1);
    expect(patch.nodes[0].document[0].path).toEqual([0, 0]);
    expect(patch.nodes[0].node).toBeUndefined();
    expect(patch.order).toBeUndefined();
    expect(mock.invoke.mock.calls[1][1]).toEqual({
      id: original.id,
      modified: writing.modified,
    });
    expect(localWrite).not.toHaveBeenCalled();
  });
  it("serializes rapid edits and checkpoint requests against the last acknowledged revision", async () => {
    const original = fixture();
    const storage = await loaded(original);
    const first = edit(original, 1, "First"),
      second = edit(first, 2, "Second");
    let release!: () => void;
    mock.invoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const stagedFirst = storage.stageBook(first);
    const stagedSecond = storage.stageBook(second);
    const saved = storage.saveBook(second);
    await vi.waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
    release();
    await Promise.all([stagedFirst, stagedSecond, saved]);
    expect(mock.invoke.mock.calls.map((call) => call[0])).toEqual([
      "stage_book_patch",
      "stage_book_patch",
      "checkpoint_book",
    ]);
    expect(mock.invoke.mock.calls[1][1].patch.baseModified).toBe(
      first.modified,
    );
  });
  it("keeps the old acknowledged base after a failed write and retries all unsaved changes", async () => {
    const original = fixture();
    const storage = await loaded(original);
    mock.invoke.mockRejectedValueOnce("Disk is full");
    const first = edit(original, 1, "First"),
      second = edit(first, 2, "Second");
    await expect(storage.stageBook(first)).rejects.toBe("Disk is full");
    await storage.stageBook(second);
    expect(mock.invoke.mock.calls.map((call) => call[0])).toEqual([
      "stage_book_patch",
      "stage_book_patch",
    ]);
    expect(mock.invoke.mock.calls[1][1].patch.baseModified).toBe(
      original.modified,
    );
    expect(
      mock.invoke.mock.calls[1][1].patch.nodes[0].document[0].node.text,
    ).toBe("Second");
  });
  it("resynchronizes a recovery revision conflict once, without swallowing normal write failures", async () => {
    const original = fixture();
    const storage = await loaded(original);
    mock.invoke.mockRejectedValueOnce(
      "REVISION_CONFLICT: recovered base differs",
    );
    const writing = edit(original, 1, "Recovered");
    await storage.stageBook(writing);
    expect(mock.invoke.mock.calls.map((call) => call[0])).toEqual([
      "stage_book_patch",
      "stage_book",
    ]);
    expect(mock.invoke.mock.calls[1][1].book).toBe(writing);
  });
  it("refuses invalid changed content before IPC and retains the last good revision", async () => {
    const original = fixture();
    const storage = await loaded(original);
    const broken = edit(original, 1, "Bad");
    (broken.nodes[0] as Chapter).document.content![0].content![0].marks = [
      { type: "link", attrs: { href: "javascript:alert(1)" } },
    ];
    await expect(storage.saveBook(broken)).rejects.toThrow("validation");
    expect(mock.invoke).not.toHaveBeenCalled();
    await storage.stageBook(edit(original, 2, "Safe"));
    expect(mock.invoke.mock.calls[0][1].patch.baseModified).toBe(
      original.modified,
    );
  });
  it("retains legacy recovery when a checkpoint fails and migrates it only after success", async () => {
    const original = fixture();
    const writing = edit(original, 1, "Recovered");
    localStorage.setItem(
      "codebook.recovery.v1",
      JSON.stringify({ [writing.id]: writing }),
    );
    const storage = await loaded(original);
    mock.invoke
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce("Checkpoint failed");
    await expect(storage.saveBook(writing)).rejects.toBe("Checkpoint failed");
    expect(localStorage.getItem("codebook.recovery.v1")).toContain("Recovered");
    await storage.saveBook(writing);
    expect(localStorage.getItem("codebook.recovery.v1")).toBe("{}");
  });
});
