import { describe, it, expect, beforeEach } from "vitest";
import { generateJSON, Editor } from "@tiptap/core";
import {
  clipboardHTML,
  markdownHTML,
  sanitizeHTML,
  looksLikeMarkdown,
} from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import {
  exportHTML,
  exportMarkdown,
  toMarkdown,
  toHTML,
} from "../../src/export";
import {
  makeBook,
  makeChapter,
  moveNode,
  validateBook,
  validateDocument,
  uid,
  docText,
} from "../../src/model";
import { sampleBook } from "../../src/sample";
import { findMatches } from "../../src/search";
import {
  stageBook,
  loadBooks,
  saveBook,
  getBackups,
  deleteBook,
} from "../../src/storage";

const acceptance =
  '## Hello, World!\n\nOur first program prints some text.\n\n```cpp\n#include <iostream>\n\nint main()\n{\n    std::cout << "Hello, World!\\n";\n}\n```\n\nThe `std::cout` object writes to standard output.\n\n### What happened?\n\n1. We included `<iostream>`.\n2. We created `main()`.\n3. We printed text.';
const parse = (html: string) => generateJSON(html, extensions());
describe("Permanent clipboard regression suite", () => {
  it("meets the exact technical-response acceptance structure", () => {
    const doc = parse(markdownHTML(acceptance));
    expect(doc.content?.map((n) => n.type)).toEqual([
      "heading",
      "paragraph",
      "codeBlock",
      "paragraph",
      "heading",
      "orderedList",
    ]);
    expect(doc.content?.[0].attrs?.level).toBe(2);
    expect(doc.content?.[2].attrs?.language).toBe("cpp");
    expect(doc.content?.[2].content?.[0].text).toContain("    std::cout");
    expect(
      doc.content?.[3].content?.some((n) =>
        n.marks?.some((m) => m.type === "code"),
      ),
    ).toBe(true);
    expect(doc.content?.[5].content).toHaveLength(3);
  });
  it("preserves highlighted browser HTML, tables, and nested lists", () => {
    const doc = parse(
      sanitizeHTML(
        '<h2>Example</h2><pre><code class="language-python"><span class="hljs-keyword">def</span> hello():\n    return 1</code></pre><ul><li>Outer<ul><li>Inner</li></ul></li></ul><table><tr><th>Name</th><th>Type</th></tr><tr><td>x</td><td>int</td></tr></table>',
      ),
    );
    expect(doc.content?.map((n) => n.type)).toEqual([
      "heading",
      "codeBlock",
      "bulletList",
      "table",
    ]);
    expect(doc.content?.[1].attrs?.language).toBe("python");
    expect(doc.content?.[1].content?.[0].text).toBe(
      "def hello():\n    return 1",
    );
    expect(doc.content?.[2].content?.[0].content?.[1].type).toBe("bulletList");
  });
  it("prefers HTML over markdown over detected plain Markdown", () => {
    expect(
      clipboardHTML({
        getData: (t) =>
          (
            ({
              "text/html": "<h2>HTML</h2>",
              "text/markdown": "# Markdown",
            }) as Record<string, string>
          )[t] || "",
      }),
    ).toContain("HTML");
    expect(
      clipboardHTML({
        getData: (t) => (t === "text/markdown" ? "# Markdown" : ""),
      }),
    ).toContain("<h1>Markdown</h1>");
    expect(
      clipboardHTML({ getData: (t) => (t === "text/plain" ? acceptance : "") }),
    ).toContain("language-cpp");
    expect(clipboardHTML({ getData: () => "ordinary prose" })).toBe(
      "ordinary prose",
    );
  });
  it("leaves ordinary text alone", () => {
    expect(looksLikeMarkdown("Hello. This is prose.")).toBe(false);
    expect(
      clipboardHTML({
        getData: (t) => (t === "text/plain" ? "Ordinary prose" : ""),
      }),
    ).toBe(null);
  });
  it("removes scripts, events, unsafe links, frames, styles and SVG", () => {
    const html = sanitizeHTML(
      '<script>alert(1)</script><iframe src="https://example.com"></iframe><p onclick="evil()" style="position:fixed">Safe</p><a href="javascript:evil()">link</a><img src="x" onerror="evil()"><img src="data:image/svg+xml;base64,PHN2Zz4="><svg onload="evil()"></svg>',
    );
    expect(html).not.toMatch(
      /script|iframe|onclick|onerror|style=|svg|javascript/i,
    );
    expect(html).toContain("Safe");
  });
  it("retains safe embedded images", () => {
    expect(
      sanitizeHTML('<img alt="diagram" src="data:image/png;base64,YQ==">'),
    ).toContain("data:image/png");
  });
});
describe("Portable export", () => {
  it("round trips the acceptance manuscript through Markdown", () => {
    const doc = parse(markdownHTML(acceptance));
    const round = parse(markdownHTML(toMarkdown(doc)));
    expect(round).toEqual(doc);
  });
  it("round trips nested lists, quotes, tables and formatting", () => {
    const source =
      "## Data\n\n**Bold** and *italic* with [a link](https://example.com).\n\n- Outer\n  - Inner\n\n> A quote\n\n| Name | Type |\n| --- | --- |\n| x | int |";
    const doc = parse(markdownHTML(source));
    expect(parse(markdownHTML(toMarkdown(doc)))).toEqual(doc);
  });
  it("preserves code fence contents with embedded backticks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "markdown" },
          content: [{ type: "text", text: "```js\nconst x = 2;\n```" }],
        },
      ],
    };
    expect(docText(parse(markdownHTML(toMarkdown(doc))))).toContain(
      "```js\nconst x = 2;\n```",
    );
  });
  it("never exports private notes or tags into manuscripts", () => {
    const b = sampleBook();
    expect(exportMarkdown(b)).not.toContain("Every great programmer");
    expect(exportHTML(b)).not.toContain("Every great programmer");
    expect(exportHTML(b)).toContain("language-cpp");
    expect(exportHTML(b)).toContain('aria-label="Contents"');
  });
  it("escapes hostile titles and attributes", () => {
    const b = makeBook("<script>bad()</script>");
    expect(exportHTML(b)).not.toContain("<script>");
    expect(
      toHTML({
        type: "image",
        attrs: { src: "javascript:bad()", alt: '" onerror="bad()' },
      }),
    ).not.toContain('src="javascript');
  });
  it("round trips code metadata through HTML", () => {
    const doc = sampleBook().nodes.find(
      (n) => n.type === "chapter" && n.title === "Hello, World!",
    );
    if (doc?.type !== "chapter") throw new Error();
    const round = parse(sanitizeHTML(toHTML(doc.document)));
    expect(
      round.content?.find((n) => n.type === "codeBlock")?.attrs,
    ).toMatchObject({
      language: "cpp",
      filename: "hello.cpp",
      showLineNumbers: true,
      caption: "Our first C++ program",
    });
  });
});
describe("Book integrity and ordering", () => {
  it("validates books and rejects duplicate IDs and traversal", () => {
    const b = makeBook("Test");
    expect(validateBook(b)).toBe(true);
    expect(validateBook({ ...b, id: "../bad" })).toBe(false);
    expect(validateBook({ ...b, nodes: [b.nodes[0], b.nodes[0]] })).toBe(false);
    expect(validateDocument({ type: "script" })).toBe(false);
  });
  it("moves chapters into parts without losing content", () => {
    const b = makeBook("Book", "technical"),
      part = b.nodes.find((n) => n.type === "part")!,
      last = b.nodes[b.nodes.length - 1];
    const moved = moveNode(b, last.id, part.id);
    expect(moved.nodes[2].id).toBe(last.id);
    expect(moved.nodes[2]).toMatchObject({ parentId: part.id });
  });
  it("moves an entire part with its chapters", () => {
    const b = makeBook("Book", "technical");
    const part = b.nodes.find((n) => n.type === "part")!;
    const moved = moveNode(b, part.id, b.nodes[0].id);
    expect(moved.nodes[0].id).toBe(part.id);
    expect(moved.nodes[1]).toMatchObject({
      type: "chapter",
      parentId: part.id,
    });
  });
  it("finds matches across formatting boundaries", () => {
    const ed = new Editor({
      extensions: extensions(),
      content: "<p>Hello <strong>world</strong>, hello world</p>",
    });
    const matches = findMatches(ed, "Hello world", false);
    expect(matches).toHaveLength(2);
    expect(ed.state.doc.textBetween(matches[0].from, matches[0].to)).toBe(
      "Hello world",
    );
    ed.destroy();
  });
});
describe("Autosave and recovery", () => {
  beforeEach(() => localStorage.clear());
  it("saves and reopens structured content", async () => {
    const b = sampleBook();
    await saveBook(b);
    expect((await loadBooks()).books[0]).toEqual(b);
  });
  it("offers newer unsaved journal data after restart", async () => {
    const b = makeBook("Original");
    b.modified = "2026-01-01T00:00:00.000Z";
    await saveBook(b);
    const draft = {
      ...b,
      title: "Recovered",
      modified: "2026-01-02T00:00:00.000Z",
    };
    stageBook(draft);
    expect((await loadBooks()).recovery[0].title).toBe("Recovered");
    await saveBook(draft);
    expect((await loadBooks()).recovery).toHaveLength(0);
  });
  it("creates a backup and removes a book from the library", async () => {
    const b = makeBook("Before");
    await saveBook(b);
    await saveBook({ ...b, title: "After" });
    expect((await getBackups(b.id))[0].book.title).toBe("Before");
    await deleteBook(b.id);
    expect((await loadBooks()).books).toHaveLength(0);
    expect(localStorage.getItem(`codebook.deleted.${b.id}`)).toContain("After");
  });
  it("refuses invalid documents and keeps the previous save", async () => {
    const b = makeBook("Safe");
    await saveBook(b);
    await expect(saveBook({ ...b, nodes: [] })).rejects.toThrow();
    expect((await loadBooks()).books[0].title).toBe("Safe");
  });
  it("does not silently replace a corrupt browser library", async () => {
    localStorage.setItem("codebook.library.v1", "not json");
    await expect(loadBooks()).rejects.toThrow();
    expect(localStorage.getItem("codebook.library.v1")).toBe("not json");
  });
});
