# CodeBook 0.2.4 validation

Validated on Windows with Node 24, Microsoft Edge, Rust 1.98.1, and the native Tauri/WebView2 runtime.

## Automated checks

| Check                                                               | Result           |
| ------------------------------------------------------------------- | ---------------- |
| TypeScript and production Vite build                                | Pass             |
| Document, clipboard, hierarchy, export, ordering, and storage tests | 121 passed       |
| Browser workflows in Microsoft Edge                                 | 21 passed        |
| Rust atomic replacement, path validation, recovery and preferences  | 7 passed         |
| Native application integration                                      | 16 checks passed |

The permanent clipboard test uses the specification's exact Hello World structure: H2, paragraph, C++ code, paragraph with inline code, H3, numbered list. It checks language, whitespace, and inline semantics, plus Markdown export/import round trips.

Browser workflows cover creating a book, renaming and editing chapters, drag reordering, part changes, metadata, autosave/reload, search, replace, tables, formatted paste, native clipboard priority and metadata, malicious HTML sanitization, embedded images, and actual downloaded exports. Browser export uses downloads; native export uses the OS save dialog.

System-bible workflows also exercise seven child levels below an overview, writing at each level, icons and independent progress states, collapsing branches, search revealing collapsed ancestors, moving complete branches, preventing parent-cycle choices, deleting a parent while preserving children, save/reload, and portable project export/import. An existing book is switched to System bible and back with its code retained. Project settings remain editable when a bible has no word goal.

Model and export unit tests include a 2,500-level hierarchy, cycle rejection, subtree moves and sibling reorder, parent deletion, legacy project compatibility, iterative Markdown/HTML export, and recovery data containing hierarchy and markers. This is a correctness stress check, not a benchmark of interactive performance for thousands of sections.

Google Docs regression fixtures reproduce its normal-weight outer `<b>` wrapper, per-run Arial 11pt styles, selectively bold runs, point-sized headings, paragraph alignment, indentation and spacing, nested bullet lists, underline, italic, and color. Browser checks measure computed styles immediately, after native-format clipboard copying, after reload, and in dark mode. List item and marker line heights match the source paragraph spacing. Highlight checks preserve dark text on explicit light backgrounds while transparent backgrounds allow dark-mode ink adaptation. Unit tests also check safe typography HTML round trips, relative-size handling, H6 headings, saved projects/recovery, and rejection of unsafe CSS and native style attributes. These are representative fixtures, not a manual test of the user's external Google document.

## Native integration

The compact-layout browser workflow compares rendered editor width, vertical gaps, and the first content position with Original spacing. It verifies the capped display margins retain their original values in saved document data. A divider workflow reproduces the blank-paragraph/divider/blank-paragraph/heading structure, measures tight gaps at 80%, confirms original spacing and source fonts remain stored, and exercises mouse editing in both neighboring blank paragraphs. Outline workflows exercise title renaming with double-click, Enter, Escape, blur, empty rejection and F2, plus curated/custom emoji, clearing, persistence and nested section navigation. The eight-theme workflow checks palettes, color scheme, shelf/editor/preferences synchronization, code colors and reload. White checks cover pure white paper, neutral panels, blue controls/selection, notes, callouts, and preference persistence. Unit checks include single-emoji Unicode sequences, invalid input, project saves/recovery/backups and defensive exports; Rust checks cover preference merging and preserving corrupt preference files.

Writing-zoom workflows compare actual rendered text ranges at 100% and 80% for 11pt body text, 23pt main headings, and 17pt secondary headings. Font attributes and saved documents stay unchanged while glyph size and line height scale. Both 80% and 125% reflow inside the available writing pane without horizontal overflow, and the app controls retain their size. Mouse-position edits work in prose, table cells, and syntax-highlighted code at 80%; edits, code metadata, and zoom survive reload. Preference tests cover valid ranges, corrupt values, native read/write failures, ordered updates, and merging zoom with theme/layout without discarding other preferences.

`node scripts/native-smoke.mjs` exercises the compiled release executable with isolated project and WebView directories:

1. Launches the bundled app and its sample book, with no development server.
2. Writes a real structured `book.json` and a backup snapshot through Rust.
3. Terminates and reopens the native process, then checks the saved chapter.
4. Edits a chapter and force-terminates the process before debounced autosave; verifies the recovery prompt and restored text after restart.
5. Confirms dark mode survives a native restart.
6. Creates five nested system-bible sections, writes deep content, and checks the real project file for parent relationships, progress, and icon metadata.
7. Restarts and verifies deep section content, tree depth, progress, and icon controls.
8. Force-terminates after a deep section edit, restores its journal, and checks the recovered content and complete hierarchy in the native saved file.
9. Pastes a representative Google Docs HTML fragment into the native editor, checks actual computed font sizes/weights/spacing, and inspects font attributes in the real project file.
10. Restarts and confirms normal-weight body text, selective bold, and imported font/spacing data survive.
11. Uses Compact layout and Midnight theme, renames the project and chapter directly, selects an emoji, and inspects the actual saved project and merged preferences.
12. Changes Writing zoom to 80%, measures the rendered body text size, and confirms that native preferences store the numeric percentage alongside theme and layout.
13. Terminates and restarts the app, then verifies the 80% display scale, renamed titles, emoji, theme, layout, and retained original document font sizes.
14. Measures compact divider margins and the following heading gap while preserving neighboring blank paragraphs.
15. Switches to White, verifies pure white paper and neutral gray panels, then restarts and checks White, 80% zoom, tight divider spacing, and retained source formatting.
16. Checks for JavaScript runtime errors throughout the workflow.

The first native crash test exposed WebView2's delayed browser-storage persistence. The implementation was corrected to write an immediate, flushed, atomic recovery file through Rust. The repeated test passed with that change. Recovery cleanup compares revision timestamps so an older completed save cannot delete a newer pending edit.

## Visual review

Dark mode was reviewed on the bookshelf, editor, code blocks, inspector, and export dialog. The appearance workflow checks switching from both main screens, preference synchronization, light/sepia fallback, and persistence across reloads. Native integration additionally confirms the dark preference survives process termination and restart. The desktop stores the appearance in a flushed `.preferences.json` file inside the library directory, independent of WebView2's deferred browser-storage writes.

Reviewed the actual native Compact/Midnight editor at 80% writing zoom, with the percentage visible in the footer. Imported typography remains readable, writing uses the available panel width, and the header, sidebar, toolbar, and footer keep their normal scale.

Reviewed the White writing palette and divider-spacing regression screenshots, plus the actual Windows editor in White at 80% zoom. The paper is pure white, controls use blue accents, panels stay neutral gray, and dividers no longer retain the oversized default margins.

Inspected screenshots of the bookshelf and editor in Edge at 1440 × 1000, and the actual native WebView2 editor at the machine's display scaling. Confirmed the three-pane layout, editable code rendering, line numbers, inspector, and bookshelf were visible without overlapping controls. System-bible screenshots were reviewed in light and dark mode, including the nested outline, progress markers, full breadcrumb path, and section inspector. The actual native executable was also reviewed with a nested system bible.

## Limits of these results

- A process-crash test is not a hardware power-loss test.
- The specification's 500,000-word and thousands-of-assets performance targets were not benchmarked.
- External clipboard applications were represented by regression fixtures; each named application was not manually tested.
- This release does not include the roadmap's PDF, EPUB, AI, cloud, collaboration, or advanced publishing features.
- The native smoke test does not drive the Windows Save As dialog; it verifies native filesystem saving and recovery. Browser workflows verify generated/downloaded exports.

Reproduce using the commands in `README.md`. Native reports and screenshots are written to `test-results/native-<timestamp>/` and browser screenshots to `test-results/`.

## Package audit

The root, build, and release executable copies have matching SHA-256 hashes. The portable ZIP contains the current executable, quick-start guide, README, validation notes, license, checksum, and the eight screenshots referenced by the README. Its embedded executable matches the tested native build; previous executables and user projects are excluded.
