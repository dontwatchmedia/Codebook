import { useEffect, useRef, useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { generateJSON } from "@tiptap/core";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  FolderPlus,
  Focus,
  PanelRight,
  Plus,
  Search,
  Settings2,
  X,
  MoreHorizontal,
  Trash2,
  Pencil,
  Clock3,
  Code2,
  ListTree,
  Eye,
  CircleHelp,
  Upload,
  Save,
  RotateCcw,
  Command,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import Library from "./components/Library";
import ThemeToggle from "./components/ThemeToggle";
import ThemePicker from "./components/ThemePicker";
import OutlineTree from "./components/OutlineTree";
import InlineRename from "./components/InlineRename";
import {
  SectionIcon,
  ProgressIcon,
  iconOptions,
  progressOptions,
} from "./components/SectionSymbols";
import {
  applyTheme,
  isDarkTheme,
  readTheme,
  saveTheme,
  themeOptions,
} from "./theme";
import {
  applyLayout,
  readLayout,
  saveLayout,
  type WritingLayout,
} from "./layout";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readZoom, saveZoom } from "./zoom";
import Modal from "./components/Modal";
import Manuscript from "./editor/Manuscript";
import { extensions } from "./editor/extensions";
import {
  bookWords,
  chapters,
  docText,
  emptyDoc,
  makeBook,
  makeChapter,
  ancestors,
  descendants,
  outlineEntries,
  reparentNode,
  insertChapter,
  removeNodePreserveChildren,
  moveNode,
  moveRelative,
  now,
  uid,
  validateBook,
  wordCount,
  type Book,
  type BookNode,
  type Chapter,
  type Status,
  type Progress,
  type SectionIconName,
} from "./model";
import {
  clearRecovery,
  deleteBook,
  desktop,
  getBackups,
  loadBooks,
  saveBook,
  saveFile,
  stageBook,
  storagePath,
  type Backup,
} from "./storage";
import { sampleBook } from "./sample";
import { markdownHTML, sanitizeHTML } from "./clipboard";
import { exportHTML, exportMarkdown } from "./export";
import { findMatches } from "./search";

let boot: ReturnType<typeof loadBooks> | null = null;
function initialize() {
  if (!boot)
    boot = (async () => {
      const result = await loadBooks();
      if (
        !result.books.length &&
        !result.recovery.length &&
        !localStorage.getItem("codebook.initialized")
      ) {
        const book = sampleBook();
        await saveBook(book);
        result.books.push(book);
      }
      localStorage.setItem("codebook.initialized", "true");
      return result;
    })();
  return boot;
}
type Dialog =
  | "new"
  | "book"
  | "chapter"
  | "part"
  | "export"
  | "search"
  | "preferences"
  | "help"
  | "backups"
  | "palette"
  | null;
export default function App() {
  const [books, setBooks] = useState<Book[]>([]),
    [activeId, setActiveId] = useState<string | null>(null),
    [chapterId, setChapterId] = useState("");
  const [loading, setLoading] = useState(true),
    [fatal, setFatal] = useState(""),
    [recovery, setRecovery] = useState<Book[]>([]),
    [saved, setSaved] = useState("Saved on this device"),
    [toast, setToast] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null),
    [editBookId, setEditBookId] = useState(""),
    [nodeEdit, setNodeEdit] = useState<BookNode | null>(null),
    [confirm, setConfirm] = useState<{
      title: string;
      message: string;
      action: () => void;
    } | null>(null);
  const [newParentId, setNewParentId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState("technical");
  const [layout, setLayout] = useState(readLayout);
  const [writingZoom, setWritingZoom] = useState(readZoom);
  const [projectRename, setProjectRename] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [inspector, setInspector] = useState(true),
    [focus, setFocus] = useState(false),
    [preview, setPreview] = useState(false),
    [typewriter, setTypewriter] = useState(false),
    [theme, setTheme] = useState(readTheme),
    [fontSize, setFontSize] = useState(
      Number(localStorage.getItem("codebook.fontSize")) || 18,
    );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set()),
    [query, setQuery] = useState(""),
    [searchFilter, setSearchFilter] = useState("all"),
    [findOpen, setFindOpen] = useState(false),
    [find, setFind] = useState(""),
    [replace, setReplace] = useState(""),
    [caseSensitive, setCaseSensitive] = useState(false),
    [matchIndex, setMatchIndex] = useState(0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [backups, setBackups] = useState<Backup[]>([]),
    [path, setPath] = useState(""),
    [exportFormat, setExportFormat] = useState("markdown");
  const booksRef = useRef(books),
    dirty = useRef(new Map<string, Book>()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    editorRef = useRef<Editor | null>(null),
    importRef = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  booksRef.current = books;
  const book = books.find((b) => b.id === activeId),
    chapter =
      book &&
      (chapters(book).find((c) => c.id === chapterId) || chapters(book)[0]);
  const editedBook = books.find((b) => b.id === editBookId) || book;
  const bible = book?.mode === "bible";
  const sectionName = bible ? "section" : "chapter";
  function revealSection(id: string, project = book) {
    setChapterId(id);
    if (project)
      setCollapsed((prev) => {
        const next = new Set(prev);
        ancestors(project, id).forEach((n) => next.delete(n.id));
        return next;
      });
    setFindOpen(false);
  }
  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 5000);
  };
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    const batch = Array.from(dirty.current.values());
    dirty.current.clear();
    if (!batch.length) return;
    try {
      for (const b of batch) await saveBook(b);
      if (!dirty.current.size) setSaved("Saved on this device");
    } catch (e) {
      for (const b of batch)
        if (!dirty.current.has(b.id)) dirty.current.set(b.id, b);
      setSaved("Save failed — retry");
      notify(
        `Save failed: ${String(e)}. Recovery data is retained where available. Export a project copy now.`,
      );
    }
  }
  function updateBook(next: Book) {
    const previous = booksRef.current.find((b) => b.id === next.id);
    // Every edit gets a distinct, increasing revision time, including same-tick edits.
    const modified = new Date(
      Math.max(Date.now(), (Date.parse(previous?.modified || "") || 0) + 1),
    ).toISOString();
    const changed = { ...next, modified };
    const list = booksRef.current.some((b) => b.id === next.id)
      ? booksRef.current.map((b) => (b.id === next.id ? changed : b))
      : [...booksRef.current, changed];
    booksRef.current = list;
    setBooks(list);
    dirty.current.set(changed.id, changed);
    setSaved("Saving…");
    void stageBook(changed).catch(() =>
      notify(
        "Recovery could not be written. Keep the app open until the main save finishes, or export a project copy.",
      ),
    );
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 650);
  }
  function updateChapter(patch: Partial<Chapter>) {
    const b = booksRef.current.find((b) => b.id === activeId);
    if (!b || !chapter) return;
    updateBook({
      ...b,
      nodes: b.nodes.map((n) =>
        n.id === chapter.id
          ? ({ ...n, ...patch, modified: now() } as Chapter)
          : n,
      ),
    });
  }
  useEffect(() => {
    let canceled = false;
    initialize()
      .then((result) => {
        if (canceled) return;
        booksRef.current = result.books;
        setBooks(result.books);
        setRecovery(result.recovery);
        if (result.warnings.length) setFatal(result.warnings.join("\n"));
        setLoading(false);
      })
      .catch((e) => {
        setFatal(String(e));
        setLoading(false);
      });
    storagePath()
      .then(setPath)
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    applyTheme(theme);
    void saveTheme(theme).catch(() =>
      notify(
        "The appearance choice could not be saved. You can still use this theme for this session.",
      ),
    );
    if (desktop)
      void getCurrentWindow()
        .setTheme(isDarkTheme(theme) ? "dark" : "light")
        .catch(console.error);
  }, [theme]);
  useEffect(() => {
    applyLayout(layout);
    void saveLayout(layout).catch(() =>
      notify("The writing layout could not be saved."),
    );
  }, [layout]);
  useEffect(() => {
    localStorage.setItem("codebook.fontSize", String(fontSize));
  }, [fontSize]);
  useEffect(() => {
    void saveZoom(writingZoom).catch(() =>
      notify("The writing zoom could not be saved."),
    );
  }, [writingZoom]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const before = () => {
      void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", before);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          void flush();
        }
        if (e.key.toLowerCase() === "f" && book) {
          e.preventDefault();
          if (e.shiftKey) {
            setQuery("");
            setDialog("search");
          } else setFindOpen((v) => !v);
        }
        if (e.shiftKey && e.key.toLowerCase() === "p") {
          e.preventDefault();
          setQuery("");
          setDialog("palette");
        }
        if (e.shiftKey && e.key.toLowerCase() === "f" && !book) {
          e.preventDefault();
        }
      }
      if (e.key === "Escape") {
        setFocus(false);
        setFindOpen(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [book]);
  function openBook(b: Book) {
    setActiveId(b.id);
    setCollapsed(new Set());
    setChapterId(
      chapters(b).find((c) => c.kind === "chapter")?.id || chapters(b)[0].id,
    );
    setPreview(false);
  }
  function newNode(type: "chapter" | "part", parentId?: string | null) {
    setNodeEdit(null);
    setNewParentId(
      parentId === undefined ? chapter?.parentId || null : parentId,
    );
    setDialog(type);
  }
  async function importFile(file: File) {
    try {
      const raw = await file.text();
      if (/\.(codebook|json)$/i.test(file.name)) {
        const parsed = JSON.parse(raw);
        if (!validateBook(parsed))
          throw new Error("This is not a valid CodeBook project.");
        const imported = {
          ...parsed,
          id: uid(),
          title: parsed.title,
          created: now(),
          modified: now(),
        };
        updateBook(imported);
        openBook(imported);
        notify("Project imported as an independent copy.");
      } else {
        if (!book) throw new Error("Open a book before importing a chapter.");
        const html = /\.html?$/i.test(file.name)
          ? sanitizeHTML(raw)
          : /\.md$/i.test(file.name)
            ? markdownHTML(raw)
            : `<p>${raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "</p><p>")}</p>`;
        const c = makeChapter(file.name.replace(/\.[^.]+$/, ""));
        c.document = generateJSON(html, extensions());
        if (bible) c.parentId = chapter?.id || null;
        const imported = insertChapter(book, c);
        updateBook(imported);
        revealSection(c.id, imported);
        notify(`Imported as a new ${sectionName}.`);
      }
    } catch (e) {
      notify(`Import failed: ${String(e)}`);
    }
  }
  function removeNode(node: BookNode) {
    if (!book) return;
    if (node.type === "chapter" && chapters(book).length === 1) {
      notify(`Keep at least one ${sectionName} in a project.`);
      return;
    }
    setConfirm({
      title: `Delete ${node.type === "part" ? "part" : sectionName}?`,
      message:
        node.type === "part"
          ? "Its chapters will stay in the book, outside the part."
          : `“${node.title}” will be removed. Its child sections and their writing will stay, one level higher. Download a project copy first if you want an independent backup.`,
      action: () => {
        const next = removeNodePreserveChildren(book, node.id);
        updateBook(next);
        if (chapterId === node.id) setChapterId(chapters(next)[0].id);
        setConfirm(null);
        setDialog(null);
      },
    });
  }
  function navigateFind(direction: number) {
    const ed = editorRef.current;
    if (!ed) return;
    const matches = findMatches(ed, find, caseSensitive);
    if (!matches.length) {
      notify("No matches in this chapter.");
      return;
    }
    const index = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(index);
    ed.chain().setTextSelection(matches[index]).scrollIntoView().run();
  }
  function replaceMatches(all: boolean) {
    const ed = editorRef.current;
    if (!ed || preview) return;
    const matches = findMatches(ed, find, caseSensitive);
    if (!matches.length) return;
    const selected = all ? matches : [matches[matchIndex % matches.length]];
    let tr = ed.state.tr;
    for (const m of [...selected].reverse())
      tr = tr.insertText(replace, m.from, m.to);
    ed.view.dispatch(tr);
    notify(
      `Replaced ${selected.length} match${selected.length === 1 ? "" : "es"}.`,
    );
  }
  const commands = [
    { label: "Create a new book", run: () => setDialog("new") },
    ...(book
      ? [
          { label: "Add chapter", run: () => newNode("chapter") },
          { label: "Add part", run: () => newNode("part") },
          {
            label: "Insert code block",
            run: () => {
              editorRef.current?.chain().focus().toggleCodeBlock().run();
              setDialog(null);
            },
          },
          { label: "Export manuscript", run: () => setDialog("export") },
          {
            label: "Search book",
            run: () => {
              setQuery("");
              setDialog("search");
            },
          },
          {
            label: "Toggle focus mode",
            run: () => {
              setFocus((v) => !v);
              setDialog(null);
            },
          },
          {
            label: "Toggle reading preview",
            run: () => {
              setPreview((v) => !v);
              setDialog(null);
            },
          },
        ]
      : []),
    { label: "Preferences", run: () => setDialog("preferences") },
  ];
  const words = chapter ? wordCount(chapter.document) : 0;
  if (loading)
    return (
      <div className="loading">
        <BookOpen size={36} />
        <h1>CodeBook.</h1>
        <p>Opening your writing space…</p>
      </div>
    );
  return (
    <>
      <div className={focus ? "app focus-mode" : "app"}>
        {!book ? (
          <Library
            books={books}
            open={openBook}
            create={() => {
              setNewTemplate("technical");
              setDialog("new");
            }}
            createBible={() => {
              setNewTemplate("bible");
              setDialog("new");
            }}
            settings={() => setDialog("preferences")}
            theme={theme}
            toggleTheme={() => setTheme(isDarkTheme(theme) ? "light" : "dark")}
            onThemeChange={setTheme}
            edit={(b) => {
              setEditBookId(b.id);
              setDialog("book");
            }}
            importFile={importFile}
          />
        ) : (
          <>
            <header className="app-header">
              <button
                className="brand"
                onClick={() => {
                  void flush();
                  setActiveId(null);
                }}
                title="Back to bookshelf"
              >
                <BookOpen size={25} />
                <span>
                  CodeBook<span className="brand-dot">.</span>
                </span>
              </button>
              <span className="header-separator" />
              <button
                className="header-book"
                onClick={() => {
                  setEditBookId(book.id);
                  setDialog("book");
                }}
              >
                {book.title}
                <ChevronDown size={14} />
              </button>
              <button
                className={`save-status ${saved.startsWith("Save failed") ? "error" : ""}`}
                onClick={() => void flush()}
                title="Save now (Ctrl+S)"
              >
                {saved === "Saving…" ? (
                  <span className="status-dot saving" />
                ) : saved.startsWith("Save failed") ? (
                  <RotateCcw size={13} />
                ) : (
                  <Check size={14} />
                )}{" "}
                {saved}
              </button>
              <div className="header-actions">
                <ThemeToggle
                  theme={theme}
                  toggle={() => setTheme(isDarkTheme(theme) ? "light" : "dark")}
                />
                <ThemePicker theme={theme} onChange={setTheme} />
                <button
                  className="subtle"
                  onClick={() => {
                    setQuery("");
                    setDialog("search");
                  }}
                >
                  <Search size={17} />
                  <span>Search</span>
                  <kbd>Ctrl ⇧ F</kbd>
                </button>
                <button
                  className="primary small"
                  onClick={() => setDialog("export")}
                >
                  <Download size={16} /> Export <ChevronDown size={13} />
                </button>
              </div>
            </header>
            <div className={`workspace ${bible ? "bible-workspace" : ""}`}>
              <aside className="structure">
                <button
                  className="back-library"
                  onClick={() => {
                    void flush();
                    setActiveId(null);
                  }}
                >
                  <ArrowLeft size={14} /> Your bookshelf
                </button>
                <div className="structure-book">
                  <div className="eyebrow">
                    {bible ? "SYSTEM BIBLE" : "THE BOOK"}
                  </div>
                  {projectRename?.id === book.id ? (
                    <InlineRename
                      className="project-rename"
                      label="Rename project"
                      value={projectRename.title}
                      onCancel={() => setProjectRename(null)}
                      onCommit={(title) => {
                        const current = booksRef.current.find(
                          (b) => b.id === book.id,
                        );
                        if (current) updateBook({ ...current, title });
                        setProjectRename(null);
                      }}
                    />
                  ) : (
                    <h2>
                      <button
                        className="project-title-button"
                        title="Double-click or press F2 to rename"
                        onDoubleClick={() =>
                          setProjectRename({ id: book.id, title: book.title })
                        }
                        onKeyDown={(event) => {
                          if (event.key === "F2") {
                            event.preventDefault();
                            setProjectRename({
                              id: book.id,
                              title: book.title,
                            });
                          }
                        }}
                      >
                        {book.title}
                      </button>
                    </h2>
                  )}
                  <p>{book.subtitle || "A work in progress"}</p>
                </div>
                <div className="structure-label">
                  <span>{bible ? "SYSTEMS & SECTIONS" : "MANUSCRIPT"}</span>
                  <button
                    aria-label="Book settings"
                    onClick={() => {
                      setEditBookId(book.id);
                      setDialog("book");
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                <OutlineTree
                  book={book}
                  activeId={chapter?.id || ""}
                  collapsed={collapsed}
                  onToggle={(id) =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      next.has(id) ? next.delete(id) : next.add(id);
                      return next;
                    })
                  }
                  onSelect={revealSection}
                  onRename={(id, title) => {
                    const current = booksRef.current.find(
                      (b) => b.id === book.id,
                    );
                    if (current)
                      updateBook({
                        ...current,
                        nodes: current.nodes.map((node) =>
                          node.id === id
                            ? {
                                ...node,
                                title,
                                ...(node.type === "chapter"
                                  ? { modified: now() }
                                  : {}),
                              }
                            : node,
                        ),
                      });
                  }}
                  onEmojiChange={(id, emoji) => {
                    const current = booksRef.current.find(
                      (b) => b.id === book.id,
                    );
                    if (current)
                      updateBook({
                        ...current,
                        nodes: current.nodes.map((node) =>
                          node.id === id && node.type === "chapter"
                            ? { ...node, emoji, modified: now() }
                            : node,
                        ),
                      });
                  }}
                  onEdit={(node) => {
                    setNodeEdit(node);
                    setDialog(node.type);
                  }}
                  onMove={(movingId, targetId) => {
                    const moved = moveNode(book, movingId, targetId);
                    if (moved === book) return;
                    updateBook(moved);
                    if (
                      chapter &&
                      (movingId === chapter.id ||
                        descendants(book, movingId).some(
                          (n) => n.id === chapter.id,
                        ))
                    )
                      revealSection(chapter.id, moved);
                  }}
                  onAddChild={(parentId) => newNode("chapter", parentId)}
                />
                <div className="structure-add">
                  <button
                    onClick={() => newNode("chapter", bible ? null : undefined)}
                  >
                    <Plus size={16} /> Add {sectionName}
                  </button>
                  {bible ? (
                    <button
                      onClick={() => newNode("chapter", chapter?.id || null)}
                    >
                      <FolderPlus size={16} /> Add child section
                    </button>
                  ) : (
                    <button onClick={() => newNode("part")}>
                      <FolderPlus size={16} /> Add part
                    </button>
                  )}
                  <button onClick={() => importRef.current?.click()}>
                    <Upload size={15} /> Import {sectionName}
                  </button>
                </div>
                <div className="book-progress">
                  <div>
                    <span>
                      {bible ? "SYSTEM PROGRESS" : "YOUR BOOK, TAKING SHAPE"}
                    </span>
                    <LeafIcon />
                  </div>
                  {bible ? (
                    <>
                      <p>
                        <strong>
                          {
                            chapters(book).filter(
                              (c) => c.progress === "complete",
                            ).length
                          }
                        </strong>
                        <span>
                          {" "}
                          / {chapters(book).length} sections complete
                        </span>
                      </p>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${(chapters(book).filter((c) => c.progress === "complete").length / chapters(book).length) * 100}%`,
                          }}
                        />
                      </div>
                      <small>Progress is set for each section.</small>
                    </>
                  ) : (
                    <>
                      <p>
                        <strong>{bookWords(book).toLocaleString()}</strong>
                        <span>
                          {" "}
                          / {(book.goal || 50000).toLocaleString()} words
                        </span>
                      </p>
                      <div className="progress-track">
                        <span
                          style={{
                            width: `${Math.min(100, (bookWords(book) / (book.goal || 50000)) * 100)}%`,
                          }}
                        />
                      </div>
                      <small>One word closer.</small>
                    </>
                  )}
                </div>
                <button
                  className="structure-help"
                  onClick={() => setDialog("help")}
                >
                  <CircleHelp size={15} /> A little guidance <kbd>?</kbd>
                </button>
              </aside>
              <main className="editor-column">
                <div className="editor-top">
                  <div
                    className="breadcrumb"
                    title={
                      chapter
                        ? [
                            ...ancestors(book, chapter.id).map((n) => n.title),
                            chapter.title,
                          ].join(" / ")
                        : ""
                    }
                  >
                    {chapter &&
                      ancestors(book, chapter.id).map((n) => (
                        <span className="breadcrumb-parent" key={n.id}>
                          <button
                            onClick={() =>
                              n.type === "chapter"
                                ? revealSection(n.id)
                                : setCollapsed((prev) => {
                                    const next = new Set(prev);
                                    next.delete(n.id);
                                    return next;
                                  })
                            }
                          >
                            {n.title}
                          </button>
                          <ChevronRight size={12} />
                        </span>
                      ))}
                    {!chapter?.parentId && (
                      <>
                        <span>{bible ? "System bible" : "Manuscript"}</span>
                        <ChevronRight size={12} />
                      </>
                    )}
                    <strong>{chapter?.title}</strong>
                  </div>
                  <div>
                    <select
                      className="layout-picker"
                      aria-label="Writing layout"
                      title="Compact layout uses more of the screen; original spacing keeps document margins"
                      value={layout}
                      onChange={(event) =>
                        setLayout(event.target.value as WritingLayout)
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="original">Original spacing</option>
                    </select>
                    <button
                      className={`icon-button ${preview ? "active" : ""}`}
                      title="Reading preview"
                      aria-label="Reading preview"
                      aria-pressed={preview}
                      onClick={() => setPreview((v) => !v)}
                    >
                      <Eye size={17} />
                    </button>
                    <button
                      className={`icon-button ${focus ? "active" : ""}`}
                      title="Focus mode (Esc to exit)"
                      aria-label="Focus mode"
                      aria-pressed={focus}
                      onClick={() => setFocus((v) => !v)}
                    >
                      <Focus size={17} />
                    </button>
                    <button
                      className="icon-button inspector-toggle"
                      aria-label="Toggle inspector"
                      aria-pressed={inspector}
                      onClick={() => setInspector((v) => !v)}
                    >
                      <PanelRight size={17} />
                    </button>
                  </div>
                </div>
                {findOpen && (
                  <div className="find-bar">
                    <Search size={16} />
                    <input
                      autoFocus
                      aria-label={bible ? "Find in section" : "Find in chapter"}
                      placeholder={
                        bible ? "Find in section" : "Find in chapter"
                      }
                      value={find}
                      onChange={(e) => {
                        setFind(e.target.value);
                        setMatchIndex(0);
                      }}
                    />
                    <button
                      className={caseSensitive ? "active" : ""}
                      title="Case sensitive"
                      onClick={() => setCaseSensitive((v) => !v)}
                    >
                      Aa
                    </button>
                    <button
                      aria-label="Previous match"
                      onClick={() => navigateFind(-1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label="Next match"
                      onClick={() => navigateFind(1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <input
                      aria-label="Replace with"
                      placeholder="Replace with"
                      value={replace}
                      onChange={(e) => setReplace(e.target.value)}
                    />
                    <button
                      disabled={preview}
                      onClick={() => replaceMatches(false)}
                    >
                      Replace
                    </button>
                    <button
                      disabled={preview}
                      onClick={() => replaceMatches(true)}
                    >
                      All
                    </button>
                    <button
                      aria-label="Close find"
                      onClick={() => setFindOpen(false)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                {chapter && (
                  <Manuscript
                    key={`${chapter.id}-${editorRevision}-${bible}`}
                    chapter={chapter}
                    systemBible={bible}
                    onChange={(document) => updateChapter({ document })}
                    onReady={(ed) => (editorRef.current = ed)}
                    preview={preview}
                    typewriter={typewriter}
                    fontSize={fontSize}
                    writingZoom={writingZoom}
                    notify={notify}
                  />
                )}
                <footer className="editor-footer">
                  <span>
                    <span className="status-dot" />
                    {preview
                      ? "Reading preview"
                      : "A little progress, every day."}
                  </span>
                  <div>
                    <span>{words.toLocaleString()} words</span>
                    <span>{Math.max(1, Math.ceil(words / 225))} min read</span>
                    <select
                      className="writing-zoom"
                      aria-label="Writing zoom"
                      title="Display zoom — saved font sizes stay unchanged"
                      value={writingZoom}
                      onChange={(event) =>
                        setWritingZoom(Number(event.target.value))
                      }
                    >
                      {[50, 60, 70, 75, 80, 90, 100, 110, 125, 150, 175, 200]
                        .concat(writingZoom)
                        .filter(
                          (value, index, all) => all.indexOf(value) === index,
                        )
                        .sort((a, b) => a - b)
                        .map((value) => (
                          <option key={value} value={value}>
                            {value}%
                          </option>
                        ))}
                    </select>
                  </div>
                </footer>
              </main>
              {inspector && chapter && (
                <aside className="inspector">
                  <div className="inspector-title">
                    <span>{bible ? "Section details" : "Chapter details"}</span>
                    <button
                      aria-label="Close inspector"
                      onClick={() => setInspector(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="inspector-section">
                    <div className="eyebrow">THE DETAILS</div>
                    <label>
                      Title
                      <input
                        aria-label={bible ? "Section title" : "Chapter title"}
                        value={chapter.title}
                        onChange={(e) =>
                          updateChapter({ title: e.target.value })
                        }
                      />
                    </label>
                    {bible ? (
                      <>
                        <label>
                          Progress
                          <select
                            aria-label="Section progress"
                            value={chapter.progress || "not-started"}
                            onChange={(e) =>
                              updateChapter({
                                progress: e.target.value as Progress,
                              })
                            }
                          >
                            {progressOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Section icon
                          <select
                            aria-label="Section icon"
                            value={chapter.icon || "document"}
                            onChange={(e) =>
                              updateChapter({
                                icon: e.target.value as SectionIconName,
                              })
                            }
                          >
                            {iconOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="section-marker-preview">
                          <SectionIcon icon={chapter.icon} size={17} />
                          <span>{chapter.title || "Untitled section"}</span>
                          <ProgressIcon progress={chapter.progress} size={17} />
                        </div>
                      </>
                    ) : (
                      <label>
                        Status
                        <select
                          aria-label="Chapter status"
                          value={chapter.status}
                          onChange={(e) =>
                            updateChapter({ status: e.target.value as Status })
                          }
                        >
                          {[
                            "Idea",
                            "Outline",
                            "Draft",
                            "Revision",
                            "Editing",
                            "Final",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="parent-section-label">
                      {bible ? "Parent section" : "Part"}
                      <select
                        aria-label={bible ? "Parent section" : "Chapter part"}
                        value={chapter.parentId || ""}
                        onChange={(e) => {
                          const moved = reparentNode(
                            book,
                            chapter.id,
                            e.target.value || null,
                          );
                          updateBook(moved);
                          setCollapsed((prev) => {
                            const next = new Set(prev);
                            ancestors(moved, chapter.id).forEach((n) =>
                              next.delete(n.id),
                            );
                            return next;
                          });
                        }}
                      >
                        <option value="">
                          {bible ? "Top level" : "No part"}
                        </option>
                        {outlineEntries(book)
                          .filter(
                            ({ node }) =>
                              node.id !== chapter.id &&
                              !descendants(book, chapter.id).some(
                                (child) => child.id === node.id,
                              ) &&
                              (bible ||
                                node.type === "part" ||
                                node.id === chapter.parentId),
                          )
                          .map(({ node }) => (
                            <option key={node.id} value={node.id}>
                              {[
                                ...ancestors(book, node.id).map((n) => n.title),
                                node.title,
                              ].join(" / ")}
                            </option>
                          ))}
                      </select>
                    </label>
                    {bible ? (
                      <button
                        className="section-child-button"
                        onClick={() => newNode("chapter", chapter.id)}
                      >
                        <Plus size={15} /> Add child section
                      </button>
                    ) : (
                      <label>
                        Placement
                        <select
                          aria-label="Chapter placement"
                          value={chapter.kind}
                          onChange={(e) =>
                            updateChapter({
                              kind: e.target.value as Chapter["kind"],
                            })
                          }
                        >
                          <option value="chapter">Chapter</option>
                          <option value="front">Front matter</option>
                          <option value="back">Back matter</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="inspector-section">
                    <div className="section-heading">
                      <span className="eyebrow">AT A GLANCE</span>
                      <ListTree size={14} />
                    </div>
                    <div className="stat-grid">
                      <div>
                        <strong>{words.toLocaleString()}</strong>
                        <span>Words</span>
                      </div>
                      <div>
                        <strong>
                          {Math.max(1, Math.ceil(words / 225))}
                          <small> min</small>
                        </strong>
                        <span>Reading time</span>
                      </div>
                    </div>
                    {!bible && (
                      <>
                        <label className="goal-label">
                          Chapter goal
                          <input
                            type="number"
                            min="1"
                            max="1000000"
                            aria-label="Chapter word goal"
                            value={chapter.goal || 2000}
                            onChange={(e) =>
                              updateChapter({
                                goal: Math.max(1, Number(e.target.value)),
                              })
                            }
                          />
                        </label>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${Math.min(100, (words / (chapter.goal || 2000)) * 100)}%`,
                            }}
                          />
                        </div>
                        <p className="goal-caption">
                          {Math.round((words / (chapter.goal || 2000)) * 100)}%
                          of your word goal
                        </p>
                      </>
                    )}
                  </div>
                  <div className="inspector-section">
                    <label className="eyebrow">
                      TAGS
                      <input
                        aria-label={bible ? "Section tags" : "Chapter tags"}
                        placeholder="e.g. beginner, cpp"
                        value={chapter.tags}
                        onChange={(e) =>
                          updateChapter({ tags: e.target.value })
                        }
                      />
                    </label>
                    <div className="tags">
                      {chapter.tags
                        ?.split(",")
                        .filter((t) => t.trim())
                        .map((t) => (
                          <span key={t}>{t.trim()}</span>
                        ))}
                    </div>
                  </div>
                  <div className="inspector-section notes-section">
                    <div className="section-heading">
                      <label htmlFor="chapter-notes" className="eyebrow">
                        NOTES TO SELF
                      </label>
                      <Pencil size={13} />
                    </div>
                    <textarea
                      id="chapter-notes"
                      value={chapter.notes}
                      placeholder="An idea to come back to…"
                      onChange={(e) => updateChapter({ notes: e.target.value })}
                    />
                    <small>Just for you. Never included in exports.</small>
                  </div>
                  <div className="inspector-bottom">
                    <button
                      onClick={() => {
                        setNodeEdit(chapter);
                        setDialog("chapter");
                      }}
                    >
                      <Settings2 size={14} />{" "}
                      {bible ? "Section actions" : "Chapter actions"}
                    </button>
                    <span>
                      Edited{" "}
                      {new Date(chapter.modified).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  </div>
                </aside>
              )}
            </div>
          </>
        )}
      </div>
      {fatal && (
        <div className="persistent-warning" role="alert">
          <span>{fatal}</span>
          <button onClick={() => setFatal("")} aria-label="Dismiss warning">
            <X size={16} />
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          <span>{toast}</span>
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "new" && (
        <Modal
          title="A new beginning."
          subtitle="Give your idea a place to grow. You can change everything later."
          close={() => setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const b = makeBook(
                String(data.get("title")).trim(),
                String(data.get("template")),
              );
              b.author = String(data.get("author"));
              updateBook(b);
              openBook(b);
              setDialog(null);
            }}
          >
            <label>
              {newTemplate === "bible" ? "Project title" : "Book title"}
              <input
                name="title"
                autoFocus
                required
                maxLength={160}
                placeholder={
                  newTemplate === "bible"
                    ? "e.g. Open Blue"
                    : "The book you want to write"
                }
              />
            </label>
            <label>
              Author
              <input name="author" placeholder="Your name" />
            </label>
            <label>
              Start with
              <select
                name="template"
                value={newTemplate}
                onChange={(e) => setNewTemplate(e.target.value)}
              >
                <option value="technical">
                  Technical book — preface, part, chapter, appendix
                </option>
                <option value="blank">Blank book — a fresh page</option>
                <option value="bible">
                  System bible — overview, systems, and nested features
                </option>
              </select>
            </label>
            <div className="modal-footer">
              <span>Yours, from the very first word.</span>
              <button className="primary" type="submit">
                {newTemplate === "bible"
                  ? "Create system bible"
                  : "Create book"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "book" && editedBook && (
        <Modal
          title={
            editedBook.mode === "bible"
              ? "About this system bible"
              : "About this book"
          }
          subtitle="Your project details and organization."
          close={() => setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              updateBook({
                ...editedBook,
                mode: String(data.get("mode")) as "book" | "bible",
                title: String(data.get("title")).trim(),
                subtitle: String(data.get("subtitle")),
                author: String(data.get("author")),
                description: String(data.get("description")),
                goal:
                  Number(data.get("goal")) ||
                  (data.get("mode") === "book" ? 50000 : 0),
                color: String(data.get("color")),
                language: String(data.get("language")),
              });
              setDialog(null);
            }}
          >
            <label>
              Title
              <input
                autoFocus
                required
                name="title"
                defaultValue={editedBook.title}
              />
            </label>
            <label>
              Project type
              <select name="mode" defaultValue={editedBook.mode || "book"}>
                <option value="book">Book</option>
                <option value="bible">System bible</option>
              </select>
              <small>
                Switch views any time. Your writing and section hierarchy stay
                intact.
              </small>
            </label>
            <label>
              Subtitle
              <input name="subtitle" defaultValue={editedBook.subtitle} />
            </label>
            <div className="form-row">
              <label>
                Author
                <input name="author" defaultValue={editedBook.author} />
              </label>
              <label>
                Language
                <input
                  name="language"
                  defaultValue={editedBook.language || "en-US"}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                name="description"
                defaultValue={editedBook.description}
              />
            </label>
            <div className="form-row">
              <label>
                Word goal
                <input
                  name="goal"
                  type="number"
                  min={editedBook.mode === "bible" ? "0" : "1"}
                  max="10000000"
                  defaultValue={editedBook.goal}
                />
              </label>
              <label>
                Cover color
                <input
                  name="color"
                  type="color"
                  defaultValue={editedBook.color || "#314d43"}
                />
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setConfirm({
                    title: "Delete this book?",
                    message: `“${editedBook.title}” will leave your bookshelf. Desktop projects are kept in the local trash folder.`,
                    action: () => {
                      void (async () => {
                        await flush();
                        await deleteBook(editedBook.id);
                        const list = booksRef.current.filter(
                          (b) => b.id !== editedBook.id,
                        );
                        booksRef.current = list;
                        setBooks(list);
                        if (activeId === editedBook.id) setActiveId(null);
                        setConfirm(null);
                        setDialog(null);
                        notify("Book removed from your bookshelf.");
                      })().catch((e) => notify(String(e)));
                    },
                  })
                }
              >
                <Trash2 size={15} /> Delete book
              </button>
              <button className="primary" type="submit">
                Save details
              </button>
            </div>
          </form>
        </Modal>
      )}
      {(dialog === "chapter" || dialog === "part") && book && (
        <Modal
          title={
            nodeEdit
              ? `Edit ${dialog === "part" ? "part" : sectionName}`
              : `A new ${dialog === "part" ? "part" : sectionName}`
          }
          subtitle={
            dialog === "part"
              ? "Gather related chapters into a part."
              : "A fresh page for your next idea."
          }
          close={() => setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const title = String(data.get("title")).trim();
              if (nodeEdit) {
                updateBook({
                  ...book,
                  nodes: book.nodes.map((n) =>
                    n.id === nodeEdit.id ? { ...n, title } : n,
                  ),
                });
              } else if (dialog === "part") {
                updateBook({
                  ...book,
                  nodes: [...book.nodes, { id: uid(), type: "part", title }],
                });
              } else {
                const parentId = String(data.get("parent")) || null;
                const c = makeChapter(title, parentId);
                if (bible) {
                  c.icon = String(data.get("icon")) as SectionIconName;
                  c.progress = String(data.get("progress")) as Progress;
                  c.goal = 0;
                }
                const created = insertChapter(book, c);
                updateBook(created);
                revealSection(c.id, created);
              }
              setDialog(null);
            }}
          >
            <label>
              Title
              <input
                autoFocus
                name="title"
                required
                defaultValue={nodeEdit?.title || ""}
                placeholder={
                  dialog === "part"
                    ? "e.g. The fundamentals"
                    : "e.g. A first step"
                }
              />
            </label>
            {dialog === "chapter" && !nodeEdit && (
              <>
                <label>
                  {bible ? "Parent section" : "Part"}
                  <select name="parent" defaultValue={newParentId || ""}>
                    <option value="">{bible ? "Top level" : "No part"}</option>
                    {outlineEntries(book)
                      .filter(
                        ({ node }) =>
                          bible ||
                          node.type === "part" ||
                          node.id === newParentId,
                      )
                      .map(({ node }) => (
                        <option key={node.id} value={node.id}>
                          {[
                            ...ancestors(book, node.id).map((n) => n.title),
                            node.title,
                          ].join(" / ")}
                        </option>
                      ))}
                  </select>
                </label>
                {bible && (
                  <div className="form-row">
                    <label>
                      Section icon
                      <select name="icon" defaultValue="layers">
                        {iconOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Progress
                      <select name="progress" defaultValue="not-started">
                        {progressOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </>
            )}
            {nodeEdit && (
              <div className="node-actions">
                <button
                  type="button"
                  onClick={() => {
                    updateBook(moveRelative(book, nodeEdit.id, -1));
                  }}
                >
                  <ArrowUp size={15} /> Move up
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateBook(moveRelative(book, nodeEdit.id, 1));
                  }}
                >
                  <ArrowDown size={15} /> Move down
                </button>
              </div>
            )}
            <div className="modal-footer">
              {nodeEdit ? (
                <button
                  type="button"
                  className="danger"
                  onClick={() => removeNode(nodeEdit)}
                >
                  <Trash2 size={15} /> Delete{" "}
                  {dialog === "part" ? "part" : sectionName}
                </button>
              ) : (
                <span />
              )}
              <button className="primary" type="submit">
                {nodeEdit
                  ? "Save title"
                  : `Create ${dialog === "part" ? "part" : sectionName}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "export" && book && (
        <Modal
          title="Let your words travel."
          subtitle="Export a clean manuscript, or keep a complete project copy."
          close={() => setDialog(null)}
        >
          <div className="export-options">
            {[
              [
                "markdown",
                "Markdown",
                ".md",
                "Portable text with headings, lists, tables, and fenced code.",
              ],
              [
                "html",
                "HTML",
                ".html",
                "A readable book with highlighted code and a table of contents.",
              ],
              [
                "project",
                "CodeBook project",
                ".codebook",
                "Everything: content, images, code details, notes, and settings.",
              ],
            ].map(([value, title, ext, description]) => (
              <button
                key={value}
                className={exportFormat === value ? "selected" : ""}
                onClick={() => setExportFormat(value)}
              >
                <span className="export-icon">
                  {value === "markdown" ? (
                    <Code2 />
                  ) : value === "html" ? (
                    <FileText />
                  ) : (
                    <BookOpen />
                  )}
                </span>
                <span>
                  <strong>
                    {title} <small>{ext}</small>
                  </strong>
                  <p>{description}</p>
                </span>
                <span className="radio-dot" />
              </button>
            ))}
          </div>
          <div className="export-summary">
            <span>
              {chapters(book).length} {bible ? "sections" : "chapters"}
            </span>
            <span>{bookWords(book).toLocaleString()} words</span>
            <span>
              {exportFormat === "project"
                ? "Includes private notes"
                : "Private notes excluded"}
            </span>
          </div>
          <div className="modal-footer">
            <span>Ready when you are.</span>
            <button
              className="primary"
              onClick={() => {
                void (async () => {
                  await flush();
                  const slug =
                    book.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-") ||
                    "Untitled";
                  const type = exportFormat;
                  const done = await saveFile(
                    `${slug}.${type === "markdown" ? "md" : type === "html" ? "html" : "codebook"}`,
                    type === "markdown"
                      ? exportMarkdown(book)
                      : type === "html"
                        ? exportHTML(book)
                        : JSON.stringify(book, null, 2),
                    type === "html"
                      ? "text/html"
                      : type === "markdown"
                        ? "text/markdown"
                        : "application/json",
                  );
                  if (done) {
                    notify("Your export is ready.");
                    setDialog(null);
                  }
                })().catch((e) => notify(`Export failed: ${String(e)}`));
              }}
            >
              <Download size={16} /> Export{" "}
              {exportFormat === "project"
                ? "project"
                : bible
                  ? "system bible"
                  : "book"}
            </button>
          </div>
        </Modal>
      )}
      {(dialog === "search" || dialog === "palette") && (
        <Modal
          title={
            dialog === "search" ? "Find an idea." : "What would you like to do?"
          }
          close={() => setDialog(null)}
          wide
        >
          <label className="modal-search">
            <Search size={19} />
            <input
              autoFocus
              aria-label={
                dialog === "search" ? "Search book" : "Search commands"
              }
              value={query}
              placeholder={
                dialog === "search"
                  ? "Search words, code, or tags…"
                  : "Type a command…"
              }
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {dialog === "search" && book ? (
            <>
              <div className="search-filters">
                {["all", "text", "code", "tags"].map((f) => (
                  <button
                    key={f}
                    className={searchFilter === f ? "active" : ""}
                    onClick={() => setSearchFilter(f)}
                  >
                    {f === "all" ? "Everything" : f}
                  </button>
                ))}
              </div>
              <div className="search-results">
                {chapters(book)
                  .filter((c) => {
                    if (!query.trim()) return false;
                    const code = (doc: JSONContent): string =>
                      doc.type === "codeBlock"
                        ? `${doc.attrs?.language || ""} ${docText(doc)}`
                        : (doc.content || []).map(code).join(" ");
                    const haystack =
                      searchFilter === "code"
                        ? code(c.document)
                        : searchFilter === "tags"
                          ? c.tags
                          : searchFilter === "text"
                            ? docText(c.document)
                            : `${c.title} ${docText(c.document)} ${c.tags} ${code(c.document)}`;
                    return haystack.toLowerCase().includes(query.toLowerCase());
                  })
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        revealSection(c.id);
                        setDialog(null);
                        setFind(query);
                        setFindOpen(true);
                      }}
                    >
                      <FileText size={18} />
                      <span>
                        <strong>{c.title}</strong>
                        {bible && (
                          <small>
                            {ancestors(book, c.id)
                              .map((n) => n.title)
                              .join(" / ") || "Top level"}
                          </small>
                        )}
                        <p>
                          {(() => {
                            const s = docText(c.document);
                            const at = s
                              .toLowerCase()
                              .indexOf(query.toLowerCase());
                            return (
                              (at > 45 ? "…" : "") +
                              s.slice(
                                Math.max(0, at - 45),
                                Math.max(0, at - 45) + 170,
                              )
                            );
                          })()}
                        </p>
                      </span>
                      <ArrowUpRightIcon />
                    </button>
                  ))}
                {!query && (
                  <div className="empty-state">
                    <Search size={26} />
                    <p>Every idea has a place. Let’s find it.</p>
                  </div>
                )}
                {query &&
                  !chapters(book).some((c) =>
                    `${c.title} ${docText(c.document)} ${c.tags}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ) && <p className="muted">No matching chapters.</p>}
              </div>
            </>
          ) : (
            <div className="command-results">
              {commands
                .filter((c) =>
                  c.label.toLowerCase().includes(query.toLowerCase()),
                )
                .map((c) => (
                  <button key={c.label} onClick={c.run}>
                    <Command size={16} />
                    {c.label}
                    <ArrowRight size={15} />
                  </button>
                ))}
            </div>
          )}
        </Modal>
      )}
      {dialog === "preferences" && (
        <Modal
          title="Make yourself at home."
          subtitle="A writing space that feels like yours."
          close={() => setDialog(null)}
        >
          <label>Appearance</label>
          <div className="theme-options">
            {themeOptions.map(({ id, label, swatch, description }) => (
              <button
                key={id}
                className={theme === id ? "selected" : ""}
                aria-pressed={theme === id}
                title={description}
                onClick={() => setTheme(id)}
              >
                <span className="theme-swatch" style={{ background: swatch }} />
                {label}
              </button>
            ))}
          </div>
          <label>
            Writing layout
            <select
              aria-label="Preferred writing layout"
              value={layout}
              onChange={(event) =>
                setLayout(event.target.value as WritingLayout)
              }
            >
              <option value="compact">Compact — use more of the screen</option>
              <option value="original">Original document spacing</option>
            </select>
            <small className="muted">
              Compact trims display gaps. Saved formatting and exports keep
              their original spacing.
            </small>
          </label>
          <label>
            Default text size <span className="muted">{fontSize} px</span>
            <input
              aria-label="Default text size"
              type="range"
              min="14"
              max="26"
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
            <small className="muted">
              Used for text without its own font size. Pasted document sizes
              stay preserved. Use Writing zoom below the editor to change how
              large the whole document looks.
            </small>
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={typewriter}
              onChange={(e) => setTypewriter(e.target.checked)}
            />{" "}
            Typewriter mode{" "}
            <span className="muted">Keep the current paragraph centered</span>
          </label>
          <div className="storage-note">
            <Save size={18} />
            <div>
              <strong>
                {desktop ? "Local project storage" : "Browser preview storage"}
              </strong>
              <p>{path}</p>
              <small>
                Autosave after 650 ms. Up to 30 snapshots, taken every five
                minutes of editing.
              </small>
            </div>
          </div>
          {book && (
            <button
              className="secondary full"
              onClick={() => {
                getBackups(book.id)
                  .then(setBackups)
                  .then(() => setDialog("backups"))
                  .catch((e) => notify(String(e)));
              }}
            >
              <Clock3 size={16} /> Browse backup snapshots
            </button>
          )}
          <div className="modal-footer">
            <button className="subtle" onClick={() => setDialog("help")}>
              <CircleHelp size={16} /> Keyboard & writing guide
            </button>
            <button className="primary" onClick={() => setDialog(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {dialog === "backups" && (
        <Modal
          title="Earlier words, safely kept."
          subtitle="Restoring a snapshot replaces the current manuscript. Export a project copy first to preserve your current work."
          close={() => setDialog(null)}
        >
          <div className="backup-list">
            {!backups.length ? (
              <p className="muted">
                Snapshots appear after you edit a saved book.
              </p>
            ) : (
              backups.map((b) => (
                <button
                  key={b.name}
                  onClick={() =>
                    setConfirm({
                      title: "Restore this snapshot?",
                      message: `Restore the version from ${new Date(b.modified).toLocaleString()}?`,
                      action: () => {
                        const restored = { ...b.book, modified: now() };
                        updateBook(restored);
                        setEditorRevision((v) => v + 1);
                        openBook(restored);
                        setConfirm(null);
                        setDialog(null);
                        notify("Snapshot restored.");
                      },
                    })
                  }
                >
                  <Clock3 size={18} />
                  <span>
                    {new Date(b.modified).toLocaleString()}
                    <small>{bookWords(b.book)} words</small>
                  </span>
                  <RotateCcw size={16} />
                </button>
              ))
            )}
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="A little guidance."
          subtitle="The technology should disappear. Your ideas should shine."
          close={() => setDialog(null)}
        >
          <div className="help-copy">
            <p>
              <strong>Write naturally.</strong> Use the toolbar, standard
              shortcuts, or type / in a paragraph to insert a block. Press the
              down arrow at the end of a code block to continue writing.
            </p>
            <p>
              <strong>Bring your formatting.</strong> Paste rich content from a
              browser or raw Markdown. Headings, lists, inline code, tables, and
              fenced code become editable blocks.
            </p>
            <p>
              <strong>Make room for change.</strong> Drag chapters onto a part
              or above another chapter. Chapter details also let you move a
              chapter between parts.
            </p>
            <p>
              <strong>Build a system bible.</strong> Choose New system bible on
              the bookshelf, or change Project type in your project settings.
              Add child sections for systems, features, and deeper details.
              Section details lets you choose an icon, set progress, or move a
              whole branch to a new parent. Each section keeps its own progress;
              completing a parent does not complete its children.
            </p>
            <p>
              <strong>Keep a copy.</strong> Autosave runs as you write. Export a
              CodeBook project for a portable backup with notes and code
              metadata.
            </p>
          </div>
          <div className="shortcut-grid">
            {[
              ["Bold / italic", "Ctrl B / I"],
              ["Insert link", "Ctrl K"],
              ["Undo / redo", "Ctrl Z / Y"],
              ["Find in chapter", "Ctrl F"],
              ["Search book", "Ctrl Shift F"],
              ["Command palette", "Ctrl Shift P"],
              ["Leave focus mode", "Esc"],
              ["Save now", "Ctrl S"],
            ].map(([a, b]) => (
              <div key={a}>
                <span>{a}</span>
                <kbd>{b}</kbd>
              </div>
            ))}
          </div>
          <button className="primary full" onClick={() => setDialog(null)}>
            Back to the words
          </button>
        </Modal>
      )}
      {recovery.length > 0 && (
        <Modal
          title="Your words are still here."
          subtitle="We found changes that had not reached the last save. Restore them or keep the saved versions."
          close={() => {}}
        >
          <div className="recovery-list">
            {recovery.map((b) => (
              <div key={b.id}>
                <BookOpen size={20} />
                <span>
                  <strong>{b.title}</strong>
                  <small>
                    {new Date(b.modified).toLocaleString()} · {bookWords(b)}{" "}
                    words
                  </small>
                </span>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button
              onClick={() => {
                void Promise.all(recovery.map((b) => clearRecovery(b.id)))
                  .then(() => setRecovery([]))
                  .catch((e) =>
                    notify(`Could not clear recovery: ${String(e)}`),
                  );
              }}
            >
              Keep saved versions
            </button>
            <button
              className="primary"
              onClick={() => {
                recovery.forEach(updateBook);
                setRecovery([]);
                notify("Recovered your latest changes.");
              }}
            >
              Restore changes
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={confirm.title}
          subtitle={confirm.message}
          close={() => setConfirm(null)}
        >
          <div className="modal-footer">
            <button onClick={() => setConfirm(null)}>Cancel</button>
            <button className="primary" onClick={confirm.action}>
              Confirm
            </button>
          </div>
        </Modal>
      )}
      <input
        ref={importRef}
        hidden
        type="file"
        accept=".md,.html,.htm,.txt,.codebook,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
function LeafIcon() {
  return <span aria-hidden="true">↗</span>;
}
function ArrowUpRightIcon() {
  return <ArrowRight size={15} />;
}
