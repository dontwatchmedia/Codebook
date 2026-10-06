import { describe, expect, it } from "vitest";
import { getSchema, type JSONContent } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { extensions } from "../../src/editor/extensions";
import {
  cachedDecorationPlugin,
  serializeDocument,
} from "../../src/editor/runtime";
import { codeDecorations } from "../../src/editor/codeDecorations";

const schema = getSchema(extensions());
const paragraph = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
describe("immutable editor snapshots", () => {
  it("shares canonical loaded JSON from the first edit, while retaining schema normalization", () => {
    const canonical = schema
      .nodeFromJSON({
        type: "doc",
        content: [paragraph("First"), paragraph("Last")],
      })
      .toJSON();
    const doc = schema.nodeFromJSON(canonical);
    expect(serializeDocument(doc, canonical)).toBe(canonical);
    const state = EditorState.create({ schema, doc });
    const next = serializeDocument(
      state.apply(state.tr.insertText("New ", 1)).doc,
    );
    expect(next.content![1]).toBe(canonical.content[1]);
    const sparse = { type: "doc", content: [paragraph("Sparse")] };
    const sparseDoc = schema.nodeFromJSON(sparse);
    expect(serializeDocument(sparseDoc, sparse)).toEqual(sparseDoc.toJSON());
    expect(serializeDocument(sparseDoc)).not.toBe(sparse);
  });
  it("matches ProseMirror JSON exactly for formatting, marks, images, code, and nested content", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          ...paragraph("Styled words"),
          attrs: { fontFamily: "Arial", fontSize: "11pt", marginBottom: "8pt" },
          content: [
            {
              type: "text",
              text: "Styled",
              marks: [
                { type: "bold" },
                { type: "textStyle", attrs: { color: "#123456" } },
              ],
            },
            { type: "hardBreak" },
            {
              type: "text",
              text: " words",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
        { type: "paragraph" },
        {
          type: "image",
          attrs: { src: "data:image/png;base64,AAA=", alt: "Diagram" },
        },
        {
          type: "callout",
          attrs: { kind: "warning" },
          content: [
            {
              type: "bulletList",
              content: [{ type: "listItem", content: [paragraph("Nested")] }],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: {
            language: "javascript",
            filename: "world.js",
            showLineNumbers: true,
            caption: "Example",
          },
          content: [{ type: "text", text: "const tree = 1;\n" }],
        },
      ],
    });
    expect(serializeDocument(doc)).toEqual(doc.toJSON());
    expect(JSON.stringify(serializeDocument(doc))).toBe(
      JSON.stringify(doc.toJSON()),
    );
    expect(serializeDocument(doc)).toBe(serializeDocument(doc));
  });
  it("only recreates edited ancestors, preserving unchanged snapshot branches for save deltas", () => {
    const doc = schema.nodeFromJSON({
      type: "doc",
      content: [
        paragraph("First"),
        {
          type: "blockquote",
          content: [paragraph("Nested"), paragraph("Untouched")],
        },
        paragraph("Last"),
      ],
    });
    const before = serializeDocument(doc);
    const state = EditorState.create({ schema, doc });
    const edited = state.apply(state.tr.insertText("new ", 9)).doc;
    const after = serializeDocument(edited);
    expect(after).toEqual(edited.toJSON());
    expect(after).not.toBe(before);
    expect(after.content![0]).toBe(before.content![0]);
    expect(after.content![1]).not.toBe(before.content![1]);
    expect(after.content![1].content![1]).toBe(before.content![1].content![1]);
    expect(after.content![2]).toBe(before.content![2]);
    expect(before).toEqual(doc.toJSON());
  });
  it("reuses 3999 of 4000 richly formatted paragraphs after one edit", () => {
    const content = Array.from({ length: 4000 }, (_, index) => ({
      ...paragraph(
        `${index} ` + "A technical system changes with the seasons. ".repeat(6),
      ),
      attrs: {
        fontFamily: "Arial",
        fontSize: "11pt",
        lineHeight: "1.15",
        marginBottom: "8pt",
      },
    }));
    const doc = schema.nodeFromJSON({ type: "doc", content });
    const before = serializeDocument(doc);
    const state = EditorState.create({ schema, doc });
    const edited = state.apply(state.tr.insertText("Now ", 1)).doc;
    const after = serializeDocument(edited);
    expect(
      after.content!.filter((node, index) => node === before.content![index]),
    ).toHaveLength(3999);
    expect(after).toEqual(edited.toJSON());
  });
});

describe("cached editor decorations", () => {
  it("does no leaf work on cursor moves and reuses untouched nodes after edits", () => {
    const visits: string[] = [];
    const plugin = cachedDecorationPlugin("runtime-test", (node) => {
      if (!node.isTextblock) return null;
      visits.push(node.textContent);
      return node.textContent
        ? []
        : [
            {
              from: 0,
              to: node.nodeSize,
              node: true,
              attributes: { "data-blank-line": "true" },
            },
          ];
    });
    let state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON({
        type: "doc",
        content: [
          paragraph("First"),
          { type: "blockquote", content: [{ type: "paragraph" }] },
          paragraph("Last"),
        ],
      }),
      plugins: [plugin],
    });
    expect(visits).toHaveLength(3);
    visits.length = 0;
    const decorations = plugin.getState(state);
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 3)),
    );
    expect(plugin.getState(state)).toBe(decorations);
    expect(visits).toEqual([]);
    state = state.apply(state.tr.insertText("New ", 1));
    expect(visits).toEqual(["New First"]);
    const blank = plugin.getState(state)!.find()[0];
    expect(state.doc.nodeAt(blank.from)?.type.name).toBe("paragraph");
    expect(blank.to - blank.from).toBe(2);
  });
  it("preserves multiline code highlights and maps them after preceding prose edits", () => {
    const plugin = codeDecorations("codeBlock", null);
    let state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON({
        type: "doc",
        content: [
          paragraph("Intro"),
          {
            type: "codeBlock",
            attrs: { language: "javascript" },
            content: [
              {
                type: "text",
                text: "/* start\nconst fake = 7;\n*/\nconst real = 1;",
              },
            ],
          },
        ],
      }),
      plugins: [plugin],
    });
    const before = plugin.getState(state)!.find();
    state = state.apply(state.tr.insertText("New ", 1));
    const after = plugin.getState(state)!.find();
    expect(after.map(({ from, to }) => ({ from, to }))).toEqual(
      before.map(({ from, to }) => ({ from: from + 4, to: to + 4 })),
    );
    expect(state.doc.textBetween(after[0].from, after[0].to)).toBe(
      "/* start\nconst fake = 7;\n*/",
    );
  });
});
