import { beforeEach, describe, expect, it } from "vitest";
import { exportHTML, exportMarkdown } from "../../src/export";
import {
  isValidSectionEmoji,
  makeBook,
  makeChapter,
  normalizeSectionEmoji,
  validateBook,
  type Chapter,
} from "../../src/model";
import { getBackups, loadBooks, saveBook, stageBook } from "../../src/storage";

describe("Optional section emoji", () => {
  it.each([
    "🎮",
    "✅",
    "☑️",
    "🏗️",
    "👍🏽",
    "👩🏽‍💻",
    "👨‍👩‍👧‍👦",
    "🇺🇸",
    "1️⃣",
    "❤️",
    "🐦‍🔥",
    "🏳️‍🌈",
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  ])("accepts the complete emoji grapheme %s", (emoji) => {
    expect(isValidSectionEmoji(emoji)).toBe(true);
    expect(normalizeSectionEmoji(emoji)).toBe(emoji);
    const book = makeBook("Emoji project");
    (book.nodes[0] as Chapter).emoji = emoji;
    expect(validateBook(book)).toBe(true);
  });

  it.each([
    null,
    7,
    {},
    "<img src=x onerror=bad()>",
    "✅<script>",
    "done",
    "✅✅",
    "✅ text",
    "🎮\n🏠",
    "🎮\u202e",
    "🏽",
    "\u200D",
    "1",
    "🇺",
    "⚽🏽",
    "🎮 ",
    "\ud800",
    "👨‍".repeat(20),
  ])("rejects invalid or unsafe emoji fields %#", (emoji) => {
    expect(isValidSectionEmoji(emoji)).toBe(false);
    const book = makeBook("Safe project");
    (book.nodes[0] as Chapter).emoji = emoji as string;
    expect(validateBook(book)).toBe(false);
  });

  it("normalizes picker whitespace and keeps clear markers and legacy projects valid", () => {
    expect(normalizeSectionEmoji("  🎮  ")).toBe("🎮");
    expect(normalizeSectionEmoji(" \n ")).toBe("");
    expect(normalizeSectionEmoji("not an emoji")).toBeNull();
    const book = makeBook("Legacy project");
    expect((book.nodes[0] as Chapter).emoji).toBeUndefined();
    expect(validateBook(book)).toBe(true);
    (book.nodes[0] as Chapter).emoji = "";
    expect(validateBook(book)).toBe(true);
    expect(exportMarkdown(book)).toContain("# Your first chapter");
  });

  it("includes chapter emoji in book headings and linked HTML contents", () => {
    const book = makeBook("Book");
    const chapter = book.nodes[0] as Chapter;
    chapter.title = "Design notes";
    chapter.emoji = "📝";
    expect(exportMarkdown(book)).toContain("# 📝 Design notes");
    const html = new DOMParser().parseFromString(exportHTML(book), "text/html");
    expect(html.querySelector("nav a")?.textContent).toBe("📝 Design notes");
    expect(
      html.getElementById(chapter.id)?.querySelector("h1")?.textContent,
    ).toBe("📝 Design notes");
  });

  it("keeps custom emoji independent of system icons and progress in nested exports", () => {
    const book = makeBook("Game", "bible");
    const overview = book.nodes[0] as Chapter;
    overview.emoji = "🎮";
    overview.icon = "gamepad";
    overview.progress = "complete";
    const child = makeChapter("Living City", overview.id);
    child.emoji = "🏡";
    child.icon = "users";
    child.progress = "blocked";
    book.nodes.push(child);
    const markdown = exportMarkdown(book);
    expect(markdown).toContain("## 1 🎮 🎮 Overview");
    expect(markdown).toContain("### 1.1 👥 🏡 Living City");
    expect(markdown).toContain("**Status:** Complete");
    expect(markdown).toContain("**Status:** Blocked");
    const html = new DOMParser().parseFromString(exportHTML(book), "text/html");
    expect(
      html.getElementById(child.id)?.querySelector("h3")?.textContent,
    ).toBe("1.1 👥 🏡 Living City");
    expect(html.querySelector(`nav a[href="#${child.id}"]`)?.textContent).toBe(
      "1.1 👥 🏡 Living City",
    );
  });

  it("omits invalid emoji data defensively from HTML and Markdown", () => {
    const book = makeBook("Safe export");
    const chapter = book.nodes[0] as Chapter;
    chapter.emoji = '<img src=x onerror="bad()">';
    expect(validateBook(book)).toBe(false);
    expect(exportHTML(book)).not.toContain("onerror");
    expect(exportMarkdown(book)).not.toContain("onerror");
  });
});

describe("Emoji project portability and recovery", () => {
  beforeEach(() => localStorage.clear());

  it.each(["blank", "bible"])(
    "preserves optional markers in %s saves, project copies, recovery and backups",
    async (template) => {
      const book = makeBook("Persistent marker", template);
      const chapter = book.nodes[0] as Chapter;
      chapter.emoji = "👩🏽‍💻";
      chapter.icon = "code";
      chapter.progress = "in-progress";
      book.modified = "2026-01-01T00:00:00.000Z";
      const portable = JSON.parse(JSON.stringify(book));
      expect(validateBook(portable)).toBe(true);
      expect(portable).toEqual(book);
      await saveBook(portable);
      expect((await loadBooks()).books[0]).toEqual(book);
      const draft = {
        ...book,
        modified: "2026-01-02T00:00:00.000Z",
        nodes: [{ ...chapter, emoji: "✅", progress: "complete" as const }],
      };
      stageBook(draft);
      expect((await loadBooks()).recovery[0]).toEqual(draft);
      await saveBook(draft);
      expect((await loadBooks()).books[0]).toEqual(draft);
      expect((await loadBooks()).recovery).toHaveLength(0);
      expect((await getBackups(book.id))[0].book).toEqual(book);
    },
  );

  it("rejects invalid emoji saves while retaining the previous writing", async () => {
    const book = makeBook("Safe writing");
    (book.nodes[0] as Chapter).emoji = "🎮";
    await saveBook(book);
    const invalid = {
      ...book,
      nodes: [{ ...(book.nodes[0] as Chapter), emoji: "🎮📝" }],
    };
    await expect(saveBook(invalid)).rejects.toThrow("validation");
    expect((await loadBooks()).books[0]).toEqual(book);
  });
});
