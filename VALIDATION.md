# CodeBook 0.2.8 validation

Validated on Windows with Node 24, Microsoft Edge, Rust 1.98.1, and the native Tauri/WebView2 runtime.

## Automated checks

| Check                                                                      | Result           |
| -------------------------------------------------------------------------- | ---------------- |
| TypeScript and production Vite build                                       | Pass             |
| Document, Markdown, clipboard, hierarchy, emoji, export, and storage tests | 170 passed       |
| Browser workflows in Microsoft Edge                                        | 37 passed        |
| Rust atomic replacement, path validation, recovery and preferences         | 9 passed         |
| Native application integration                                             | 28 checks passed |

The permanent clipboard test uses the specification's exact Hello World structure: H2, paragraph, C++ code, paragraph with inline code, H3, numbered list. It checks language, whitespace, and inline semantics, plus Markdown export/import round trips.

Browser workflows cover creating a book, renaming and editing chapters, drag reordering, part changes, metadata, autosave/reload, search, replace, tables, formatted paste, native clipboard priority and metadata, malicious HTML sanitization, embedded images, and actual downloaded exports. Browser export uses downloads; native export uses the OS save dialog.

System-bible workflows also exercise seven child levels below an overview, writing at each level, icons and independent progress states, collapsing branches, search revealing collapsed ancestors, moving complete branches, preventing parent-cycle choices, deleting a parent while preserving children, save/reload, and portable project export/import. An existing book is switched to System bible and back with its code retained. Project settings remain editable when a bible has no word goal.

Model and export unit tests include a 2,500-level hierarchy, cycle rejection, subtree moves and sibling reorder, parent deletion, legacy project compatibility, iterative Markdown/HTML export, and recovery data containing hierarchy and markers. This is a correctness stress check, not a benchmark of interactive performance for thousands of sections.

Emoji catalog checks cover all 3,773 bundled Unicode 15.1 choices: no duplicates, no rejected save values, inclusive skin tones, joined forms, and flags. Search tests cover the original 25 labels and order, status/domain aliases, case and accent normalization, prefixes, multiple words in any order, exact pasted emoji with presentation selectors, category filters, and unknown input. The source regeneration script verifies pinned Unicode and CLDR hashes and reproduces the bundled catalog; the app reads local data only.

Emoji browser workflows exercise search beyond the initial choices, result ranking, category filters, bounded paging, result counts, clear/reset controls, no-result feedback, all arrow keys, Home/End, Enter from search, Escape/focus return, custom validation, clearing, and joined skin-tone selection. Reload checks retain both the selected emoji and a nested section's writing, notes, tags, progress, icon, and parents. Popup bounds are measured at the app's 960 × 650 minimum window size. Closed pickers skip result searches and arrays; an opened picker initially renders 84 choices.

Google Docs regression fixtures reproduce its normal-weight outer `<b>` wrapper, per-run Arial 11pt styles, selectively bold runs, point-sized headings, paragraph alignment, indentation and spacing, nested bullet lists, underline, italic, and color. Browser checks measure computed styles immediately, after native-format clipboard copying, after reload, and in dark mode. List item and marker line heights match the source paragraph spacing. Highlight checks preserve dark text on explicit light backgrounds while transparent backgrounds allow dark-mode ink adaptation. Unit tests also check safe typography HTML round trips, relative-size handling, H6 headings, saved projects/recovery, and rejection of unsafe CSS and native style attributes. These are representative fixtures, not a manual test of the user's external Google document.

Markdown file tests cover `.md` and `.markdown`, first-H1 and filename titles, headings 1–6, Arial 11pt prose / 1.15 line spacing, 22pt and 16pt main headings, selective emphasis, nested lists, GFM tables and alignment, links, blockquotes, dividers, supported images, and fenced language/whitespace. Task states become readable checkbox markers without changing literal fenced code. Local image companions retain captions and paths as text references. HTML imports retain original supported typography; TXT stays literal; unsafe source markup is sanitized.

Browser import workflows select multiple files, measure their actual fonts, inspect saved documents, and compare them after reload. Files dropped into rows or before/root positions retain their batch order and become separate sections. Pointer drags exercise before/inside/after/root placement in both books and bibles to four child levels, move whole subtrees, preserve writing and metadata, and reject parent/descendant cycles. Windows sets frontend drag handling as required by the [Tauri configuration](https://v2.tauri.app/reference/config/#windowconfig), and the compiled-app workflow also tests pointer dragging and real local file drops.

## Native integration

Format Markdown checks reproduce rich-HTML paste that contains literal Markdown instead of semantic headings and emphasis. They cover Google-style font sizes, nested lists, GFM tables with and without outer pipes, reference links, hard breaks, paragraph-per-line code fences, exact code whitespace, and existing rich blocks and inline marks. Selection checks retain outside text and formatting, including partial paragraph boundaries. Conversion has its own Undo history step, separate from the earlier paste and later typing. Browser workflows compare saved JSON through Undo, Redo, and reload, check that a second conversion is a no-op, and exercise keyboard activation and the visible button at 960 × 650 with a wide outline. Whole-section conversion preserves existing rich containers; an inline selection within one can be formatted separately.

Sidebar workflows use real pointer drags to widen and narrow the left panel, confirm longer titles gain room, and compare saved chapter content and hierarchy before and after resizing and reload. Keyboard checks cover arrows, larger Shift steps, Home/End limits, and double-click reset. Escape, window blur, and unexpected pointer capture loss cancel an in-progress drag. A 960 × 650 window retains at least 360px for writing while accounting for the inspector; the original chosen width returns when more room is available. Books and system bibles share the preference, and Focus mode hides and restores the panel and divider. Preference tests cover serialized native writes, reset, valid ranges, corrupt data, storage failures, and preserving theme/layout/zoom.

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
16. Finds Complete through the offline **done** alias and checks the selected emoji in the actual saved project.
17. Opens the expanded catalog with bounded initial results, searches **DRAG**, selects Dragon, and confirms the emoji survives native restart.
18. Imports three real local Markdown files through the native file input; verifies editable Google-style Arial sizes, selective bold, tables, task states, and exact C++ source in the saved JSON.
19. Uses real pointer dragging to build a nested three-section branch and move it under another chapter, preserving every imported document.
20. Dispatches a file-path drag through the compiled WebView to read a real local Markdown file and add it below a subchapter; inspects its stored parent and text.
21. Terminates and reopens the app, then compares imported documents and their complete nested hierarchy with the saved files.
22. Uses actual pointer dragging and keyboard input to widen and narrow the outline, checks its width in the native preference file alongside theme/layout/zoom, and compares chapter writing and hierarchy.
23. Restarts the process to verify the chosen width, then enters and leaves Focus mode to check the panel and divider.
24. Double-clicks the divider to restore the responsive default and checks the persisted reset and other preferences.
25. Converts literal Markdown in HTML-pasted text into headings, emphasis, a list, a table, and fenced JavaScript; measures Google-style fonts and compares existing rich heading and C++ code data.
26. Uses one Undo and Redo, comparing the exact original and converted documents in the real saved chapter.
27. Restarts the process and verifies the converted document, code, font attributes, and Compact layout.
28. Checks for JavaScript runtime errors throughout the workflow.

The first native crash test exposed WebView2's delayed browser-storage persistence. The implementation was corrected to write an immediate, flushed, atomic recovery file through Rust. The repeated test passed with that change. Recovery cleanup compares revision timestamps so an older completed save cannot delete a newer pending edit.

The first 0.2.8 native run timed out waiting for the existing sidebar reset to persist, after its visual width had reset. A repeat of the complete workflow with the same executable passed all 28 checks. The initial failure did not capture enough evidence to establish a cause; the harness now saves a screenshot and diagnostic report on failure.

## Visual review

Dark mode was reviewed on the bookshelf, editor, code blocks, inspector, and export dialog. The appearance workflow checks switching from both main screens, preference synchronization, light/sepia fallback, and persistence across reloads. Native integration additionally confirms the dark preference survives process termination and restart. The desktop stores the appearance in a flushed `.preferences.json` file inside the library directory, independent of WebView2's deferred browser-storage writes.

Reviewed the actual native Compact/Midnight editor at 80% writing zoom, with the percentage visible in the footer. Imported typography remains readable, writing uses the available panel width, and the header, sidebar, toolbar, and footer keep their normal scale.

Reviewed the White writing palette and divider-spacing regression screenshots, plus the actual Windows editor in White at 80% zoom. The paper is pure white, controls use blue accents, panels stay neutral gray, and dividers no longer retain the oversized default margins.

Reviewed the expanded emoji picker in White at 960 × 650: search, category, count, scrollable grid, paging, custom input, and clear controls fit within the window. The browser screenshot uses the generic Learning C++ sample. Also reviewed the compiled Windows picker finding Dragon by prefix in White at 80% writing zoom; the native screenshot uses a generic example game document.

Inspected screenshots of the bookshelf and editor in Edge at 1440 × 1000, and the actual native WebView2 editor at the machine's display scaling. Confirmed the three-pane layout, editable code rendering, line numbers, inspector, and bookshelf were visible without overlapping controls. System-bible screenshots were reviewed in light and dark mode, including the nested outline, progress markers, full breadcrumb path, and section inspector. The actual native executable was also reviewed with a nested system bible.

Reviewed the Markdown import screenshot in White: regular Arial prose, bold/italic runs, lists, table, divider, syntax-highlighted C++ and link are readable with compact spacing. Also reviewed the native Windows file-drop result at 80% zoom, with its nested outline, full breadcrumb, editable parent choice and retained source font.

Reviewed the Windows White editor with the widened left panel: nested chapter titles use the additional room, the divider adds no blank strip, and the editor and inspector remain usable.

Reviewed the actual Windows Format Markdown result in White with Compact layout and 80% writing zoom. The labeled toolbar button is visible; converted headings, selective bold and italic, list, table, and highlighted JavaScript fit cleanly. The original rich heading and literal C++ example remain intact.

## Limits of these results

- A process-crash test is not a hardware power-loss test.
- The specification's 500,000-word and thousands-of-assets performance targets were not benchmarked.
- External clipboard applications were represented by regression fixtures; each named application was not manually tested.
- This release does not include the roadmap's PDF, EPUB, AI, cloud, collaboration, or advanced publishing features.
- Explorer-style file drops are exercised using WebView2’s drag protocol with real files, rather than manually automating a File Explorer gesture. Internal native chapter dragging uses pointer input.
- The native smoke test does not drive the Windows Save As dialog; it verifies native filesystem saving and recovery. Browser workflows verify generated/downloaded exports.

Reproduce using the commands in `README.md`. Native reports and screenshots are written to `test-results/native-<timestamp>/` and browser screenshots to `test-results/`.

## Package audit

The root, build, and release executable copies have matching SHA-256 hashes. The portable ZIP contains the current executable, quick-start guide, README, validation notes, licenses including the Unicode notice, checksum, and the twelve screenshots referenced by the README. Its embedded executable matches the tested native build; previous executables and user projects are excluded.
