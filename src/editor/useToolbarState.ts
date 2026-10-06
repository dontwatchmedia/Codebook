import type { Editor } from "@tiptap/core";
import { undoDepth, redoDepth } from "@tiptap/pm/history";
import { useLayoutEffect, useState } from "react";

const activeNames = [
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "codeBlock",
  "bulletList",
  "orderedList",
  "blockquote",
  "link",
  "table",
] as const;
type ToolbarState = Record<(typeof activeNames)[number], boolean> & {
  paragraph: string;
  undo: boolean;
  redo: boolean;
  empty: boolean;
};
function read(editor: Editor): ToolbarState {
  return {
    ...Object.fromEntries(
      activeNames.map((name) => [name, editor.isActive(name)]),
    ),
    paragraph: editor.isActive("heading")
      ? `h${editor.getAttributes("heading").level}`
      : "p",
    undo: undoDepth(editor.state) > 0,
    redo: redoDepth(editor.state) > 0,
    empty: editor.isEmpty,
  } as ToolbarState;
}
const initial = {
  ...Object.fromEntries(activeNames.map((name) => [name, false])),
  paragraph: "p",
  undo: false,
  redo: false,
  empty: true,
} as ToolbarState;
/** Cursor movement refreshes controls at most once per frame, never the paper. */
export function useToolbarState(editor: Editor | null): ToolbarState {
  const [state, setState] = useState(initial);
  useLayoutEffect(() => {
    if (!editor) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (editor.isDestroyed) return;
      const next = read(editor);
      setState((previous) =>
        (Object.keys(next) as (keyof ToolbarState)[]).every(
          (key) => next[key] === previous[key],
        )
          ? previous
          : next,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    editor.on("transaction", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      editor.off("transaction", schedule);
    };
  }, [editor]);
  return state;
}
