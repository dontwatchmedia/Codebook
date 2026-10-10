import { describe, expect, it, vi } from "vitest";
import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { extensions } from "../../src/editor/extensions";

const paragraph = {
  type: "paragraph",
  content: [{ type: "text", text: "Intro" }],
};
const code = {
  type: "codeBlock",
  attrs: { language: "ini" },
  content: [{ type: "text", text: "key=value" }],
};

describe("trailing paragraph after edits only", () => {
  it.each<JSONContent>([
    code,
    { type: "horizontalRule" },
    { type: "blockMath", attrs: { latex: "x^2" } },
  ])(
    "does not modify a loaded section ending in $type for reading-state or UI transactions",
    (last) => {
      const update = vi.fn();
      const editor = new Editor({
        extensions: extensions(),
        content: { type: "doc", content: [paragraph, last] },
        onUpdate: update,
      });
      try {
        const original = editor.state.doc;
        editor.view.dispatch(
          editor.state.tr.setSelection(
            TextSelection.create(editor.state.doc, 2),
          ),
        );
        editor.view.dispatch(
          editor.state.tr.setMeta("searchHighlight", "view only"),
        );
        editor.view.dispatch(editor.state.tr.setMeta("focus", { event: null }));
        expect(editor.state.doc).toBe(original);
        expect(update).not.toHaveBeenCalled();
      } finally {
        editor.destroy();
      }
    },
  );

  it("still appends one editable paragraph after a real change to a section ending in code", () => {
    const update = vi.fn();
    const editor = new Editor({
      extensions: extensions(),
      content: { type: "doc", content: [paragraph, code] },
      onUpdate: update,
    });
    try {
      editor.view.dispatch(editor.state.tr.insertText("New ", 1));
      expect(editor.getJSON().content?.map((node) => node.type)).toEqual([
        "paragraph",
        "codeBlock",
        "paragraph",
      ]);
      expect(editor.state.doc.firstChild?.textContent).toBe("New Intro");
      expect(editor.state.doc.lastChild?.textContent).toBe("");
      expect(update).toHaveBeenCalledTimes(1);
      editor.view.dispatch(editor.state.tr.insertText("Again ", 1));
      expect(editor.state.doc.childCount).toBe(3);
    } finally {
      editor.destroy();
    }
  });

  it("retains the upstream explicit skip behavior across later view-only transactions", () => {
    const editor = new Editor({
      extensions: extensions(),
      content: { type: "doc", content: [paragraph, code] },
    });
    try {
      editor.view.dispatch(
        editor.state.tr.insertText("New ", 1).setMeta("skipTrailingNode", true),
      );
      const edited = editor.state.doc;
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(edited, 2)),
      );
      expect(editor.state.doc).toBe(edited);
      expect(editor.state.doc.lastChild?.type.name).toBe("codeBlock");
    } finally {
      editor.destroy();
    }
  });
});
