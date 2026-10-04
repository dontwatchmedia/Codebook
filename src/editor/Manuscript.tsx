import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Code2,
  List,
  ListOrdered,
  Quote,
  Link,
  ImagePlus,
  Table2,
  Minus,
  Plus,
  X,
  Info,
  Columns3,
  Rows3,
  Trash2,
} from "lucide-react";
import { extensions } from "./extensions";
import { clipboardHTML, NATIVE_MIME } from "../clipboard";
import { validateDocument, type Chapter } from "../model";
import { DOMSerializer } from "@tiptap/pm/model";

interface Props {
  chapter: Chapter;
  systemBible?: boolean;
  onChange: (doc: JSONContent) => void;
  onReady: (editor: Editor | null) => void;
  preview: boolean;
  typewriter: boolean;
  fontSize: number;
  notify: (message: string) => void;
}
export default function Manuscript({
  chapter,
  systemBible = false,
  onChange,
  onReady,
  preview,
  typewriter,
  fontSize,
  notify,
}: Props) {
  const [, redraw] = useState(0),
    [slash, setSlash] = useState(false),
    [link, setLink] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null),
    callback = useRef(onChange);
  callback.current = onChange;
  const editor = useEditor({
    extensions: extensions(),
    content: chapter.document,
    editable: !preview,
    onUpdate: ({ editor }) => {
      callback.current(editor.getJSON());
      const { $from } = editor.state.selection;
      setSlash(
        $from.parent.type.name === "paragraph" &&
          $from.parent.textContent.startsWith("/"),
      );
    },
    onTransaction: () => redraw((v) => v + 1),
    editorProps: {
      attributes: {
        class: "manuscript",
        "aria-label": systemBible ? "Section content" : "Chapter manuscript",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      handlePaste(view, event) {
        if (view.state.selection.$from.parent.type.name === "codeBlock")
          return false;
        const data = event.clipboardData;
        if (!data) return false;
        const native = data.getData(NATIVE_MIME);
        if (native) {
          try {
            const json = JSON.parse(native);
            if (validateDocument(json)) {
              editor?.commands.insertContent(json);
              return true;
            }
          } catch {}
        }
        const html = clipboardHTML(data);
        if (html) {
          editor?.commands.insertContent(html);
          return true;
        }
        const images = Array.from(data.files).filter((f) =>
          /^image\/(png|jpeg|gif|webp)$/.test(f.type),
        );
        if (images.length) {
          images.forEach(insertImage);
          return true;
        }
        return false;
      },
      handleDrop(_view, event) {
        const images = Array.from(event.dataTransfer?.files || []).filter((f) =>
          /^image\/(png|jpeg|gif|webp)$/.test(f.type),
        );
        if (images.length) {
          event.preventDefault();
          images.forEach(insertImage);
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        copy(view, event) {
          if (view.state.selection.empty || !event.clipboardData) return false;
          const slice = view.state.selection.content();
          const wrapper = document.createElement("div");
          wrapper.appendChild(
            DOMSerializer.fromSchema(view.state.schema).serializeFragment(
              slice.content,
            ),
          );
          event.clipboardData.setData(
            NATIVE_MIME,
            JSON.stringify({ type: "doc", content: slice.content.toJSON() }),
          );
          event.clipboardData.setData("text/html", wrapper.innerHTML);
          event.clipboardData.setData(
            "text/plain",
            slice.content.textBetween(0, slice.content.size, "\n\n"),
          );
          event.preventDefault();
          return true;
        },
      },
    },
  });
  function insertImage(image: File) {
    if (image.size > 8 * 1024 * 1024) {
      notify("Please choose an image smaller than 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      editor
        ?.chain()
        .focus()
        .setImage({
          src: String(reader.result),
          alt: image.name.replace(/\.[^.]+$/, ""),
        })
        .run();
    };
    reader.readAsDataURL(image);
  }
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor]);
  useEffect(() => {
    editor?.setEditable(!preview);
  }, [editor, preview]);
  useEffect(() => {
    if (!editor) return;
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setLink(editor.getAttributes("link").href || "");
      }
      if (e.key === "Escape") setSlash(false);
    };
    editor.view.dom.addEventListener("keydown", key);
    return () => editor.view.dom.removeEventListener("keydown", key);
  }, [editor]);
  useEffect(() => {
    if (!editor || !typewriter) return;
    const center = () => {
      const dom = editor.view.domAtPos(editor.state.selection.from).node;
      const el = dom.nodeType === 1 ? (dom as Element) : dom.parentElement;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    editor.on("selectionUpdate", center);
    return () => {
      editor.off("selectionUpdate", center);
    };
  }, [editor, typewriter]);
  if (!editor) return null;
  const tool = (
    label: string,
    icon: React.ReactNode,
    action: () => unknown,
    active = false,
    disabled = false,
  ) => (
    <button
      type="button"
      key={label}
      aria-label={label}
      title={label}
      className={active ? "active" : ""}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        action();
      }}
    >
      {icon}
    </button>
  );
  const inserts = [
    {
      name: "Heading 1",
      hint: "A major section",
      action: () => editor.chain().focus().setHeading({ level: 1 }).run(),
    },
    {
      name: "Heading 2",
      hint: "Give your idea a title",
      action: () => editor.chain().focus().setHeading({ level: 2 }).run(),
    },
    {
      name: "Code block",
      hint: "Code with syntax highlighting",
      action: () =>
        editor.chain().focus().setCodeBlock({ language: "cpp" }).run(),
    },
    {
      name: "Table",
      hint: "Organize a comparison",
      action: () =>
        editor
          .chain()
          .focus()
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      name: "Quote",
      hint: "Let another voice in",
      action: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      name: "Note",
      hint: "An aside for your reader",
      action: () =>
        editor
          .chain()
          .focus()
          .insertContent({
            type: "callout",
            attrs: { kind: "note" },
            content: [{ type: "paragraph" }],
          })
          .run(),
    },
    {
      name: "Image",
      hint: "From your computer",
      action: () => file.current?.click(),
    },
  ];
  return (
    <div className={`editor-body ${preview ? "preview" : ""}`}>
      {!preview && (
        <div
          className="format-toolbar"
          role="toolbar"
          aria-label="Text formatting"
        >
          <div className="tool-group">
            {tool(
              "Undo (Ctrl+Z)",
              <Undo2 />,
              () => editor.chain().focus().undo().run(),
              false,
              !editor.can().undo(),
            )}
            {tool(
              "Redo (Ctrl+Y)",
              <Redo2 />,
              () => editor.chain().focus().redo().run(),
              false,
              !editor.can().redo(),
            )}
          </div>
          <select
            aria-label="Paragraph style"
            value={
              editor.isActive("heading")
                ? `h${editor.getAttributes("heading").level}`
                : "p"
            }
            onChange={(e) =>
              e.target.value === "p"
                ? editor.chain().focus().setParagraph().run()
                : editor
                    .chain()
                    .focus()
                    .setHeading({
                      level: Number(e.target.value.slice(1)) as
                        1 | 2 | 3 | 4 | 5 | 6,
                    })
                    .run()
            }
          >
            <option value="p">Paragraph</option>
            <option value="h1">Heading 1</option>
            <option value="h2">Heading 2</option>
            <option value="h3">Heading 3</option>
            <option value="h4">Heading 4</option>
            <option value="h5">Heading 5</option>
            <option value="h6">Heading 6</option>
          </select>
          <div className="tool-group">
            {tool(
              "Bold (Ctrl+B)",
              <Bold />,
              () => editor.chain().focus().toggleBold().run(),
              editor.isActive("bold"),
            )}
            {tool(
              "Italic (Ctrl+I)",
              <Italic />,
              () => editor.chain().focus().toggleItalic().run(),
              editor.isActive("italic"),
            )}
            {tool(
              "Underline (Ctrl+U)",
              <Underline />,
              () => editor.chain().focus().toggleUnderline().run(),
              editor.isActive("underline"),
            )}
            {tool(
              "Strikethrough",
              <Strikethrough />,
              () => editor.chain().focus().toggleStrike().run(),
              editor.isActive("strike"),
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Inline code",
              <Code />,
              () => editor.chain().focus().toggleCode().run(),
              editor.isActive("code"),
            )}
            {tool(
              "Code block",
              <Code2 />,
              () => editor.chain().focus().toggleCodeBlock().run(),
              editor.isActive("codeBlock"),
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Bulleted list",
              <List />,
              () => editor.chain().focus().toggleBulletList().run(),
              editor.isActive("bulletList"),
            )}
            {tool(
              "Numbered list",
              <ListOrdered />,
              () => editor.chain().focus().toggleOrderedList().run(),
              editor.isActive("orderedList"),
            )}
            {tool(
              "Blockquote",
              <Quote />,
              () => editor.chain().focus().toggleBlockquote().run(),
              editor.isActive("blockquote"),
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Insert link (Ctrl+K)",
              <Link />,
              () => setLink(editor.getAttributes("link").href || ""),
              editor.isActive("link"),
            )}
            {tool("Insert image", <ImagePlus />, () => file.current?.click())}
            {tool("Insert table", <Table2 />, () =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run(),
            )}
          </div>
          {tool("Insert block", <Plus />, () => setSlash(!slash), slash)}
        </div>
      )}
      {editor.isActive("table") && !preview && (
        <div className="table-toolbar">
          <span>Table</span>
          {tool(
            "Add row",
            <>
              <Rows3 /> Row +
            </>,
            () => editor.chain().focus().addRowAfter().run(),
          )}
          {tool(
            "Add column",
            <>
              <Columns3 /> Column +
            </>,
            () => editor.chain().focus().addColumnAfter().run(),
          )}
          {tool(
            "Delete row",
            <>
              <Minus /> Row
            </>,
            () => editor.chain().focus().deleteRow().run(),
          )}
          {tool(
            "Delete column",
            <>
              <Minus /> Column
            </>,
            () => editor.chain().focus().deleteColumn().run(),
          )}
          {tool("Delete table", <Trash2 />, () =>
            editor.chain().focus().deleteTable().run(),
          )}
        </div>
      )}
      <div className="paper-scroll">
        <article
          className="paper"
          style={{ "--editor-size": `${fontSize}px` } as React.CSSProperties}
        >
          <div className="chapter-eyebrow">
            {systemBible
              ? "SYSTEM BIBLE · SECTION"
              : chapter.kind === "front"
                ? "FRONT MATTER"
                : chapter.kind === "back"
                  ? "BACK MATTER"
                  : "THE MANUSCRIPT"}
            <span />
          </div>
          <h1 className="chapter-title">{chapter.title}</h1>
          <EditorContent editor={editor} />
          <div className="paper-end">
            <span /> <span>✧</span> <span />
          </div>
        </article>
      </div>
      {slash && !preview && (
        <div className="insert-popover">
          <div className="popover-heading">
            <span>MAKE ROOM FOR AN IDEA</span>
            <button
              aria-label="Close insert menu"
              onClick={() => setSlash(false)}
            >
              <X size={15} />
            </button>
          </div>
          {inserts
            .filter((i) => {
              const q = editor.state.selection.$from.parent.textContent;
              return (
                !q.startsWith("/") ||
                i.name
                  .toLowerCase()
                  .replace(" ", "")
                  .includes(q.slice(1).toLowerCase().replace(" ", ""))
              );
            })
            .map((i) => (
              <button
                key={i.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const { $from } = editor.state.selection;
                  if ($from.parent.textContent.startsWith("/"))
                    editor.commands.deleteRange({
                      from: $from.start(),
                      to: $from.end(),
                    });
                  i.action();
                  setSlash(false);
                }}
              >
                <span>{i.name}</span>
                <small>{i.hint}</small>
              </button>
            ))}
        </div>
      )}
      {link !== null && (
        <div className="inline-dialog">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (link && !/^(https?:\/\/|mailto:|#)/i.test(link)) {
                notify("Use an https://, http://, mailto: or # link.");
                return;
              }
              if (link)
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: link })
                  .run();
              else editor.chain().focus().unsetLink().run();
              setLink(null);
            }}
          >
            <Info size={18} />
            <input
              autoFocus
              aria-label="Link URL"
              placeholder="https://example.com"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button className="primary" type="submit">
              Apply
            </button>
            <button
              type="button"
              aria-label="Close link dialog"
              onClick={() => setLink(null)}
            >
              <X size={16} />
            </button>
          </form>
        </div>
      )}
      <input
        hidden
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(e) => {
          Array.from(e.target.files || []).forEach(insertImage);
          e.target.value = "";
        }}
      />
    </div>
  );
}
