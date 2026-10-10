import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  WandSparkles,
} from "lucide-react";
import { extensions } from "./extensions";
import { formatMarkdown } from "./formatMarkdown";
import { parsePastedHTML } from "./pasteHTML";
import { serializeDocument } from "./runtime";
import { useToolbarState } from "./useToolbarState";
import { clipboardHTML, NATIVE_MIME } from "../clipboard";
import { mathSource } from "../math";
import { validateDocument, type Chapter } from "../model";
import { DOMSerializer } from "@tiptap/pm/model";
import { Selection, TextSelection } from "@tiptap/pm/state";
import {
  readReadingState,
  rememberChapter,
  saveReadingState,
} from "./readingState";

interface Props {
  bookId: string;
  chapter: Chapter;
  systemBible?: boolean;
  onChange: (doc: JSONContent) => void;
  onReady: (editor: Editor | null) => void;
  preview: boolean;
  typewriter: boolean;
  fontSize: number;
  writingZoom: number;
  notify: (message: string) => void;
}
export default function Manuscript({
  bookId,
  chapter,
  systemBible = false,
  onChange,
  onReady,
  preview,
  typewriter,
  fontSize,
  writingZoom,
  notify,
}: Props) {
  const [slash, setSlash] = useState(false),
    [link, setLink] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null),
    paperScroll = useRef<HTMLDivElement>(null),
    callback = useRef(onChange);
  callback.current = onChange;
  const editor = useEditor({
    extensions: extensions(),
    content: chapter.document,
    editable: !preview,
    shouldRerenderOnTransaction: false,
    onCreate: ({ editor }) => {
      serializeDocument(editor.state.doc, chapter.document);
    },
    onUpdate: ({ editor }) => {
      callback.current(serializeDocument(editor.state.doc));
      const { $from } = editor.state.selection;
      setSlash(
        $from.parent.type.name === "paragraph" &&
          $from.parent.textContent.startsWith("/"),
      );
    },
    editorProps: {
      attributes: {
        class: "manuscript",
        "aria-label": systemBible ? "Section content" : "Chapter manuscript",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      handleKeyDown(view, event) {
        if (
          !(event.ctrlKey || event.metaKey) ||
          event.altKey ||
          (event.key !== "Home" && event.key !== "End")
        )
          return false;
        // Make the intended document navigation explicit. Otherwise a browser
        // Ctrl+Home immediately after focus can be mistaken for a focus reset
        // by ProseMirror's 200ms DOM-selection safeguard.
        const edge =
          event.key === "Home"
            ? Selection.atStart(view.state.doc)
            : Selection.atEnd(view.state.doc);
        const selection = event.shiftKey
          ? TextSelection.between(view.state.selection.$anchor, edge.$head)
          : edge;
        view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
        return true;
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
          editor?.commands.insertContent(
            parsePastedHTML(html, view.state.schema),
          );
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
        focus(view, event) {
          // A plain DOM/keyboard focus otherwise waits 20ms for ProseMirror to
          // restore its selection. Fast typing can land at the browser's
          // default start before that timer runs. Sync now, without scrolling
          // or changing the document; pointer placement still follows normally.
          if (event.target === view.dom) view.focus();
          return false;
        },
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
            slice.content.textBetween(0, slice.content.size, "\n\n", (node) =>
              ["inlineMath", "blockMath"].includes(node.type.name)
                ? mathSource({ type: node.type.name, attrs: node.attrs })
                : node.type.spec.leafText?.(node) || "",
            ),
          );
          event.preventDefault();
          return true;
        },
      },
    },
  });
  const toolbar = useToolbarState(editor);
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
  useLayoutEffect(() => {
    if (!editor || !paperScroll.current) return;
    const scroll = paperScroll.current;
    const saved = readReadingState(bookId, chapter.id);
    if (saved) {
      const limit = editor.state.doc.content.size;
      const selection = TextSelection.between(
        editor.state.doc.resolve(Math.min(saved.anchor, limit)),
        editor.state.doc.resolve(Math.min(saved.head, limit)),
      );
      editor.view.dispatch(
        editor.state.tr.setSelection(selection).setMeta("addToHistory", false),
      );
      // Restore before onReady, so an explicit search jump can take priority.
      // Do not focus: navigating from the outline or Find must keep its focus.
      scroll.scrollTo({
        top: saved.scrollTop,
        left: saved.scrollLeft,
        behavior: "instant",
      });
    }
    rememberChapter(bookId, chapter.id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (editor.isDestroyed) return;
      const { anchor, head } = editor.state.selection;
      saveReadingState(bookId, chapter.id, {
        anchor,
        head,
        scrollTop: scroll.scrollTop,
        scrollLeft: scroll.scrollLeft,
      });
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(save, 150);
    };
    editor.on("selectionUpdate", schedule);
    editor.on("update", schedule);
    scroll.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      save();
      editor.off("selectionUpdate", schedule);
      editor.off("update", schedule);
      scroll.removeEventListener("scroll", schedule);
      window.removeEventListener("pagehide", save);
    };
  }, [editor, bookId, chapter.id]);
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor]);
  useEffect(() => {
    // Reading mode changes the view, not the document or its modified date.
    editor?.setEditable(!preview, false);
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
              !toolbar.undo,
            )}
            {tool(
              "Redo (Ctrl+Y)",
              <Redo2 />,
              () => editor.chain().focus().redo().run(),
              false,
              !toolbar.redo,
            )}
          </div>
          <select
            aria-label="Paragraph style"
            value={toolbar.paragraph}
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
              toolbar.bold,
            )}
            {tool(
              "Italic (Ctrl+I)",
              <Italic />,
              () => editor.chain().focus().toggleItalic().run(),
              toolbar.italic,
            )}
            {tool(
              "Underline (Ctrl+U)",
              <Underline />,
              () => editor.chain().focus().toggleUnderline().run(),
              toolbar.underline,
            )}
            {tool(
              "Strikethrough",
              <Strikethrough />,
              () => editor.chain().focus().toggleStrike().run(),
              toolbar.strike,
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Inline code",
              <Code />,
              () => editor.chain().focus().toggleCode().run(),
              toolbar.code,
            )}
            {tool(
              "Code block",
              <Code2 />,
              () => editor.chain().focus().toggleCodeBlock().run(),
              toolbar.codeBlock,
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Bulleted list",
              <List />,
              () => editor.chain().focus().toggleBulletList().run(),
              toolbar.bulletList,
            )}
            {tool(
              "Numbered list",
              <ListOrdered />,
              () => editor.chain().focus().toggleOrderedList().run(),
              toolbar.orderedList,
            )}
            {tool(
              "Blockquote",
              <Quote />,
              () => editor.chain().focus().toggleBlockquote().run(),
              toolbar.blockquote,
            )}
          </div>
          <div className="tool-group">
            {tool(
              "Insert link (Ctrl+K)",
              <Link />,
              () => setLink(editor.getAttributes("link").href || ""),
              toolbar.link,
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
          <button
            type="button"
            className="format-markdown-button"
            aria-label="Format Markdown"
            title={`Format selected text as Markdown, or the whole ${systemBible ? "section" : "chapter"} when nothing is selected. Undo restores the original text.`}
            disabled={toolbar.empty}
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              try {
                const result = formatMarkdown(editor);
                editor.commands.focus();
                setSlash(false);
                notify(
                  result.changed
                    ? "Markdown formatted. Undo restores the original text."
                    : "No Markdown formatting found in this text.",
                );
              } catch {
                notify("Unable to format this text as Markdown.");
              }
            }}
          >
            <WandSparkles aria-hidden="true" />
            <span>Format Markdown</span>
          </button>
        </div>
      )}
      {toolbar.table && !preview && (
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
      <div className="paper-scroll" ref={paperScroll}>
        <article
          className="paper"
          style={
            {
              "--editor-size": `${fontSize}px`,
              zoom: `${writingZoom}%`,
            } as React.CSSProperties
          }
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
