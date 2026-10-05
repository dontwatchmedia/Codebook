import { beforeEach, describe, expect, it, vi } from "vitest";

const key = "codebook.readingState.v1";
const position = { anchor: 70, head: 82, scrollTop: 450.5, scrollLeft: 12 };
let reading: typeof import("../../src/editor/readingState");

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
  reading = await import("../../src/editor/readingState");
});

describe("remembered reading position", () => {
  it("keeps independent lightweight positions and last chapters per book", async () => {
    reading.saveReadingState("book-a", "chapter", position);
    reading.saveReadingState("book-b", "chapter", { ...position, head: 91 });
    reading.rememberChapter("book-a", "chapter");
    reading.rememberChapter("book-b", "other");
    expect(reading.readReadingState("book-a", "chapter")).toEqual(position);
    expect(reading.readReadingState("book-b", "chapter")?.head).toBe(91);
    expect(reading.readLastChapter("book-a")).toBe("chapter");
    expect(reading.readLastChapter("book-b")).toBe("other");
    vi.resetModules();
    const reopened = await import("../../src/editor/readingState");
    expect(reopened.readReadingState("book-a", "chapter")).toEqual(position);
    expect(reopened.readLastChapter("book-b")).toBe("other");
  });

  it("ignores corrupt storage and invalid records instead of blocking writing", async () => {
    localStorage.setItem(key, "broken JSON");
    expect(reading.readReadingState("book", "chapter")).toBeNull();
    expect(reading.readLastChapter("book")).toBeNull();
    reading.saveReadingState("book", "chapter", { ...position, anchor: -1 });
    expect(localStorage.getItem(key)).toBe("broken JSON");
    vi.resetModules();
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        positions: [
          { bookId: "book", chapterId: "chapter", ...position, head: "bad" },
        ],
        lastChapters: [{ bookId: "book", chapterId: null }],
      }),
    );
    const reopened = await import("../../src/editor/readingState");
    expect(reopened.readReadingState("book", "chapter")).toBeNull();
    expect(reopened.readLastChapter("book")).toBeNull();
  });

  it("resumes within the session even when browser storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    reading.saveReadingState("book", "chapter", position);
    reading.rememberChapter("book", "chapter");
    expect(reading.readReadingState("book", "chapter")).toEqual(position);
    expect(reading.readLastChapter("book")).toBe("chapter");
    const returned = reading.readReadingState("book", "chapter")!;
    returned.head = 1;
    expect(reading.readReadingState("book", "chapter")?.head).toBe(82);
  });

  it("bounds the stored history and retains the most recently visited writing", () => {
    for (let index = 0; index < 510; index++) {
      reading.saveReadingState("book", `chapter-${index}`, position);
      reading.rememberChapter(`book-${index}`, `chapter-${index}`);
    }
    expect(reading.readReadingState("book", "chapter-0")).toBeNull();
    expect(reading.readReadingState("book", "chapter-509")).toEqual(position);
    expect(reading.readLastChapter("book-0")).toBeNull();
    expect(reading.readLastChapter("book-509")).toBe("chapter-509");
    const saved = JSON.parse(localStorage.getItem(key)!);
    expect(saved.positions).toHaveLength(500);
    expect(saved.lastChapters).toHaveLength(100);
  });
});
