import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { extensions } from "../../src/editor/extensions";
import { formatMarkdown } from "../../src/editor/formatMarkdown";
import { docText, validateDocument } from "../../src/model";

const editors: Editor[] = [];
function makeEditor(content: JSONContent) {
  const editor = new Editor({ extensions: extensions(), content });
  editors.push(editor);
  return editor;
}
function paragraph(text = "", attrs?: Record<string, unknown>): JSONContent {
  return {
    type: "paragraph",
    ...(attrs ? { attrs } : {}),
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}
function document(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}
function nodes(node: JSONContent): JSONContent[] {
  return [node, ...(node.content || []).flatMap(nodes)];
}
function position(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text?.includes(text))
      found = pos + node.text.indexOf(text);
  });
  if (found < 0) throw new Error(`Missing ${text}`);
  return found;
}
afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("explicit Markdown formatting", () => {
  it("converts inline and reference Markdown links whose destination URLs were already auto-linked", () => {
    const linked = (url: string): JSONContent => ({
      type: "text",
      text: url,
      marks: [{ type: "link", attrs: { href: url } }],
    });
    const editor = makeEditor(
      document(
        {
          type: "paragraph",
          content: [
            { type: "text", text: "[Guide](" },
            linked("https://example.com/guide"),
            { type: "text", text: ")" },
          ],
        },
        paragraph("[More details][details]"),
        {
          type: "paragraph",
          content: [
            { type: "text", text: "[details]: " },
            linked("https://example.com/details"),
          ],
        },
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    const result = editor.getJSON();
    expect(nodes(result).find((node) => node.text === "Guide")?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({ href: "https://example.com/guide" }),
        }),
      ]),
    );
    expect(
      nodes(result).find((node) => node.text === "More details")?.marks,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({
            href: "https://example.com/details",
          }),
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("CODEBOOK");
  });

  it("keeps inline code valid inside new emphasis and restores image captions", () => {
    const editor = makeEditor(
      document(
        {
          type: "paragraph",
          content: [
            { type: "text", text: "**Use " },
            { type: "text", text: "grow()", marks: [{ type: "code" }] },
            { type: "text", text: " now**" },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "![" },
            { type: "text", text: "World map", marks: [{ type: "bold" }] },
            { type: "text", text: "](https://example.com/map.png)" },
          ],
        },
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(
      nodes(editor.getJSON()).find((node) => node.text === "grow()")?.marks,
    ).toEqual([{ type: "code" }]);
    expect(
      nodes(editor.getJSON()).find((node) => node.type === "image")?.attrs?.alt,
    ).toBe("World map");
    expect(() => editor.state.doc.check()).not.toThrow();
  });

  it("does not merge ordinary prose paragraphs containing pipes", () => {
    const editor = makeEditor(
      document(
        paragraph("## Heading"),
        paragraph("North | South is a route."),
        paragraph("Open | Closed are two states."),
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
    ]);
    expect(docText(editor.getJSON().content![1])).toBe(
      "North | South is a route.",
    );
    expect(docText(editor.getJSON().content![2])).toBe(
      "Open | Closed are two states.",
    );
  });

  it("recognizes optional-pipe tables and setext headings without treating spaced dividers as headings", () => {
    const editor = makeEditor(
      document(
        paragraph("Garden systems"),
        paragraph("=============="),
        paragraph(),
        paragraph("Name | State"),
        paragraph("--- | ---"),
        paragraph("Tree | Ready"),
        paragraph(),
        paragraph("Paragraph before a divider."),
        paragraph(),
        paragraph("---"),
        paragraph("After divider."),
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
      "heading",
      "table",
      "paragraph",
      "horizontalRule",
      "paragraph",
    ]);
    expect(editor.getJSON().content?.[0].attrs?.level).toBe(1);
  });

  it("restores protected source text inside a raw fence without adding rich marks to code", () => {
    const editor = makeEditor(
      document(
        paragraph("```text"),
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "**keep literal**",
              marks: [{ type: "bold" }],
            },
          ],
        },
        paragraph("```"),
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.[0].content).toEqual([
      { type: "text", text: "**keep literal**\n" },
    ]);
    expect(validateDocument(editor.getJSON())).toBe(true);
  });

  it("formats literal headings, emphasis and nested lists using compact Google typography", () => {
    const editor = makeEditor(
      document(
        paragraph("A **life cycle** with *growth* and ~~old~~ details."),
        paragraph("## Tree lifecycle"),
        paragraph("- Standing tree"),
        paragraph("  - Sapling"),
        paragraph("- Felled tree"),
        paragraph("### Stumps"),
        paragraph("Keep the same **species**."),
      ),
    );
    expect(formatMarkdown(editor)).toEqual({ changed: true, scope: "section" });
    const result = editor.getJSON();
    expect(result.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "heading",
      "bulletList",
      "heading",
      "paragraph",
    ]);
    expect(result.content?.[0].attrs).toMatchObject({
      fontFamily: "Arial",
      fontSize: "11pt",
      lineHeight: "1.15",
      marginBottom: "8pt",
    });
    expect(result.content?.[1].attrs).toMatchObject({
      level: 2,
      fontSize: "16pt",
      marginTop: "12pt",
      marginBottom: "8pt",
    });
    expect(result.content?.[3].attrs).toMatchObject({
      level: 3,
      fontSize: "14pt",
    });
    expect(
      nodes(result).find((node) => node.text === "life cycle")?.marks,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "bold" })]),
    );
    expect(result.content?.[2].content?.[0].content?.[1].type).toBe(
      "bulletList",
    );
    expect(docText(result)).not.toContain("**");
    expect(validateDocument(result)).toBe(true);
    expect(formatMarkdown(editor).changed).toBe(false);
  });

  it("reconstructs per-line HTML pastes into tables and exact fenced code", () => {
    const editor = makeEditor(
      document(
        paragraph("| Name | State |"),
        paragraph("| --- | --- |"),
        paragraph("| Garden | **Done** |"),
        paragraph(),
        paragraph("```javascript"),
        paragraph("function grow() {"),
        paragraph('\tconst text = "**literal**";'),
        paragraph(),
        paragraph("    return text;"),
        paragraph("}"),
        paragraph("```"),
        paragraph("[Read guide][guide]"),
        paragraph("[guide]: https://example.com/guide"),
      ),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    const result = editor.getJSON();
    expect(result.content?.[0].type).toBe("table");
    const code = result.content?.find((node) => node.type === "codeBlock");
    expect(code?.attrs?.language).toBe("javascript");
    expect(code?.content).toEqual([
      {
        type: "text",
        text: 'function grow() {\n\tconst text = "**literal**";\n\n    return text;\n}\n',
      },
    ]);
    expect(
      nodes(result).find((node) => node.text === "Read guide")?.marks,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({ href: "https://example.com/guide" }),
        }),
      ]),
    );
  });

  it("handles multiline hard breaks and raw textStyle spans from document clipboard HTML", () => {
    const editor = makeEditor(
      document({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "## Logging",
            marks: [
              {
                type: "textStyle",
                attrs: { fontSize: "11pt", fontFamily: "Arial" },
              },
            ],
          },
          { type: "hardBreak" },
          { type: "hardBreak" },
          {
            type: "text",
            text: "**Life",
            marks: [{ type: "textStyle", attrs: { color: "#222222" } }],
          },
          { type: "text", text: " cycle**" },
          { type: "hardBreak" },
          { type: "text", text: "- Trees" },
          { type: "hardBreak" },
          { type: "text", text: "- Stumps" },
        ],
      }),
    );
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(
      editor
        .getJSON()
        .content?.slice(0, 3)
        .map((node) => node.type),
    ).toEqual(["heading", "paragraph", "bulletList"]);
    expect(editor.getJSON().content?.at(-1)?.content).toBeUndefined();
    expect(
      nodes(editor.getJSON())
        .find((node) => node.text === "Life cycle")
        ?.marks?.some((mark) => mark.type === "bold"),
    ).toBe(true);
  });

  it("retains rich blocks, metadata and existing inline marks while converting nearby raw paragraphs", () => {
    const rich: JSONContent[] = [
      {
        type: "heading",
        attrs: {
          level: 1,
          fontFamily: "Georgia",
          fontSize: "24pt",
          textAlign: "center",
        },
        content: [{ type: "text", text: "Already formatted" }],
      },
      {
        type: "image",
        attrs: { src: "https://example.com/map.png", alt: "Map" },
      },
      {
        type: "codeBlock",
        attrs: {
          language: "cpp",
          filename: "tree.cpp",
          caption: "Sample",
          showLineNumbers: true,
        },
        content: [
          {
            type: "text",
            text: '#include <tree>\nconst char* value = "**keep literal**";',
          },
        ],
      },
      {
        type: "callout",
        attrs: { kind: "warning" },
        content: [paragraph("Keep **literal** here.")],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [paragraph("Keep **table** content.")],
              },
            ],
          },
        ],
      },
    ];
    const editor = makeEditor(
      document(...rich, {
        type: "paragraph",
        content: [
          { type: "text", text: "Use **growth** beside " },
          { type: "text", text: "**code literal**", marks: [{ type: "code" }] },
          { type: "text", text: " and " },
          {
            type: "text",
            text: "underlined",
            marks: [
              { type: "underline" },
              {
                type: "textStyle",
                attrs: { color: "#123456", fontSize: "13pt" },
              },
            ],
          },
          { type: "text", text: " and " },
          {
            type: "text",
            text: "a link",
            marks: [
              {
                type: "link",
                attrs: { href: "https://example.com/reference" },
              },
            ],
          },
        ],
      }),
    );
    const before = editor.getJSON();
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.slice(0, rich.length)).toEqual(
      before.content?.slice(0, rich.length),
    );
    for (const text of ["**code literal**", "underlined", "a link"])
      expect(
        nodes(editor.getJSON()).find((node) => node.text === text)?.marks,
      ).toEqual(nodes(before).find((node) => node.text === text)?.marks);
    expect(formatMarkdown(editor).changed).toBe(false);
  });

  it("formats only an inline selection without moving or restyling its prefix and suffix", () => {
    const editor = makeEditor(
      document(
        paragraph("Before **chosen** after", {
          fontFamily: "Verdana",
          fontSize: "12pt",
          marginBottom: "6pt",
        }),
        paragraph("Untouched **source**"),
      ),
    );
    const original = editor.getJSON();
    const from = position(editor, "**chosen**");
    editor.commands.setTextSelection({ from, to: from + "**chosen**".length });
    expect(formatMarkdown(editor)).toEqual({
      changed: true,
      scope: "selection",
    });
    expect(editor.getJSON().content?.[0].attrs).toEqual(
      original.content?.[0].attrs,
    );
    expect(docText(editor.getJSON().content![0])).toBe("Before chosen after");
    expect(editor.getJSON().content?.[1]).toEqual(original.content?.[1]);
    expect(
      editor.getJSON().content?.[0].content?.map((node) => node.text),
    ).toEqual(["Before ", "chosen", " after"]);
    expect(editor.getJSON().content?.[0].content?.[0].marks).toBeUndefined();
    expect(editor.getJSON().content?.[0].content?.[2].marks).toBeUndefined();
  });

  it("does not consume an unselected empty paragraph at a selection boundary", () => {
    const editor = makeEditor(
      document(
        paragraph("## Heading"),
        paragraph("", { fontFamily: "Verdana", fontSize: "13pt" }),
        paragraph("Outside"),
      ),
    );
    const untouched = editor.getJSON().content?.[1];
    const first = editor.state.doc.firstChild!;
    editor.commands.setTextSelection({ from: 1, to: first.nodeSize + 1 });
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.[0].type).toBe("heading");
    expect(editor.getJSON().content?.[1]).toEqual(untouched);
    expect(docText(editor.getJSON().content![2])).toBe("Outside");
  });

  it("preserves unselected boundary text when a selection produces multiple blocks", () => {
    const editor = makeEditor(
      document(
        paragraph("Keep prefix ## New heading"),
        paragraph("- New item"),
        paragraph("**chosen** keep suffix"),
        paragraph("**untouched**"),
      ),
    );
    const from = position(editor, "## New heading"),
      to = position(editor, "**chosen**") + "**chosen**".length;
    editor.commands.setTextSelection({ from, to });
    expect(formatMarkdown(editor).changed).toBe(true);
    const result = editor.getJSON();
    expect(result.content?.[0].content).toEqual([
      { type: "text", text: "Keep prefix " },
    ]);
    expect(result.content?.[1].type).toBe("heading");
    expect(result.content?.[2].type).toBe("bulletList");
    expect(result.content?.at(-2)?.content).toEqual([
      { type: "text", text: " keep suffix" },
    ]);
    expect(result.content?.at(-1)?.content).toEqual([
      { type: "text", text: "**untouched**" },
    ]);
  });

  it("formats selected raw inline Markdown inside an existing heading without replacing the heading", () => {
    const editor = makeEditor(
      document({
        type: "heading",
        attrs: { level: 3, fontSize: "20pt", fontFamily: "Georgia" },
        content: [{ type: "text", text: "Heading **detail** suffix" }],
      }),
    );
    const before = editor.getJSON();
    const from = position(editor, "**detail**");
    editor.commands.setTextSelection({ from, to: from + "**detail**".length });
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(editor.getJSON().content?.[0].attrs).toEqual(
      before.content?.[0].attrs,
    );
    expect(docText(editor.getJSON().content![0])).toBe("Heading detail suffix");
  });

  it("offers explicit conversion for Markdown code blocks while keeping programming code literal", () => {
    const editor = makeEditor(
      document(
        {
          type: "codeBlock",
          attrs: { language: "markdown" },
          content: [{ type: "text", text: "## Raw source\n\n**Format me**" }],
        },
        {
          type: "codeBlock",
          attrs: { language: "python" },
          content: [{ type: "text", text: '# comment\nvalue = "**keep**"' }],
        },
      ),
    );
    const originalCode = editor.getJSON().content?.[1];
    expect(formatMarkdown(editor).changed).toBe(true);
    expect(
      editor
        .getJSON()
        .content?.slice(0, 3)
        .map((node) => node.type),
    ).toEqual(["heading", "paragraph", "codeBlock"]);
    expect(editor.getJSON().content?.[2]).toEqual(originalCode);
    const from = position(editor, "# comment");
    editor.commands.setTextSelection({
      from,
      to: from + '# comment\nvalue = "**keep**"'.length,
    });
    expect(formatMarkdown(editor)).toEqual({
      changed: false,
      scope: "selection",
    });
  });

  it("restores all source in one Undo, isolates the earlier paste and supports Redo", () => {
    const editor = makeEditor(document(paragraph()));
    editor.commands.insertContent(
      document(paragraph("## Lifecycle"), paragraph("**Growth**")),
    );
    const raw = editor.getJSON();
    let updates = 0;
    editor.on("update", () => updates++);
    expect(formatMarkdown(editor).changed).toBe(true);
    const formatted = editor.getJSON();
    expect(updates).toBe(1);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getJSON()).toEqual(raw);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.getJSON()).toEqual(formatted);
    editor.commands.insertContent("Added later");
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(formatted);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(raw);
  });

  it("does nothing to ordinary prose, protected inline code, or read-only content", () => {
    const editor = makeEditor(
      document(paragraph("Plain prose about a tree."), {
        type: "paragraph",
        content: [
          { type: "text", text: "**literal**", marks: [{ type: "code" }] },
        ],
      }),
    );
    const original = editor.getJSON();
    expect(formatMarkdown(editor).changed).toBe(false);
    expect(editor.getJSON()).toEqual(original);
    editor.commands.setContent(document(paragraph("## Heading")));
    editor.setEditable(false);
    expect(formatMarkdown(editor).changed).toBe(false);
    expect(editor.getJSON().content?.[0].type).toBe("paragraph");
  });
});
