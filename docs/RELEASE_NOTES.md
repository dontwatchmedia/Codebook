# CodeBook 0.2.0 — Nested system bibles and section progress

CodeBook now supports game design documents and system bibles alongside technical books. Keep an overview, systems, sub-systems, and features in a growing outline, with writing at every level and visible icons and progress states.

## Download

- **[CodeBook.exe](https://github.com/dontwatchmedia/Codebook/releases/latest/download/CodeBook.exe)** — the current portable Windows executable.
- **CodeBook-0.2.0-Windows.zip** — the same executable with a quick-start guide, README, validation notes, MIT license, and SHA-256 checksum, available in the **[latest release](https://github.com/dontwatchmedia/Codebook/releases/latest)**.
- **CodeBook.exe.sha256** — checksum for the executable.

Download the EXE directly, or extract the ZIP and double-click CodeBook.exe. No Node.js, Rust, login, or development server is needed to use it. Requires 64-bit Windows 10/11 and Microsoft Edge WebView2. The executable is unsigned.

## New in 0.2.0

- Create a **System bible**, or change an existing project's type in its settings. Existing books retain their content and organization.
- Add child sections below an overview, system, or feature, with further nesting as the design develops.
- Write in parent sections as well as their children, and collapse branches to keep the outline manageable.
- Move a whole branch through **Parent section**, and reorder siblings through drag-and-drop or move actions.
- Delete a parent while preserving its child sections and their writing one level higher.
- Choose ten section topic icons, including gamepad, globe, people, leaf, hammer, code, and document.
- Track each section as **Not started**, **In progress**, **Complete**, **Blocked**, or **On hold**. Each state is independent; parent progress is not automatically calculated from children.
- Export nested contents, icons, progress labels, and writing to Markdown or HTML. Numbered paths retain section identities beyond six heading levels.
- Save and transfer the complete hierarchy, metadata, and writing through portable `.codebook` projects.

The existing editor remains available: rich text, formatted paste, syntax-highlighted code, images, tables, dark mode, search, private notes, local autosave, recovery, and backup snapshots.

## Validation and scope

See **[VALIDATION.md](../VALIDATION.md)** for the checks performed on this build and their limits. Very large projects with thousands of sections have not been benchmarked. Progress tracking records your choices; it does not inspect a game's source or verify feature completion.

This package contains only the current executable and supporting documentation. Previous executable copies and user projects are excluded. PDF, EPUB, DOCX, cloud sync, AI, and collaboration are not included in this early release.
