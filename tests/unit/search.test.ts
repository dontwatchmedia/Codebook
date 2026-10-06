import { afterEach, describe, expect, it } from "vitest";
import { Editor, Node, getSchema, type JSONContent } from "@tiptap/core";
import { extensions } from "../../src/editor/extensions";
import {
  SearchHighlights,
  searchHighlightsKey,
  setSearchHighlights,
} from "../../src/editor/SearchHighlights";
import {
  findDocumentMatches,
  findMatches,
  matchContext,
  searchBook,
  searchBookAsync,
} from "../../src/search";
import { makeBook, makeChapter } from "../../src/model";

const schema = getSchema(extensions());
const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const doc = (...content: JSONContent[]) =>
  schema.nodeFromJSON({ type: "doc", content });
const editors: Editor[] = [];
function editor(content: JSONContent | string) {
  const value = new Editor({
    extensions: [
      ...extensions().filter(
        (extension) => extension.name !== SearchHighlights.name,
      ),
      SearchHighlights,
    ],
    content,
  });
  editors.push(value);
  return value;
}
afterEach(() => {
  editors.splice(0).forEach((value) => value.destroy());
});

describe("document search positions", () => {
  it("matches across formatting marks and returns exact editable ranges", () => {
    const value = editor(
      "<p>Tree <strong>growth</strong> and <em>tree</em> growth.</p>",
    );
    const matches = findMatches(value, "tree growth", false);
    expect(matches).toHaveLength(2);
    expect(
      matches.map(({ from, to }) => value.state.doc.textBetween(from, to)),
    ).toEqual(["Tree growth", "tree growth"]);
    expect(findMatches(value, "Tree growth", true)).toEqual([matches[0]]);
  });

  it("does not match across hard breaks and keeps positions after the break correct", () => {
    const value = doc({
      type: "paragraph",
      content: [
        { type: "text", text: "Tree" },
        { type: "hardBreak" },
        { type: "text", text: "growth and growth" },
      ],
    });
    expect(findDocumentMatches(value, "Treegrowth", false)).toEqual([]);
    expect(findDocumentMatches(value, "Tree\ngrowth", false)).toEqual([]);
    const matches = findDocumentMatches(value, "growth", false);
    expect(matches).toEqual([
      { from: 6, to: 12 },
      { from: 17, to: 23 },
    ]);
    expect(matches.map(({ from, to }) => value.textBetween(from, to))).toEqual([
      "growth",
      "growth",
    ]);
  });

  it("treats inline objects and separate paragraphs as search boundaries", () => {
    const InlineToken = Node.create({
      name: "testInlineToken",
      inline: true,
      group: "inline",
      atom: true,
      renderHTML: () => ["span", { "data-inline-token": "true" }],
    });
    const withAtom = getSchema([...extensions(), InlineToken]);
    const value = withAtom.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Tree" },
            { type: "testInlineToken" },
            { type: "text", text: "growth" },
          ],
        },
        paragraph("Forest"),
        paragraph("floor"),
      ],
    });
    expect(findDocumentMatches(value, "Treegrowth", false)).toEqual([]);
    expect(findDocumentMatches(value, "Forestfloor", false)).toEqual([]);
    expect(findDocumentMatches(value, "growth", false)).toEqual([
      { from: 6, to: 12 },
    ]);
  });

  it("finds exact ranges in nested lists, tables, callouts, and code", () => {
    const value = doc(
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              paragraph("Tree list"),
              {
                type: "bulletList",
                content: [
                  { type: "listItem", content: [paragraph("Tree child")] },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [paragraph("Tree header")] },
              { type: "tableCell", content: [paragraph("Tree cell")] },
            ],
          },
        ],
      },
      {
        type: "callout",
        attrs: { kind: "note" },
        content: [paragraph("Tree note")],
      },
      {
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: "const Tree = 1;\nTree.grow();" }],
      },
    );
    const matches = findDocumentMatches(value, "tree", false);
    expect(matches).toHaveLength(7);
    expect(
      matches.every(({ from, to }) => value.textBetween(from, to) === "Tree"),
    ).toBe(true);
    const multiline = findDocumentMatches(value, "1;\nTree", false);
    expect(multiline).toHaveLength(1);
    expect(value.textBetween(multiline[0].from, multiline[0].to)).toBe(
      "1;\nTree",
    );
  });

  it("uses Unicode case folding without changing offsets after expanding lowercase characters or emoji", () => {
    const text = "İ 😀 Cat CAT cat Σ σ ς K K";
    const value = doc(paragraph(text));
    const cats = findDocumentMatches(value, "cat", false);
    expect(cats.map(({ from, to }) => value.textBetween(from, to))).toEqual([
      "Cat",
      "CAT",
      "cat",
    ]);
    expect(cats[0].from).toBe(1 + text.indexOf("Cat"));
    expect(
      findDocumentMatches(value, "σ", false).map(({ from, to }) =>
        value.textBetween(from, to),
      ),
    ).toEqual(["Σ", "σ", "ς"]);
    expect(
      findDocumentMatches(value, "k", false).map(({ from, to }) =>
        value.textBetween(from, to),
      ),
    ).toEqual(["K", "K"]);
    expect(
      findDocumentMatches(value, "😀", false).map(({ from, to }) =>
        value.textBetween(from, to),
      ),
    ).toEqual(["😀"]);
  });

  it("searches punctuation literally and produces non-overlapping replacement ranges", () => {
    const value = editor("<p>[a+b]? [a+b]? aaaaa</p>");
    expect(findMatches(value, "[a+b]?", false)).toHaveLength(2);
    const matches = findMatches(value, "aa", false);
    expect(matches).toHaveLength(2);
    expect(matches[0].to).toBe(matches[1].from);
    const transaction = value.state.tr;
    for (const match of [...matches].reverse())
      transaction.insertText("$&", match.from, match.to);
    value.view.dispatch(transaction);
    expect(value.state.doc.textContent).toBe("[a+b]? [a+b]? $&$&a");
    expect(findMatches(value, "", false)).toEqual([]);
  });
});

describe("project search ordering and context", () => {
  it("starts at the current section and wraps through every nested chapter in outline order", () => {
    const book = makeBook("Search project");
    const overview = makeChapter("Overview"),
      systems = makeChapter("Systems"),
      child = makeChapter("Nested system", systems.id),
      current = makeChapter("Gameplay"),
      empty = makeChapter("No body match");
    for (const chapter of [overview, systems, child, current])
      chapter.document = {
        type: "doc",
        content: [paragraph(`${chapter.title}: grow a tree`)],
      };
    empty.title = "tree title only";
    // Parent links determine visible outline order even if an older project
    // stores its child after another top-level chapter.
    book.nodes = [overview, systems, current, empty, child];
    const result = searchBook(book, "tree", false, current.id, schema);
    expect(result.map((group) => group.chapter.id)).toEqual([
      current.id,
      overview.id,
      systems.id,
      child.id,
    ]);
    expect(result.every((group) => group.matches.length === 1)).toBe(true);
    const withoutStart = searchBook(book, "tree", false, "missing", schema);
    expect(withoutStart.map((group) => group.chapter.id)).toEqual([
      overview.id,
      systems.id,
      child.id,
      current.id,
    ]);
    expect(searchBook(book, "", false, current.id, schema)).toEqual([]);
  });

  it("reuses parsed unchanged documents and refreshes changed chapters", () => {
    const book = makeBook("Cached project");
    const chapter = makeChapter("Chapter");
    chapter.document = { type: "doc", content: [paragraph("tree")] };
    book.nodes = [chapter];
    const first = searchBook(book, "tree", false, chapter.id, schema);
    const again = searchBook(book, "TREE", false, chapter.id, schema);
    expect(again[0].document).toBe(first[0].document);
    const updated = {
      ...book,
      nodes: [
        {
          ...chapter,
          document: { type: "doc", content: [paragraph("tree tree")] },
        },
      ],
    };
    const refreshed = searchBook(updated, "tree", false, chapter.id, schema);
    expect(refreshed[0].document).not.toBe(first[0].document);
    expect(refreshed[0].matches).toHaveLength(2);
    expect(book.nodes[0]).toBe(chapter);
  });

  it("provides bounded readable context without indexing metadata", () => {
    const value = doc(paragraph("Before the tree grows, the forest rests."));
    const match = findDocumentMatches(value, "tree", false)[0];
    expect(matchContext(value, match, 5)).toBe("… the tree grow…");
    expect(matchContext(value, match, 100)).toBe(
      "Before the tree grows, the forest rests.",
    );
  });
  it("reuses matches and parsed unchanged branches after an immutable chapter edit", () => {
    const book = makeBook("Incremental search");
    const chapter = makeChapter("Section");
    chapter.document = {
      type: "doc",
      content: [paragraph("tree one"), paragraph("tree two")],
    };
    book.nodes = [chapter];
    const first = searchBook(book, "tree", false, chapter.id, schema)[0];
    expect(searchBook(book, "tree", false, chapter.id, schema)[0].matches).toBe(
      first.matches,
    );
    const changed = {
      ...book,
      nodes: [
        {
          ...chapter,
          document: {
            ...chapter.document,
            content: [paragraph("tree one tree"), chapter.document.content![1]],
          },
        },
      ],
    };
    const next = searchBook(changed, "tree", false, chapter.id, schema)[0];
    expect(next.document.child(1)).toBe(first.document.child(1));
    expect(next.matches).toHaveLength(3);
    expect(
      next.matches.map(({ from, to }) => next.document.textBetween(from, to)),
    ).toEqual(["tree", "tree", "tree"]);
  });
  it("async search retains exact order and can be cancelled before reading a project", async () => {
    const book = makeBook("Async search");
    const chapter = makeChapter("Section");
    chapter.document = {
      type: "doc",
      content: [paragraph("tree one tree two")],
    };
    book.nodes = [chapter];
    expect(
      await searchBookAsync(book, "tree", false, chapter.id, schema),
    ).toEqual(searchBook(book, "tree", false, chapter.id, schema));
    const abort = new AbortController();
    abort.abort();
    await expect(
      searchBookAsync(book, "tree", false, chapter.id, schema, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("ephemeral search highlights", () => {
  it("highlights all matches and the active occurrence without modifying saved content or Undo", () => {
    const value = editor("<p>Tree <strong>growth</strong>. Tree growth.</p>");
    const original = value.getJSON();
    const matches = findMatches(value, "tree growth", false);
    let updates = 0;
    value.on("update", () => updates++);
    setSearchHighlights(value, "tree growth", false, matches[1]);
    const decorations = searchHighlightsKey
      .getState(value.state)!
      .decorations.find();
    expect(decorations).toHaveLength(2);
    expect(
      value.view.dom.querySelectorAll(".search-match.is-active"),
    ).toHaveLength(1);
    expect(
      value.view.dom.querySelector(".search-match.is-active")?.textContent,
    ).toBe("Tree growth");
    expect(value.getJSON()).toEqual(original);
    expect(updates).toBe(0);
    expect(value.commands.undo()).toBe(false);
    setSearchHighlights(value, "", false);
    expect(
      searchHighlightsKey.getState(value.state)!.decorations.find(),
    ).toEqual([]);
    expect(value.view.dom.querySelector(".search-match")).toBeNull();
  });

  it("recomputes highlights and maps the active occurrence after an edit before it", () => {
    const value = editor("<p>Tree one. Tree two.</p>");
    const matches = findMatches(value, "tree", false);
    setSearchHighlights(value, "tree", false, matches[1]);
    value.view.dispatch(value.state.tr.insertText("New ", 1));
    const state = searchHighlightsKey.getState(value.state)!;
    expect(state.decorations.find()).toHaveLength(2);
    expect(state.activeRange).toEqual({
      from: matches[1].from + 4,
      to: matches[1].to + 4,
    });
    expect(
      value.view.dom.querySelector(".search-match.is-active")?.textContent,
    ).toBe("Tree");
    value.view.dispatch(
      value.state.tr.insertText(
        "Shrub",
        state.activeRange!.from,
        state.activeRange!.to,
      ),
    );
    expect(
      searchHighlightsKey.getState(value.state)!.decorations.find(),
    ).toHaveLength(1);
    expect(value.view.dom.querySelector(".search-match.is-active")).toBeNull();
  });
});
