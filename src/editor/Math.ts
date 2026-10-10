import { Node, mergeAttributes } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import {
  mathSource,
  renderMath,
  validMathSource,
  MAX_MATH_SOURCE,
} from "../math";
import "katex/dist/katex.min.css";
import "./math.css";

function mathNode(name: "inlineMath" | "blockMath", inline: boolean) {
  return Node.create({
    name,
    group: inline ? "inline" : "block",
    inline,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes: () => ({
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex"),
        renderHTML: () => ({}),
      },
    }),
    parseHTML: () => [
      {
        tag: `[data-codebook-math="${inline ? "inline" : "block"}"]`,
        getAttrs: (element) =>
          validMathSource((element as HTMLElement).getAttribute("data-latex"))
            ? null
            : false,
      },
    ],
    renderHTML({ node, HTMLAttributes }) {
      const content = document.createElement("span");
      content.innerHTML = renderMath(node.attrs.latex, !inline);
      return [
        inline ? "span" : "div",
        mergeAttributes(HTMLAttributes, {
          "data-codebook-math": inline ? "inline" : "block",
          "data-latex": node.attrs.latex,
        }),
        content,
      ];
    },
    renderText: ({ node }) => mathSource({ type: name, attrs: node.attrs }),
    addNodeView() {
      return ({ node: initial, editor, getPos }) => {
        let node = initial;
        const dom = document.createElement(inline ? "span" : "div");
        dom.className = `math-node ${inline ? "math-inline" : "math-block"}`;
        dom.contentEditable = "false";
        const rendered = document.createElement("span");
        rendered.className = "math-rendered";
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "math-edit";
        edit.textContent = "ƒx";
        edit.setAttribute("aria-label", "Edit equation");
        edit.title = "Edit equation (or double-click the equation)";
        dom.append(rendered, edit);
        let form: HTMLSpanElement | null = null;
        const refresh = () => {
          dom.dataset.codebookMath = inline ? "inline" : "block";
          dom.dataset.latex = node.attrs.latex;
          rendered.innerHTML = renderMath(node.attrs.latex, !inline);
          edit.disabled = !editor.isEditable;
        };
        const close = () => {
          form?.remove();
          form = null;
          dom.classList.remove("math-editing");
          editor.view.focus();
        };
        const open = () => {
          if (!editor.isEditable || form) return;
          form = document.createElement("span");
          form.className = "math-source-editor";
          const label = document.createElement("label");
          label.textContent = "Equation source (LaTeX)";
          const textarea = document.createElement("textarea");
          textarea.setAttribute("aria-label", "Equation source");
          textarea.value = node.attrs.latex;
          textarea.maxLength = MAX_MATH_SOURCE;
          textarea.spellcheck = false;
          const save = document.createElement("button");
          save.type = "button";
          save.textContent = "Save equation";
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel";
          const saveSource = () => {
            if (!editor.isEditable) return;
            if (!validMathSource(textarea.value)) {
              textarea.setCustomValidity("Enter an equation before saving.");
              textarea.reportValidity();
              return;
            }
            const position = getPos();
            if (typeof position !== "number") return;
            if (textarea.value !== node.attrs.latex) {
              editor.view.dispatch(
                closeHistory(editor.state.tr).setNodeMarkup(
                  position,
                  undefined,
                  { ...node.attrs, latex: textarea.value },
                ),
              );
              editor.view.dispatch(closeHistory(editor.state.tr));
            }
            close();
          };
          save.onclick = saveSource;
          cancel.onclick = close;
          label.append(textarea);
          form.append(label, save, cancel);
          dom.append(form);
          dom.classList.add("math-editing");
          form.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              saveSource();
            }
          });
          textarea.focus();
          textarea.select();
        };
        edit.onclick = open;
        rendered.ondblclick = open;
        refresh();
        return {
          dom,
          update(next) {
            if (next.type !== node.type) return false;
            node = next;
            refresh();
            return true;
          },
          selectNode() {
            dom.classList.add("ProseMirror-selectednode");
          },
          deselectNode() {
            dom.classList.remove("ProseMirror-selectednode");
          },
          stopEvent: (event) =>
            !!(event.target as Element)?.closest(
              "button,textarea,label,.math-source-editor",
            ),
          ignoreMutation: () => true,
          destroy() {
            form?.remove();
          },
        };
      };
    },
  });
}
export const InlineMath = mathNode("inlineMath", true);
export const BlockMath = mathNode("blockMath", false);
