# CodeBook — Technical Book Writing Software

**An offline book editor for people who write about code.**

CodeBook is a free, open-source **technical book writing app for Windows**. Organize chapters, write in a rich-text editor, paste formatted content from ChatGPT or the web, and edit code examples with syntax highlighting. Export your manuscript to Markdown or HTML when you are ready to share it.

Built for programming-book authors, technical writers, educators, developers, and tutorial creators. No account or internet connection is required for the core writing workflow.

**[Download CodeBook for Windows](https://github.com/dontwatchmedia/Codebook/releases/latest)** · **[Download the EXE](https://github.com/dontwatchmedia/Codebook/releases/latest/download/CodeBook.exe)** · **[Report a bug](https://github.com/dontwatchmedia/Codebook/issues)**

![CodeBook technical book editor in dark mode with a chapter outline, rich-text manuscript, C++ syntax highlighting, and chapter notes](docs/images/dark-editor.png)

## Why CodeBook?

Writing a programming book means moving between prose and code. CodeBook brings both into one writing space: a book outline on the left, your manuscript in the center, and chapter details on the right.

- **Write like an author.** Work with books, parts, and chapters through a familiar visual editor.
- **Treat code as content.** Give code blocks a language, filename, and optional line numbers.
- **Keep pasted structure.** Preserve headings, lists, links, tables, inline code, and fenced code blocks from supported rich text and Markdown.
- **Keep your work local.** Save structured project files on your computer, with autosave, recovery journals, and backup snapshots.
- **Take your manuscript with you.** Export readable HTML, portable Markdown, or a complete `.codebook` project.

## Download and start writing

1. Download **[CodeBook.exe](https://github.com/dontwatchmedia/Codebook/releases/latest/download/CodeBook.exe)** or the portable ZIP from the **[latest release](https://github.com/dontwatchmedia/Codebook/releases/latest)**.
2. If you downloaded the ZIP, extract it first.
3. Double-click **CodeBook.exe**.
4. Open the editable **Learning C++** sample, or choose **New book**.

The latest executable is also available directly in the [repository root](CodeBook.exe). If you downloaded the repository as a ZIP, extract the folder and open it there, or use **Open CodeBook.cmd**.

**Requirements:** 64-bit Windows 10 or Windows 11 with the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). The desktop download does not require Node.js, Rust, or a development server. The current executable is unsigned and may show a Windows security prompt. Windows is the tested platform; macOS and Linux packages are not provided.

## Features

### Book and chapter organization

- A bookshelf for creating, opening, renaming, and managing books.
- Parts, chapters, front matter, and back matter.
- Drag chapters to reorder them or move them between parts.
- Automatic chapter numbering and keyboard-accessible move actions.
- Book metadata, author name, subtitle, cover color, and word goals.

### Rich-text writing

- Headings, paragraphs, bold, italic, underline, strikethrough, links, and inline code.
- Bulleted and numbered lists, blockquotes, images, editable tables, and callouts.
- A formatting toolbar, slash insert menu, and command palette.
- Chapter status, tags, private notes, word counts, and estimated reading time.
- Book search, code and tag filters, and chapter find and replace.

### Code examples and formatted paste

- Syntax-highlighted code blocks with automatic language detection.
- 20 language choices, including C++, Python, JavaScript, TypeScript, Rust, Go, Java, C#, SQL, Bash, and PowerShell.
- Editable code filenames, optional line numbers, indentation, and a copy button.
- HTML, Markdown, plain-text, and native CodeBook clipboard support.
- Sanitization of imported HTML to remove scripts and unsafe markup.

### A comfortable writing environment

- **Dark mode:** use the moon/sun button at the top right of the bookshelf or editor. Your choice is remembered after restarting.
- Light and sepia themes are also available in **Preferences → Appearance**.
- Focus mode, reading preview, typewriter mode, and adjustable manuscript text size.
- No login, subscription, cloud account, or AI service is required.

### Autosave, recovery, and export

- Autosave after a short pause in typing.
- Atomic file replacement and a separate recovery journal.
- Up to 30 automatic backup snapshots per book, with a restore interface.
- Markdown export for portability and HTML export with highlighted code and a table of contents.
- Complete `.codebook` project export, including notes and code metadata.
- Import Markdown, HTML, and plain-text files as new chapters; import a `.codebook` file as an independent book.

![CodeBook bookshelf in dark mode showing a technical book and the New Book action](docs/images/dark-bookshelf.png)

## Your files stay on your computer

Books are stored in your Windows application-data directory. **Preferences** shows the exact location; the usual path is:

```text
%APPDATA%\com.codebook.desktop\books\
```

Each book uses structured JSON rather than an opaque manuscript format. The desktop app writes a recovery journal immediately and saves the main project after a 650 ms pause. It keeps up to 30 snapshots, captured at most once every five minutes while editing.

**Export → CodeBook project** creates a portable backup with your manuscript, embedded images, code metadata, and private notes. Markdown and HTML manuscript exports exclude private notes.

Locally inserted image files are embedded in the project. Images pasted as remote URLs still need their source to load; insert the image file for offline use. The browser development preview has a separate library in browser storage. Transfer books between it and the desktop app through `.codebook` export/import.

## Keyboard shortcuts

| Action                    | Shortcut                                 |
| ------------------------- | ---------------------------------------- |
| Bold / italic / underline | `Ctrl+B` / `Ctrl+I` / `Ctrl+U`           |
| Insert a link             | `Ctrl+K`                                 |
| Undo / redo               | `Ctrl+Z` / `Ctrl+Y`                      |
| Heading 1–3               | `Ctrl+Alt+1`–`3`                         |
| Find in chapter           | `Ctrl+F`                                 |
| Search book               | `Ctrl+Shift+F`                           |
| Command palette           | `Ctrl+Shift+P`                           |
| Save now                  | `Ctrl+S`                                 |
| Leave focus mode          | `Esc`                                    |
| Insert a block            | Type `/` at the beginning of a paragraph |

## Current release and roadmap

CodeBook **0.1.0** is an early desktop release focused on the complete writing workflow: create a book, organize chapters, paste technical content, edit code, save, reopen, and export.

**Available now:** rich-text editing, code highlighting, formatted paste, dark mode, local autosave and recovery, book organization, search, and Markdown/HTML export.

**Not included yet:** PDF, EPUB, DOCX, AI writing tools, cloud synchronization, collaboration, comments, equations, diagrams, cross-references, and advanced publishing layouts. These are possible future features, not current capabilities or promised release dates.

Markdown preserves supported manuscript blocks. Use `.codebook` for an exact project backup, including chapter organization and metadata. Very large manuscripts with hundreds of thousands of words or thousands of images have not been benchmarked.

## Build from source

CodeBook uses **Tauri 2, Rust, React, TypeScript, Tiptap/ProseMirror, and lowlight/highlight.js**.

For frontend development, install Node.js 22.12+ and npm. Node.js 24 was used for validation.

```powershell
git clone https://github.com/dontwatchmedia/Codebook.git
cd Codebook
npm.cmd ci
npm.cmd run dev
```

Open the local URL printed by Vite to use the browser preview.

For the native Windows app, install the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/), including Rust, the MSVC C++ build tools, and WebView2:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/desktop.ps1 dev
powershell -ExecutionPolicy Bypass -File scripts/desktop.ps1 build
powershell -ExecutionPolicy Bypass -File scripts/package.ps1
```

Packaging places the current **CodeBook.exe** in the project root and creates the portable ZIP in `release/`. It includes only the current executable, documentation, license, and checksum. Previous executable copies, development dependencies, local books, and test data are excluded.

## Tests

```powershell
npm.cmd run build
npm.cmd test
npm.cmd run test:e2e
powershell -ExecutionPolicy Bypass -File scripts/desktop.ps1 test
node scripts/native-smoke.mjs CodeBook.exe
```

Browser workflows use Microsoft Edge. The native smoke test uses an isolated project directory and checks filesystem saving, restart persistence, dark-mode persistence, and recovery after forced termination.

See **[VALIDATION.md](VALIDATION.md)** for tested behavior and the limits of those results. Clipboard regression tests include the technical-response acceptance fixture and representative browser/ChatGPT-style HTML; they do not imply manual testing of every external application.

## Contributing and feedback

Found a problem or have an idea? [Open an issue](https://github.com/dontwatchmedia/Codebook/issues). For bugs, include your Windows version, steps to reproduce, and whether the problem occurs in the desktop app or browser preview. Remove private manuscript content before attaching examples.

Pull requests are welcome. Keep changes focused on reliable writing, clear book organization, excellent clipboard handling, and portable content.

## License

CodeBook is available under the **[MIT License](LICENSE)**. Copyright © 2026 Don't Watch Media.
