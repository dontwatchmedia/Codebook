import type { Editor, JSONContent } from "@tiptap/core";
import {
  Fragment,
  type Node as ProseMirrorNode,
  type Schema,
  type Mark,
} from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { marked, type Token } from "marked";
import { parseChapterFile } from "../importChapter";

export interface FormatMarkdownResult {
  changed: boolean;
  scope: "selection" | "section";
}

interface SourceBlock {
  node: ProseMirrorNode;
  position: number;
  from: number;
  to: number;
}

// Semantic marks are already formatted writing, including code that may contain
// Markdown examples. Keep them opaque to the Markdown parser and restore them
// after conversion, together with any new surrounding emphasis.
function sourceFor(blocks: SourceBlock[]) {
  const protectedText = new Map<string, JSONContent>();
  const allText = blocks.map(({ node }) => node.textContent).join("\n");
  let prefix = "\uE000CODEBOOK";
  while (allText.includes(prefix)) prefix += "X";
  const sources = blocks.map(({ node, from, to }) => {
    let source = "";
    node.content.cut(from, to).forEach((child) => {
      if (child.type.name === "hardBreak") source += "\n";
      else if (child.isText) {
        // Auto-linked URL spans are still destinations inside raw Markdown.
        const autoLinkedDestination =
          child.marks.some((mark) => mark.type.name === "link") &&
          /^(?:https?:\/\/|mailto:)/i.test(child.text || "") &&
          /(?:\]\(\s*<?|(?:^|\n) {0,3}\[[^\]]+\]:\s*<?)$/.test(source);
        if (
          !autoLinkedDestination &&
          child.marks.some((mark) => mark.type.name !== "textStyle")
        ) {
          const key = `${prefix}${protectedText.size}\uE001`;
          protectedText.set(key, child.toJSON());
          source += key;
        } else source += child.text;
      }
    });
    return source.replace(/\r\n?/g, "\n");
  });
  let fence: { character: string; length: number } | null = null;
  let inTable = false;
  let source = "";
  for (let index = 0; index < sources.length; index++) {
    const current = sources[index];
    if (index) {
      const previous = sources[index - 1];
      const startsTable =
        !fence &&
        current.includes("|") &&
        /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(current) &&
        marked.lexer(`${previous}\n${current}`, { gfm: true })[0]?.type ===
          "table";
      const continuesTable: boolean =
        inTable && current.includes("|") && !current.includes("\n");
      inTable = startsTable || continuesTable;
      // HTML clipboard content often has one paragraph per source line. Fences,
      // tables and adjacent list items still need single Markdown line breaks.
      const structuralLines =
        startsTable ||
        continuesTable ||
        (previous.trim() !== "" &&
          !previous.includes("\n") &&
          /^ {0,3}(?:=+|-+)\s*$/.test(current)) ||
        (/^\s*(?:[-+*]|\d+[.)])\s/.test(previous) &&
          /^\s*(?:[-+*]|\d+[.)])\s/.test(current));
      source +=
        fence || structuralLines || !previous || !current ? "\n" : "\n\n";
    }
    source += current;
    for (const line of current.split("\n")) {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      if (!fence) fence = { character: match[1][0], length: match[1].length };
      else if (
        match[1][0] === fence.character &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = null;
    }
  }
  return { source, protectedText };
}

function hasMarkdown(tokens: Token[]): boolean {
  return tokens.some((token) => {
    if (
      [
        "heading",
        "list",
        "code",
        "blockquote",
        "hr",
        "table",
        "strong",
        "em",
        "del",
        "codespan",
        "link",
        "image",
      ].includes(token.type)
    )
      return true;
    return (
      "tokens" in token &&
      Array.isArray(token.tokens) &&
      hasMarkdown(token.tokens)
    );
  });
}

function restoreProtected(
  document: JSONContent,
  protectedText: Map<string, JSONContent>,
  schema: Schema,
) {
  const restore = (node: JSONContent, inCode = false): JSONContent[] => {
    if (node.type !== "text") {
      const attrs = { ...node.attrs };
      // Restore descriptive text only; URLs must pass the import sanitizer.
      for (const name of ["alt", "title", "caption", "filename"]) {
        if (typeof attrs[name] !== "string") continue;
        for (const [key, original] of protectedText)
          attrs[name] = attrs[name].split(key).join(original.text || "");
      }
      return [
        {
          ...node,
          ...(node.attrs ? { attrs } : {}),
          ...(node.content
            ? {
                content: node.content.flatMap((child) =>
                  restore(child, inCode || node.type === "codeBlock"),
                ),
              }
            : {}),
        },
      ];
    }
    let pieces: JSONContent[] = [node];
    for (const [key, original] of protectedText) {
      pieces = pieces.flatMap((piece) => {
        if (!piece.text?.includes(key)) return [piece];
        const parts = piece.text.split(key);
        const result: JSONContent[] = [];
        parts.forEach((part, index) => {
          if (index) {
            const existing = original.marks || [];
            const marks = [
              ...(piece.marks || []).filter(
                (mark) => !existing.some((saved) => saved.type === mark.type),
              ),
              ...existing,
            ];
            // Inline code excludes other marks; obey schema exclusions when
            // restoring rich spans inside newly formatted emphasis or links.
            const restoredMarks = marks
              .reduce<readonly Mark[]>(
                (set, mark) => schema.markFromJSON(mark).addToSet(set),
                [],
              )
              .map((mark) => mark.toJSON());
            result.push(
              inCode
                ? { type: "text", text: original.text }
                : {
                    ...original,
                    ...(restoredMarks.length ? { marks: restoredMarks } : {}),
                  },
            );
          }
          if (part) result.push({ ...piece, text: part });
        });
        return result;
      });
    }
    return pieces;
  };
  return restore(document)[0];
}

/** Explicitly format literal Markdown without reinterpreting existing rich blocks. */
export function formatMarkdown(editor: Editor): FormatMarkdownResult {
  const { state } = editor;
  const { selection } = state;
  const scope = selection.empty ? "section" : "selection";
  const result: FormatMarkdownResult = { changed: false, scope };
  if (!editor.isEditable) return result;
  const replacements: { from: number; to: number; content: Fragment }[] = [];
  const convert = (blocks: SourceBlock[]) => {
    if (!blocks.length) return;
    const { source, protectedText } = sourceFor(blocks);
    if (!source.trim() || !hasMarkdown(marked.lexer(source, { gfm: true })))
      return;
    const parsed = restoreProtected(
      parseChapterFile("formatted.md", source).document,
      protectedText,
      state.schema,
    );
    const converted = state.schema.nodeFromJSON(parsed).content;
    const first = blocks[0],
      last = blocks[blocks.length - 1];
    const from = first.position + 1 + first.from;
    const to = last.position + 1 + last.to;
    const partial = first.from > 0 || last.to < last.node.content.size;
    // Inline selections stay inside their original paragraph/heading, retaining
    // the surrounding text and its block attributes exactly.
    if (
      blocks.length === 1 &&
      converted.childCount === 1 &&
      converted.firstChild?.type.name === "paragraph" &&
      first.node.type.name !== "codeBlock"
    ) {
      if (partial || first.node.type.name !== "paragraph") {
        replacements.push({ from, to, content: converted.firstChild.content });
        return;
      }
    }
    const content: ProseMirrorNode[] = [];
    if (first.from > 0)
      content.push(first.node.copy(first.node.content.cut(0, first.from)));
    converted.forEach((node) => content.push(node));
    if (last.to < last.node.content.size)
      content.push(last.node.copy(last.node.content.cut(last.to)));
    replacements.push({
      from: first.position,
      to: last.position + last.node.nodeSize,
      content: Fragment.from(content),
    });
  };

  // An inline selection may also live in an existing heading, list or callout.
  // Its enclosing structure is retained; section-wide conversion never walks
  // into those already formatted blocks.
  if (
    !selection.empty &&
    selection.$from.sameParent(selection.$to) &&
    selection.$from.parent.isTextblock &&
    selection.$from.parent.type.name !== "codeBlock"
  ) {
    convert([
      {
        node: selection.$from.parent,
        position: selection.$from.before(),
        from: selection.$from.parentOffset,
        to: selection.$to.parentOffset,
      },
    ]);
  } else {
    let run: SourceBlock[] = [];
    const flush = () => {
      convert(run);
      run = [];
    };
    state.doc.forEach((node, position) => {
      const from = selection.empty
        ? 0
        : Math.max(0, selection.from - position - 1);
      const to = selection.empty
        ? node.content.size
        : Math.min(node.content.size, selection.to - position - 1);
      if (
        to < from ||
        (!selection.empty &&
          (selection.to <= position + 1 ||
            selection.from >= position + 1 + node.content.size))
      ) {
        flush();
        return;
      }
      if (node.type.name === "paragraph")
        run.push({ node, position, from, to });
      else {
        flush();
        const language = String(node.attrs.language || "").toLowerCase();
        if (
          node.type.name === "codeBlock" &&
          (language === "markdown" ||
            language === "md" ||
            (!selection.empty && ["", "plaintext", "text"].includes(language)))
        )
          convert([{ node, position, from, to }]);
      }
    });
    flush();
  }
  const transaction = closeHistory(state.tr);
  // Work backwards so every range continues to refer to the original document.
  for (const replacement of replacements.reverse()) {
    if (
      !state.doc
        .slice(replacement.from, replacement.to)
        .content.eq(replacement.content)
    )
      transaction.replaceWith(
        replacement.from,
        replacement.to,
        replacement.content,
      );
  }
  if (!transaction.docChanged) return result;
  editor.view.dispatch(transaction.scrollIntoView());
  // Isolate both sides: one Undo restores the raw source, and subsequent typing
  // does not join the formatting operation in the history stack.
  editor.view.dispatch(closeHistory(editor.state.tr));
  return { changed: true, scope };
}
