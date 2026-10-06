import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  ancestors,
  bookWords,
  cachedBookWords,
  cachedDocumentStats,
  cachedValidateBook,
  createOutlineIndex,
  descendants,
  docText,
  makeBook,
  makeChapter,
  outlineEntries,
  validateBook,
  visibleOutlineEntries,
  wordCount,
  type Chapter,
} from "../../src/model";
import { cachedEstimatePDFPages, estimatePDFPages } from "../../src/pdf";

const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});
describe("immutable document statistics", () => {
  it("matches existing counts across split marks, empty nodes, Unicode whitespace, code, lists and tables", () => {
    const document: JSONContent = {
      type: "doc",
      content: [
        paragraph(
          text("hel"),
          { ...text("lo"), marks: [{ type: "bold" }] },
          text(" world\u00a0\u2003two"),
        ),
        paragraph(),
        paragraph(text("before"), { type: "hardBreak" }, text("after")),
        { type: "codeBlock", content: [text("const word = 2;\n  // remark")] },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [paragraph(text("nested")), paragraph(text("words"))],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [paragraph(text("cell"))] },
                { type: "tableCell", content: [paragraph(text("two"))] },
              ],
            },
          ],
        },
      ],
    };
    expect(cachedDocumentStats(document)).toMatchObject({
      words: wordCount(document),
      characters: docText(document).length,
    });
    const before = cachedDocumentStats(document);
    expect(cachedDocumentStats(document)).toBe(before);
    const next = {
      ...document,
      content: [...document.content!, paragraph(text("new words"))],
    };
    expect(cachedDocumentStats(next)).toMatchObject({
      words: before.words + 2,
      characters: docText(next).length,
    });
    expect(cachedDocumentStats(document)).toBe(before);
  });
  it("does not revisit unchanged branches after editing one paragraph", () => {
    let reads = 0;
    const unchanged = paragraph({
      type: "text",
      get text() {
        reads++;
        return "unchanged large chapter words";
      },
    });
    const first = {
      type: "doc",
      content: [unchanged, paragraph(text("old value"))],
    };
    expect(cachedDocumentStats(first).words).toBe(6);
    const initialReads = reads;
    const next = {
      ...first,
      content: [unchanged, paragraph(text("new value with more words"))],
    };
    expect(cachedDocumentStats(next).words).toBe(9);
    expect(reads).toBe(initialReads);
    const book = makeBook("Cached totals");
    (book.nodes[0] as Chapter).document = first;
    expect(cachedBookWords(book)).toBe(bookWords(book));
    const changed = {
      ...book,
      nodes: [{ ...book.nodes[0], document: next } as Chapter],
    };
    expect(cachedBookWords(changed)).toBe(9);
  });
  it("keeps public counts and validation fresh for mutable fixtures while cached validation checks changed branches", () => {
    const book = makeBook("Mutable callers");
    const chapter = book.nodes[0] as Chapter;
    chapter.document = { type: "doc", content: [paragraph(text("one"))] };
    expect(cachedValidateBook(book)).toBe(true);
    expect(bookWords(book)).toBe(1);
    chapter.document.content![0].content![0].text = "one two three";
    expect(wordCount(chapter.document)).toBe(3);
    expect(bookWords(book)).toBe(3);
    const invalid = {
      ...book,
      nodes: [
        {
          ...chapter,
          document: {
            ...chapter.document,
            content: [
              paragraph({ type: "text", text: 10 as unknown as string }),
            ],
          },
        },
      ],
    };
    expect(cachedValidateBook(invalid)).toBe(false);
    expect(validateBook(invalid)).toBe(false);
    chapter.title = 123 as unknown as string;
    expect(cachedValidateBook(book)).toBe(false);
  });
});

describe("shared outline indexing", () => {
  it("retains 2,500 levels and skips a collapsed subtree without ancestor construction", () => {
    const book = makeBook("Deep tree", "bible");
    book.nodes = Array.from({ length: 2500 }, (_, index) => ({
      ...makeChapter(`Section ${index}`, index ? `section-${index - 1}` : null),
      id: `section-${index}`,
    }));
    const index = createOutlineIndex(book.nodes);
    expect(outlineEntries(book, index)).toBe(index.entries);
    expect(index.entries.at(-1)?.depth).toBe(2499);
    expect(index.subtreeEndById.get("section-0")).toBe(2500);
    expect(ancestors(book, "section-2499", index)).toHaveLength(2499);
    expect(descendants(book, "section-0", index)).toHaveLength(2499);
    expect(
      visibleOutlineEntries(index, new Set(["section-3"])).map(
        ({ node }) => node.id,
      ),
    ).toEqual(["section-0", "section-1", "section-2", "section-3"]);
    (book.nodes[1] as Chapter).parentId = null;
    expect(ancestors(book, "section-1")).toEqual([]);
  });
  it("preserves sibling order and source chapter numbering in noncontiguous arrays", () => {
    const book = makeBook("Tree order");
    book.nodes = [
      { ...makeChapter("Child", "root"), id: "child" },
      { ...makeChapter("Root"), id: "root" },
      { ...makeChapter("Second"), id: "second" },
      { ...makeChapter("Grandchild", "child"), id: "grandchild" },
    ];
    const index = createOutlineIndex(book.nodes);
    expect(index.entries.map(({ node }) => node.id)).toEqual([
      "root",
      "child",
      "grandchild",
      "second",
    ]);
    expect(index.numberById.get("child")).toBe(1);
    expect(index.numberById.get("root")).toBe(2);
    expect(
      visibleOutlineEntries(index, new Set(["child"])).map(
        ({ node }) => node.id,
      ),
    ).toEqual(["root", "child", "second"]);
  });
});

describe("cached layout estimates", () => {
  it("reuses unchanged paragraphs and matches mutation-fresh estimates for all settings", () => {
    let reads = 0;
    const stable = paragraph({
      type: "text",
      get text() {
        reads++;
        return "Long design text ".repeat(300);
      },
    });
    const book = makeBook("Cached pages");
    const chapter = book.nodes[0] as Chapter;
    chapter.document = {
      type: "doc",
      content: [stable, paragraph(text("short"))],
    };
    expect(cachedEstimatePDFPages(book)).toBe(estimatePDFPages(book));
    const initialReads = reads;
    const changed = {
      ...book,
      nodes: [
        {
          ...chapter,
          document: {
            ...chapter.document,
            content: [stable, paragraph(text("Changed writing ".repeat(60)))],
          },
        },
      ],
    };
    cachedEstimatePDFPages(changed);
    expect(reads).toBe(initialReads);
    for (const paper of ["letter", "a4"] as const)
      for (const compactSpacing of [true, false])
        for (const startChaptersOnNewPage of [true, false])
          expect(
            cachedEstimatePDFPages(changed, {
              paper,
              compactSpacing,
              startChaptersOnNewPage,
            }),
          ).toBe(
            estimatePDFPages(changed, {
              paper,
              compactSpacing,
              startChaptersOnNewPage,
            }),
          );
    chapter.document.content!.push(
      paragraph(text("Extra writing ".repeat(1000))),
    );
    expect(estimatePDFPages(book)).toBeGreaterThan(1);
  });
});
