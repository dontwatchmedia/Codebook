import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import { lowlight } from "./highlighting";
import { Copy, Check, Hash, Code2 } from "lucide-react";
import { useState } from "react";
import { ImportedTextStyle, ImportedBlockStyle } from "./formatting";
export const languages = [
  ["plaintext", "Plain text"],
  ["cpp", "C++"],
  ["c", "C"],
  ["csharp", "C#"],
  ["python", "Python"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["rust", "Rust"],
  ["go", "Go"],
  ["java", "Java"],
  ["kotlin", "Kotlin"],
  ["swift", "Swift"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["sql", "SQL"],
  ["bash", "Bash"],
  ["powershell", "PowerShell"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
];
function CodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <NodeViewWrapper
      className={`code-block ${node.attrs.showLineNumbers ? "numbered" : ""}`}
    >
      <div className="code-header" contentEditable={false}>
        <Code2 size={15} />
        <select
          aria-label="Code language"
          value={node.attrs.language || "auto"}
          disabled={!editor.isEditable}
          onChange={(e) =>
            updateAttributes({
              language: e.target.value === "auto" ? null : e.target.value,
            })
          }
        >
          <option value="auto">Auto detect</option>
          {languages.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <span className="code-divider" />
        <input
          aria-label="Code filename"
          placeholder="Untitled snippet"
          value={node.attrs.filename || ""}
          readOnly={!editor.isEditable}
          onChange={(e) => updateAttributes({ filename: e.target.value })}
        />
        <button
          title="Toggle line numbers"
          aria-label="Toggle line numbers"
          aria-pressed={!!node.attrs.showLineNumbers}
          onClick={() =>
            updateAttributes({ showLineNumbers: !node.attrs.showLineNumbers })
          }
          disabled={!editor.isEditable}
        >
          <Hash size={14} />
        </button>
        <button onClick={copy} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="code-body">
        {node.attrs.showLineNumbers && (
          <div
            className="line-numbers"
            contentEditable={false}
            aria-hidden="true"
          >
            {node.textContent.split("\n").map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        )}
        <pre spellCheck={false}>
          <NodeViewContent<"code"> as="code" style={{ whiteSpace: "pre" }} />
        </pre>
      </div>
      {node.attrs.caption && (
        <div className="code-caption" contentEditable={false}>
          {node.attrs.caption}
        </div>
      )}
    </NodeViewWrapper>
  );
}
const TechnicalCode = CodeBlockLowlight.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      filename: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-filename"),
        renderHTML: (a) => ({ "data-filename": a.filename }),
      },
      showLineNumbers: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-line-numbers") === "true",
        renderHTML: (a) => ({ "data-line-numbers": String(a.showLineNumbers) }),
      },
      caption: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-caption"),
        renderHTML: (a) => ({ "data-caption": a.caption }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeView);
  },
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      Tab: () =>
        this.editor.isActive("codeBlock")
          ? this.editor.commands.insertContent("    ")
          : false,
    };
  },
}).configure({ lowlight, defaultLanguage: null });
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: "note",
        parseHTML: (el) => el.getAttribute("data-callout") || "note",
      },
    };
  },
  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      "aside",
      mergeAttributes(HTMLAttributes, { "data-callout": node.attrs.kind }),
      0,
    ];
  },
});
export function extensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      link: { openOnClick: false, protocols: ["https", "http", "mailto"] },
    }),
    ImportedTextStyle,
    ImportedBlockStyle,
    TechnicalCode,
    Image.configure({ allowBase64: true }),
    TableKit.configure({ table: { resizable: true } }),
    Callout,
    Placeholder.configure({
      placeholder: "Let the next idea take shape. Type / to insert a block…",
    }),
  ];
}
