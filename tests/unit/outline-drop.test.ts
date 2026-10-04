import { describe, expect, it } from "vitest";
import { outlineDropPlacement } from "../../src/components/OutlineTree";
import {
  canMoveNode,
  makeBook,
  makeChapter,
  moveNode,
  outlineEntries,
  validateBook,
  type Book,
  type Chapter,
  type Part,
} from "../../src/model";

function chapter(id: string, parentId: string | null = null): Chapter {
  return {
    ...makeChapter(id, parentId),
    id,
    emoji: "🌱",
    progress: "in-progress",
    notes: `Private notes for ${id}`,
    tags: "system, draft",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `${id} content` }],
        },
      ],
    },
  };
}

function fixture(mode: "book" | "bible" = "book"): Book {
  return {
    ...makeBook("Outline placement"),
    mode,
    nodes: [
      chapter("overview"),
      chapter("world", "overview"),
      chapter("climate", "world"),
      chapter("seasons", "climate"),
      chapter("weather", "world"),
      chapter("city", "overview"),
      chapter("housing", "city"),
      chapter("notes"),
    ],
  };
}

const order = (book: Book) => outlineEntries(book).map(({ node }) => node.id);
const node = (book: Book, id: string) =>
  book.nodes.find((item) => item.id === id);

describe("Explicit outline drop placement", () => {
  it.each(["book", "bible"] as const)(
    "nests a complete branch under a chapter in %s mode",
    (mode) => {
      const book = fixture(mode);
      const moving = node(book, "climate") as Chapter;
      const child = node(book, "seasons");
      const moved = moveNode(book, "climate", "city", "inside");
      expect(order(moved)).toEqual([
        "overview",
        "world",
        "weather",
        "city",
        "housing",
        "climate",
        "seasons",
        "notes",
      ]);
      expect(node(moved, "climate")).toEqual({ ...moving, parentId: "city" });
      expect(
        node(moved, "climate")?.type === "chapter" &&
          (node(moved, "climate") as Chapter).document,
      ).toBe(moving.document);
      expect(node(moved, "seasons")).toBe(child);
      expect(node(book, "climate")).toMatchObject({ parentId: "world" });
      expect(validateBook(moved)).toBe(true);
    },
  );

  it("places before a nested sibling and after the target's entire branch", () => {
    const book = fixture();
    const before = moveNode(book, "city", "climate", "before");
    expect(order(before)).toEqual([
      "overview",
      "world",
      "city",
      "housing",
      "climate",
      "seasons",
      "weather",
      "notes",
    ]);
    expect(node(before, "city")).toMatchObject({ parentId: "world" });
    const after = moveNode(book, "city", "climate", "after");
    expect(order(after)).toEqual([
      "overview",
      "world",
      "climate",
      "seasons",
      "city",
      "housing",
      "weather",
      "notes",
    ]);
    expect(node(after, "city")).toMatchObject({ parentId: "world" });
    expect(validateBook(before)).toBe(true);
    expect(validateBook(after)).toBe(true);
  });

  it("promotes a full branch to the end of the top level", () => {
    const book = fixture();
    const moved = moveNode(book, "climate", null, "root");
    expect(order(moved)).toEqual([
      "overview",
      "world",
      "weather",
      "city",
      "housing",
      "notes",
      "climate",
      "seasons",
    ]);
    expect(node(moved, "climate")).toMatchObject({ parentId: null });
    expect(node(moved, "seasons")).toBe(node(book, "seasons"));
    expect(validateBook(moved)).toBe(true);
    expect(moveNode(book, "notes", null, "root")).toBe(book);
  });

  it("rejects self, descendant and missing targets without changing any data", () => {
    const book = fixture();
    for (const placement of ["before", "inside", "after"] as const) {
      expect(canMoveNode(book, "world", "seasons", placement)).toBe(false);
      expect(moveNode(book, "world", "seasons", placement)).toBe(book);
      expect(moveNode(book, "world", "world", placement)).toBe(book);
      expect(moveNode(book, "world", "missing", placement)).toBe(book);
      expect(moveNode(book, "world", null, placement)).toBe(book);
    }
    expect(moveNode(book, "missing", null, "root")).toBe(book);
  });

  it("keeps parts at the top level and distinguishes beside from inside", () => {
    const part: Part = { type: "part", id: "part", title: "Systems" };
    const book: Book = {
      ...makeBook("Parts"),
      nodes: [
        chapter("notes"),
        part,
        chapter("world", "part"),
        chapter("climate", "world"),
        chapter("appendix"),
      ],
    };
    const inside = moveNode(book, "notes", "part", "inside");
    expect(order(inside)).toEqual([
      "part",
      "world",
      "climate",
      "notes",
      "appendix",
    ]);
    expect(node(inside, "notes")).toMatchObject({ parentId: "part" });
    const after = moveNode(book, "notes", "part", "after");
    expect(order(after)).toEqual([
      "part",
      "world",
      "climate",
      "notes",
      "appendix",
    ]);
    expect(node(after, "notes")).toMatchObject({ parentId: null });
    const before = moveNode(book, "appendix", "part", "before");
    expect(order(before)).toEqual([
      "notes",
      "appendix",
      "part",
      "world",
      "climate",
    ]);
    expect(node(before, "appendix")).toMatchObject({ parentId: null });
    expect(moveNode(book, "part", "notes", "inside")).toBe(book);
    expect(moveNode(book, "part", "climate", "after")).toBe(book);
    const movedPart = moveNode(book, "part", "notes", "after");
    expect(order(movedPart)).toEqual(order(book));
    expect(movedPart).toBe(book);
    const legacy = moveNode(book, "notes", "part");
    expect(order(legacy)).toEqual([
      "part",
      "notes",
      "world",
      "climate",
      "appendix",
    ]);
    expect(validateBook(inside)).toBe(true);
    expect(validateBook(after)).toBe(true);
    expect(validateBook(before)).toBe(true);
  });

  it("places a moved part beside the enclosing root branch of a nested target", () => {
    const part: Part = { type: "part", id: "part", title: "Part" };
    const book: Book = {
      ...fixture(),
      nodes: [...fixture().nodes, part, chapter("part-child", "part")],
    };
    const before = moveNode(book, "part", "city", "before");
    expect(order(before).slice(0, 3)).toEqual([
      "part",
      "part-child",
      "overview",
    ]);
    const after = moveNode(book, "part", "city", "after");
    expect(order(after).slice(-3)).toEqual(["part", "part-child", "notes"]);
    expect(node(after, "part-child")).toMatchObject({ parentId: "part" });
    expect(validateBook(after)).toBe(true);
  });

  it("splits each row into before, inside and after targets", () => {
    const rect = { top: 100, height: 40 };
    expect(outlineDropPlacement(101, rect)).toBe("before");
    expect(outlineDropPlacement(109, rect)).toBe("before");
    expect(outlineDropPlacement(110, rect)).toBe("inside");
    expect(outlineDropPlacement(120, rect)).toBe("inside");
    expect(outlineDropPlacement(130, rect)).toBe("inside");
    expect(outlineDropPlacement(131, rect)).toBe("after");
    expect(outlineDropPlacement(139, rect)).toBe("after");
  });
});
