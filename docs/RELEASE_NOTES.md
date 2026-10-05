# CodeBook 0.2.9 — Smart Find and remembered reading positions

Find writing across deeply nested chapters and sections, then return to each section where you left off.

## Download

- **[CodeBook.exe](https://github.com/dontwatchmedia/Codebook/releases/latest/download/CodeBook.exe)** — the current portable Windows executable.
- **CodeBook-0.2.9-Windows.zip** — the same executable with a quick-start guide, README, validation notes, licenses, and SHA-256 checksum, available in the **[latest release](https://github.com/dontwatchmedia/Codebook/releases/latest)**.
- **CodeBook.exe.sha256** — checksum for the executable.

Download the EXE directly, or extract the ZIP and double-click CodeBook.exe. No Node.js, Rust, login, or development server is needed to use it. Requires 64-bit Windows 10/11 and Microsoft Edge WebView2. The executable is unsigned.

## New in 0.2.9

- **Ctrl+F** or **Search** opens Smart Find. It starts in the current chapter or section, continues through the project, and wraps around. Grouped results include full ancestor paths, match counts, and snippets.
- The open document highlights all matches and distinguishes the current match. Use **Enter** / **Shift+Enter** for next / previous, or choose a result to jump directly to its text.
- Find keeps the query and each section's current match when you switch sections manually. **Replace** and **Replace all** affect only the **current chapter or section** and support Undo.
- Each section remembers its scroll position and caret or selection. Reopening a project resumes its last visited section. These local reading preferences are separate from project exports; a forced shutdown can lose the latest position.
- **Ctrl+Shift+F** retains advanced project search with text, code, and tag filters. Compact spacing, writing zoom, color themes, and the resizable outline remain available.

## Included from 0.2.8

- Click **Format Markdown** to convert Markdown already pasted into the editor. Select a passage to convert that text, or leave nothing selected to process the current chapter or section.
- Converted writing uses the established Google Docs-style Arial typography, compact paragraph spacing, and heading sizes. Markdown emphasis, lists, links, tables, dividers, and fenced code become editable content.
- The conversion is one undoable action. Existing headings, images, tables, and programming code are retained, and converted writing saves with the chapter as usual.

## Included from 0.2.7

- Drag the divider at the right edge of the left outline panel to make it wider or narrower in books and system bibles.
- The chosen width survives reopening projects and restarting the app. Smaller windows temporarily limit the width to leave room for writing; expanding the window restores the chosen size.
- Double-click the divider to restore the default responsive width. Use Left/Right arrows when the divider is focused, Shift for larger steps, or Home/End for the available limits.
- The divider follows all eight color themes and hides with the left panel in Focus mode.

## Included from 0.2.6

- Select multiple `.md` / `.markdown` files with **Import chapters** or **Import sections**, or drop them directly onto the outline. Each file becomes a separate editable chapter or section, titled from its first H1 or filename.
- Markdown prose uses **Arial 11pt**, 1.15 line spacing, and compact paragraph gaps. Headings use 22 / 16 / 14 / 12 / 11 / 11pt, with selective emphasis, nested lists, blockquotes, tables, links, dividers, and intact fenced-code language and whitespace.
- Task-list states remain **☑ / ☐** markers. Supported remote/embedded images remain images; local companion images retain captions and paths as text references.
- Drag a chapter or section onto another row's middle to nest it. Top/bottom edges insert before/after; **Move to top level** promotes a whole branch. The same drop positions work for incoming Markdown files.
- Child writing, fonts, code, emoji, progress, and hierarchy stay attached when a branch moves. Invalid parent/descendant drops are blocked; collapsed targets expand for a drop inside them.
- Parent choices in books now include chapters as well as parts. Windows uses the same frontend drag handler as the browser, enabling file drops and internal chapter dragging.

## Included from 0.2.5

- Choose from **3,773 emoji**, including flags, skin-tone variants, and joined forms. The original 25 progress and topic markers remain first.
- Search names, English keywords, partial words, aliases such as **done**, **wip**, and **farming**, or paste an emoji to find it directly. Search ignores capitalization and accents and matches all entered words.
- Filter by category, see result counts, reset an empty search, and browse **84 results at a time** in a scrollable grid.
- Search opens with keyboard focus. Down enters results; arrows, Home, and End navigate; Enter selects; Escape closes and returns focus to the section's emoji button.
- Custom single emoji, clearing, saving, recovery, and nested section metadata continue to work. All catalog choices pass the existing save validation.
- Unicode 15.1 emoji and CLDR 44 English labels are bundled in the app. Search works offline; the portable ZIP includes their copyright and license notice.

## Included from 0.2.4

- Choose **White** in Color theme or Preferences for pure white writing paper, neutral gray panels, dark text, and blue accents. Code, notes, selected sections, tables, dialogs, and controls follow the palette. Existing themes remain available.
- Compact layout now uses **8px** margins around dividers instead of the inherited **30px** margins. Existing pasted writing benefits immediately, with editable blank paragraphs, source fonts, and saved formatting retained. No re-paste is required.
- White, Compact layout, and Writing zoom are remembered after restarting.

## Included from 0.2.3

- Choose **Writing zoom** below the editor to scale all document text, including pasted headings, paragraphs, and lists, plus code, images, and tables. Choices range from **50%** to **200%**; **100%** resets the display scale.
- If the source browser or Google Docs uses **80%** zoom, choose **80%** in CodeBook to match its on-screen text size. Point sizes remain original in the saved document, native clipboard, and exports.
- Zoom is a workspace preference and survives native restart alongside the theme and layout.
- The misleading default-size footer has been replaced with the actual zoom percentage. Preferences now explain that **Default text size** only affects writing without its own explicit font size.

## Included from 0.2.2

- Compact writing is the default: wider use of the editor, smaller page padding, no duplicate display title, capped paragraph/heading gaps, and shorter blank lines. Existing writing benefits immediately; no re-paste is required to tighten its display.
- Choose **Original spacing** above the editor to view the document's stored margins and spacing. Both layouts retain the same text, fonts, sizes, emphasis, and export data.
- Choose **Light**, **Sepia**, **Dark**, **Midnight**, **Ocean**, **Rose**, or **Lavender** from Color theme or Preferences. Theme and layout choices survive native restart.
- Double-click a project title on the left or a chapter, section, or part title in the outline to rename it. F2 also works. Enter saves, Escape cancels, and clicking away saves a valid nonempty name.
- Choose an emoji beside a section number or icon. Quick choices include progress symbols and topic emoji; a custom single emoji and a clear option are available. Emoji survive saving, reopening, recovery, portable project copies, and text exports.
- Copied blank lines retain their source font instead of expanding to the editor's larger default font.
- Theme and layout preference writes merge under a lock so one choice cannot overwrite the other.

## Included from 0.2.1

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
