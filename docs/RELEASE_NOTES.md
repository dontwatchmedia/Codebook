# CodeBook 0.2.1 — Google Docs formatting fix

CodeBook fixes Google Docs pastes that made normal paragraphs bold and replaced their source typography. Imported formatting now remains part of the saved document.

## Download

- **[CodeBook.exe](https://github.com/dontwatchmedia/Codebook/releases/latest/download/CodeBook.exe)** — the current portable Windows executable.
- **CodeBook-0.2.1-Windows.zip** — the same executable with a quick-start guide, README, validation notes, MIT license, and SHA-256 checksum, available in the **[latest release](https://github.com/dontwatchmedia/Codebook/releases/latest)**.
- **CodeBook.exe.sha256** — checksum for the executable.

Download the EXE directly, or extract the ZIP and double-click CodeBook.exe. No Node.js, Rust, login, or development server is needed to use it. Requires 64-bit Windows 10/11 and Microsoft Edge WebView2. The executable is unsigned.

## Fixed in 0.2.1

- Normal-weight Google Docs wrappers no longer make the entire pasted document bold.
- Supported fonts, sizes, colors, highlights, alignment, paragraph indents, line spacing, paragraph spacing, and list typography remain editable and survive saving, reopening, and native clipboard copying.
- HTML and portable `.codebook` projects retain imported typography; Markdown keeps its semantic text formatting.
- Imported default dark ink adapts to dark-mode paper while its source color remains in project data and exports.
- Heading levels 1–6 are supported.
- Imported CSS is restricted to validated formatting values; arbitrary page layout, scripts, and external CSS resources are discarded.

After upgrading, re-copy and paste selections that were formatted incorrectly by an earlier version. Their discarded source formatting cannot be recovered automatically.

## Included from 0.2.0

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
