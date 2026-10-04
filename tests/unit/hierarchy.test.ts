import { beforeEach, describe, expect, it } from "vitest";
import {
  ancestors,
  descendants,
  insertChapter,
  makeBook,
  makeChapter,
  moveNode,
  moveRelative,
  outlineEntries,
  removeNodePreserveChildren,
  reparentNode,
  validateBook,
  type Book,
  type Chapter,
  type Part,
} from "../../src/model";
import { loadBooks, saveBook, stageBook } from "../../src/storage";

function section(id: string, parentId: string | null = null): Chapter {
  return {
    ...makeChapter(id, parentId),
    id,
    goal: 0,
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

function fixture(): Book {
  return {
    ...makeBook("Open Blue", "bible"),
    nodes: [
      section("overview"),
      section("city", "overview"),
      section("housing", "city"),
      section("interiors", "housing"),
      section("garden", "city"),
      section("land", "overview"),
      section("wildlife", "land"),
      section("notes"),
    ],
  };
}

const order = (book: Book) => outlineEntries(book).map(({ node }) => node.id);

describe("Nested project integrity", () => {
  it("opens legacy version-one books without requiring new fields", () => {
    const book = makeBook("Legacy", "technical");
    for (const node of book.nodes) {
      if (node.type === "chapter") {
        delete node.progress;
        delete node.icon;
      }
    }
    expect(book.mode).toBeUndefined();
    expect(validateBook(book)).toBe(true);
    expect(order(book)).toEqual(book.nodes.map((node) => node.id));
  });

  it("creates a system bible with a document-bearing overview", () => {
    const book = makeBook("Open Blue", "bible");
    expect(validateBook(book)).toBe(true);
    expect(book).toMatchObject({ mode: "bible", goal: 0 });
    expect(book.nodes).toHaveLength(1);
    expect(book.nodes[0]).toMatchObject({
      title: "Overview",
      parentId: null,
      progress: "in-progress",
      icon: "document",
      goal: 0,
    });
  });

  it("derives depth and sibling order from parent links, even in a noncontiguous file", () => {
    const book = fixture();
    book.nodes = [
      book.nodes[3],
      book.nodes[0],
      book.nodes[5],
      book.nodes[2],
      book.nodes[1],
      book.nodes[7],
      book.nodes[6],
      book.nodes[4],
    ];
    expect(validateBook(book)).toBe(true);
    expect(
      outlineEntries(book).map(({ node, depth }) => [node.id, depth]),
    ).toEqual([
      ["overview", 0],
      ["land", 1],
      ["wildlife", 2],
      ["city", 1],
      ["housing", 2],
      ["interiors", 3],
      ["garden", 2],
      ["notes", 0],
    ]);
    expect(ancestors(book, "interiors").map((node) => node.id)).toEqual([
      "overview",
      "city",
      "housing",
    ]);
    expect(descendants(book, "city").map((node) => node.id)).toEqual([
      "housing",
      "interiors",
      "garden",
    ]);
    expect(descendants(book, "notes")).toEqual([]);
  });

  it("supports deeply nested sections without a fixed outline-depth cap", () => {
    const book = makeBook("Deep", "bible");
    book.nodes = Array.from({ length: 2500 }, (_, i) =>
      section(`section-${i}`, i ? `section-${i - 1}` : null),
    );
    expect(validateBook(book)).toBe(true);
    expect(outlineEntries(book).at(-1)?.depth).toBe(2499);
    expect(ancestors(book, "section-2499")).toHaveLength(2499);
    expect(descendants(book, "section-0")).toHaveLength(2499);
  });

  it("rejects self-parenting, cycles, missing parents and malformed optional fields", () => {
    const book = fixture();
    const replaced = (patch: Record<string, unknown>) => ({
      ...book,
      nodes: [{ ...book.nodes[0], ...patch }, ...book.nodes.slice(1)],
    });
    expect(validateBook(replaced({ parentId: "overview" }))).toBe(false);
    expect(validateBook(replaced({ parentId: "interiors" }))).toBe(false);
    expect(validateBook(replaced({ parentId: "missing" }))).toBe(false);
    expect(validateBook(replaced({ parentId: 3 }))).toBe(false);
    expect(validateBook(replaced({ progress: "almost" }))).toBe(false);
    expect(validateBook(replaced({ icon: "unknown" }))).toBe(false);
    expect(validateBook({ ...book, mode: "unknown" })).toBe(false);
    expect(
      validateBook({ ...book, nodes: [...book.nodes, book.nodes[0]] }),
    ).toBe(false);
    const part: Part = { id: "part", type: "part", title: "Part" };
    expect(
      validateBook({
        ...book,
        mode: "book",
        nodes: [
          part,
          ...book.nodes.map((node, i) =>
            i === 0 ? { ...node, parentId: part.id } : node,
          ),
        ],
      }),
    ).toBe(true);
  });
});

describe("Outline editing keeps all descendants and their contents", () => {
  it("appends a new child after its parent's full subtree", () => {
    const book = fixture();
    const inserted = insertChapter(book, section("new-city-system", "city"));
    expect(order(inserted)).toEqual([
      "overview",
      "city",
      "housing",
      "interiors",
      "garden",
      "new-city-system",
      "land",
      "wildlife",
      "notes",
    ]);
    expect(validateBook(inserted)).toBe(true);
    expect(insertChapter(book, section("missing-parent", "missing"))).toBe(
      book,
    );
    expect(insertChapter(book, section("city"))).toBe(book);
  });

  it("reparents a full subtree and refuses descendant targets", () => {
    const book = fixture();
    const moved = reparentNode(book, "housing", "land");
    expect(order(moved)).toEqual([
      "overview",
      "city",
      "garden",
      "land",
      "wildlife",
      "housing",
      "interiors",
      "notes",
    ]);
    expect(moved.nodes.find((node) => node.id === "housing")).toMatchObject({
      parentId: "land",
    });
    expect(moved.nodes.find((node) => node.id === "interiors")).toBe(
      book.nodes[3],
    );
    expect(book.nodes[2]).toMatchObject({ parentId: "city" });
    expect(validateBook(moved)).toBe(true);
    expect(reparentNode(book, "city", "interiors")).toBe(book);
    expect(reparentNode(book, "city", "city")).toBe(book);
    expect(reparentNode(book, "city", "missing")).toBe(book);
    expect(reparentNode(book, "city", "overview")).toBe(book);
    const root = reparentNode(book, "city", null);
    expect(order(root)).toEqual([
      "overview",
      "land",
      "wildlife",
      "notes",
      "city",
      "housing",
      "interiors",
      "garden",
    ]);
    expect(validateBook(root)).toBe(true);
  });

  it("dragging before a nested sibling moves all descendants", () => {
    const book = fixture();
    const moved = moveNode(book, "housing", "wildlife");
    expect(order(moved)).toEqual([
      "overview",
      "city",
      "garden",
      "land",
      "housing",
      "interiors",
      "wildlife",
      "notes",
    ]);
    expect(moved.nodes.find((node) => node.id === "housing")).toMatchObject({
      parentId: "land",
    });
    expect(moved.nodes.find((node) => node.id === "interiors")).toBe(
      book.nodes[3],
    );
    expect(validateBook(moved)).toBe(true);
    expect(moveNode(book, "city", "interiors")).toBe(book);
  });

  it("preserves legacy onto-part behavior and moves nested part descendants together", () => {
    const part: Part = { id: "part", type: "part", title: "Systems" };
    const book = {
      ...fixture(),
      nodes: [
        section("notes"),
        part,
        section("system", "part"),
        section("feature", "system"),
      ],
    };
    const intoPart = moveNode(book, "notes", "part");
    expect(order(intoPart)).toEqual(["part", "notes", "system", "feature"]);
    expect(intoPart.nodes[1]).toMatchObject({ parentId: "part" });
    const movedPart = moveNode(book, "part", "notes");
    expect(order(movedPart)).toEqual(["part", "system", "feature", "notes"]);
    expect(moveNode(book, "part", "feature")).toBe(book);
    expect(validateBook(intoPart)).toBe(true);
    expect(validateBook(movedPart)).toBe(true);
  });

  it("reorders complete sibling subtrees in both directions", () => {
    const book = fixture();
    const down = moveRelative(book, "city", 1);
    expect(order(down)).toEqual([
      "overview",
      "land",
      "wildlife",
      "city",
      "housing",
      "interiors",
      "garden",
      "notes",
    ]);
    const up = moveRelative(down, "city", -1);
    expect(order(up)).toEqual(order(book));
    expect(up.nodes.find((node) => node.id === "interiors")).toBe(
      book.nodes[3],
    );
    expect(validateBook(down)).toBe(true);
    expect(moveRelative(book, "city", -1)).toBe(book);
    expect(
      moveRelative(book, "housing", 1).nodes.map((node) => node.id),
    ).toEqual([
      "overview",
      "city",
      "garden",
      "housing",
      "interiors",
      "land",
      "wildlife",
      "notes",
    ]);
  });

  it("promotes immediate children when a section or legacy part is removed", () => {
    const book = fixture();
    const removed = removeNodePreserveChildren(book, "city");
    expect(order(removed)).toEqual([
      "overview",
      "housing",
      "interiors",
      "garden",
      "land",
      "wildlife",
      "notes",
    ]);
    expect(removed.nodes.find((node) => node.id === "housing")).toMatchObject({
      parentId: "overview",
    });
    expect(removed.nodes.find((node) => node.id === "garden")).toMatchObject({
      parentId: "overview",
    });
    expect(removed.nodes.find((node) => node.id === "interiors")).toBe(
      book.nodes[3],
    );
    expect(validateBook(removed)).toBe(true);
    const part: Part = { id: "part", type: "part", title: "Part" };
    const partBook = {
      ...book,
      nodes: [
        part,
        section("system", "part"),
        section("feature", "system"),
        section("notes"),
      ],
    };
    const partRemoved = removeNodePreserveChildren(partBook, part.id);
    expect(order(partRemoved)).toEqual(["system", "feature", "notes"]);
    expect(partRemoved.nodes[0]).toMatchObject({ parentId: null });
    expect(partRemoved.nodes[1]).toMatchObject({ parentId: "system" });
    expect(validateBook(partRemoved)).toBe(true);
    expect(removeNodePreserveChildren(book, "missing")).toBe(book);
  });
});

describe("Hierarchical saves and recovery", () => {
  beforeEach(() => localStorage.clear());

  it("reopens nested sections with their progress and icon, including journal recovery", async () => {
    const book = fixture();
    book.modified = "2026-01-01T00:00:00.000Z";
    const housing = book.nodes.find((node) => node.id === "housing") as Chapter;
    housing.progress = "complete";
    housing.icon = "hammer";
    await saveBook(book);
    expect((await loadBooks()).books[0]).toEqual(book);
    const draft = reparentNode(book, "housing", "land");
    draft.modified = "2026-01-02T00:00:00.000Z";
    stageBook(draft);
    const recovered = (await loadBooks()).recovery[0];
    expect(recovered).toEqual(draft);
    expect(validateBook(recovered)).toBe(true);
    expect(ancestors(recovered, "interiors").map((node) => node.id)).toEqual([
      "overview",
      "land",
      "housing",
    ]);
  });
});
