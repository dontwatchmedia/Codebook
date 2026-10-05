import {
  BookOpen,
  Plus,
  ArrowUpRight,
  Search,
  FolderOpen,
  MoreHorizontal,
  Terminal,
  Leaf,
  ArrowRight,
  HardDrive,
  Settings2,
  Layers,
} from "lucide-react";
import { useRef, useState } from "react";
import { bookWords, chapters, type Book } from "../model";
import { desktop } from "../storage";
import ThemeToggle from "./ThemeToggle";
import ThemePicker from "./ThemePicker";
import type { Theme } from "../theme";
import "./outline.css";
interface Props {
  books: Book[];
  open: (b: Book) => void;
  create: () => void;
  createBible?: () => void;
  settings: () => void;
  theme: string;
  toggleTheme: () => void;
  onThemeChange: (theme: Theme) => void;
  edit: (b: Book) => void;
  importFile: (file: File) => void;
}
export default function Library({
  books,
  open,
  create,
  createBible,
  settings,
  theme,
  toggleTheme,
  onThemeChange,
  edit,
  importFile,
}: Props) {
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const filtered = [...books]
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .filter((b) =>
      `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()),
    );
  return (
    <div className="library">
      <aside className="library-rail">
        <div className="brand">
          <BookOpen size={25} />
          <span>
            CodeBook<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="rail-caption">YOUR WRITING SPACE</div>
        <button className="rail-item selected">
          <BookOpen size={18} /> All projects <span>{books.length}</span>
        </button>
        <button className="rail-item" onClick={() => input.current?.click()}>
          <FolderOpen size={18} /> Open a project
        </button>
        <div className="rail-bottom">
          <div className="offline-card">
            <span className="status-dot" /> A little space to think.
            <p>
              Your words stay on your computer.
              <br />
              No account. No distractions.
            </p>
          </div>
          <button className="rail-item" onClick={settings}>
            <Settings2 size={17} /> Preferences
          </button>
          <div className="rail-version">
            CODEBOOK <span>0.2.7 · EARLY EDITION</span>
          </div>
        </div>
      </aside>
      <main className="library-main">
        <header className="library-top">
          <span>
            <span className="status-dot" />{" "}
            {desktop ? "LOCAL WORKSPACE" : "BROWSER PREVIEW"}
          </span>
          <div className="library-top-actions">
            <ThemeToggle theme={theme} toggle={toggleTheme} />
            <ThemePicker theme={theme} onChange={onThemeChange} />
            <button className="subtle" onClick={() => input.current?.click()}>
              <FolderOpen size={16} /> Import project
            </button>
          </div>
        </header>
        <div className="library-heading">
          <div>
            <div className="eyebrow">BOOKS, SYSTEM BIBLES, AND BIG IDEAS</div>
            <h1>
              Your bookshelf<span>.</span>
            </h1>
            <p>
              A home for your chapters, systems, and everything they become.
            </p>
          </div>
          <div className="library-create-actions">
            {createBible && (
              <button className="secondary" onClick={createBible}>
                <Layers size={17} /> New system bible
              </button>
            )}
            <button className="primary" onClick={create}>
              <Plus size={18} /> New book
            </button>
          </div>
        </div>
        <div className="shelf-toolbar">
          <div>
            <span className="shelf-tab">
              All projects <b>{books.length}</b>
            </span>
            <span className="muted">Made by you. Kept with you.</span>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Find a book"
              placeholder="Find a book or system bible…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>⌕</kbd>
          </label>
        </div>
        <div className="books-grid">
          {filtered.map((b, i) => (
            <article className="book-card" key={b.id}>
              <button
                className="book-cover"
                style={
                  { "--cover": b.color || "#314d43" } as React.CSSProperties
                }
                onClick={() => open(b)}
                aria-label={`Open ${b.title}`}
              >
                <div className="cover-top">
                  <span className="project-kind">
                    {b.mode === "bible" ? "THE SYSTEM BIBLE" : "THE MANUSCRIPT"}
                  </span>
                  {b.mode === "bible" ? (
                    <Layers size={18} />
                  ) : (
                    <BookOpen size={18} />
                  )}
                </div>
                <h2>{b.title}</h2>
                <p>{b.subtitle || "A work in progress."}</p>
                <div className="cover-art" aria-hidden="true">
                  <div />
                  <div />
                  <div />
                  <span>{i % 2 === 0 ? "{ }" : "</>"}</span>
                </div>
                <div className="cover-bottom">
                  <span>{b.author || "YOUR NEXT GREAT IDEA"}</span>
                  <ArrowUpRight size={18} />
                </div>
                <div className="book-spine" />
              </button>
              <div className="book-card-title">
                <button onClick={() => open(b)}>{b.title}</button>
                <button
                  className="icon-button"
                  aria-label={`Settings for ${b.title}`}
                  onClick={() => edit(b)}
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
              <div className="book-card-meta">
                {chapters(b).length}{" "}
                {b.mode === "bible" ? "sections" : "chapters"} <span>·</span>{" "}
                {bookWords(b).toLocaleString()} words
              </div>
              <div className="book-card-updated">
                Edited{" "}
                {new Date(b.modified).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
                <span className="small-pill">
                  {b.mode === "bible"
                    ? `${chapters(b).filter((chapter) => chapter.progress === "complete").length} complete`
                    : chapters(b).every((c) => c.status === "Final")
                      ? "Complete"
                      : "In progress"}
                </span>
              </div>
            </article>
          ))}
          {!search && (
            <button className="new-book-card" onClick={create}>
              <span className="new-book-icon">
                <Plus size={25} />
              </span>
              <h3>A new beginning</h3>
              <p>Your next book or system bible starts here.</p>
              <span className="new-book-link">
                Create a book <ArrowRight size={15} />
              </span>
            </button>
          )}
          {search && !filtered.length && (
            <div className="empty-state">
              <Search />
              <h3>No projects found</h3>
              <p>Try another title or author.</p>
            </div>
          )}
        </div>
        <div className="library-note">
          <span className="note-icon">
            <Terminal size={22} />
          </span>
          <div>
            <h3>Give every idea room to grow.</h3>
            <p>
              Paste a formatted response, add a code example, or just start
              writing.
              <br />
              Build a book in chapters or a system bible with layers of systems
              and features.
            </p>
          </div>
          <Leaf size={37} strokeWidth={1} />
        </div>
        <footer className="library-footer">
          <span>
            <HardDrive size={14} />{" "}
            {desktop ? "Saved on this device" : "Preview uses browser storage"}
          </span>
          <span>Good ideas take time. Make yourself at home.</span>
        </footer>
      </main>
      <input
        hidden
        type="file"
        ref={input}
        accept=".codebook,.json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
