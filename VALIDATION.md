# CodeBook 0.2.0 validation

Validated on Windows with Node 24, Microsoft Edge, Rust 1.98.1, and the native Tauri/WebView2 runtime.

## Automated checks

| Check                                                                  | Result          |
| ---------------------------------------------------------------------- | --------------- |
| TypeScript and production Vite build                                   | Pass            |
| Document, clipboard, hierarchy, export, ordering, and storage tests    | 40 passed       |
| Browser workflows in Microsoft Edge                                    | 10 passed       |
| Rust atomic replacement, path validation, and recovery revision checks | 3 passed        |
| Native application integration                                         | 9 checks passed |

The permanent clipboard test uses the specification's exact Hello World structure: H2, paragraph, C++ code, paragraph with inline code, H3, numbered list. It checks language, whitespace, and inline semantics, plus Markdown export/import round trips.

Browser workflows cover creating a book, renaming and editing chapters, drag reordering, part changes, metadata, autosave/reload, search, replace, tables, formatted paste, native clipboard priority and metadata, malicious HTML sanitization, embedded images, and actual downloaded exports. Browser export uses downloads; native export uses the OS save dialog.

System-bible workflows also exercise seven child levels below an overview, writing at each level, icons and independent progress states, collapsing branches, search revealing collapsed ancestors, moving complete branches, preventing parent-cycle choices, deleting a parent while preserving children, save/reload, and portable project export/import. An existing book is switched to System bible and back with its code retained. Project settings remain editable when a bible has no word goal.

Model and export unit tests include a 2,500-level hierarchy, cycle rejection, subtree moves and sibling reorder, parent deletion, legacy project compatibility, iterative Markdown/HTML export, and recovery data containing hierarchy and markers. This is a correctness stress check, not a benchmark of interactive performance for thousands of sections.

## Native integration

`node scripts/native-smoke.mjs` exercises the compiled release executable with isolated project and WebView directories:

1. Launches the bundled app and its sample book, with no development server.
2. Writes a real structured `book.json` and a backup snapshot through Rust.
3. Terminates and reopens the native process, then checks the saved chapter.
4. Edits a chapter and force-terminates the process before debounced autosave; verifies the recovery prompt and restored text after restart.
5. Confirms dark mode survives a native restart.
6. Creates five nested system-bible sections, writes deep content, and checks the real project file for parent relationships, progress, and icon metadata.
7. Restarts and verifies deep section content, tree depth, progress, and icon controls.
8. Force-terminates after a deep section edit, restores its journal, and checks the recovered content and complete hierarchy in the native saved file.
9. Checks for JavaScript runtime errors throughout the workflow.

The first native crash test exposed WebView2's delayed browser-storage persistence. The implementation was corrected to write an immediate, flushed, atomic recovery file through Rust. The repeated test passed with that change. Recovery cleanup compares revision timestamps so an older completed save cannot delete a newer pending edit.

## Visual review

Dark mode was reviewed on the bookshelf, editor, code blocks, inspector, and export dialog. The appearance workflow checks switching from both main screens, preference synchronization, light/sepia fallback, and persistence across reloads. Native integration additionally confirms the dark preference survives process termination and restart. The desktop stores the appearance in a flushed `.preferences.json` file inside the library directory, independent of WebView2's deferred browser-storage writes.

Inspected screenshots of the bookshelf and editor in Edge at 1440 × 1000, and the actual native WebView2 editor at the machine's display scaling. Confirmed the three-pane layout, editable code rendering, line numbers, inspector, and bookshelf were visible without overlapping controls. System-bible screenshots were reviewed in light and dark mode, including the nested outline, progress markers, full breadcrumb path, and section inspector. The actual native executable was also reviewed with a nested system bible.

## Limits of these results

- A process-crash test is not a hardware power-loss test.
- The specification's 500,000-word and thousands-of-assets performance targets were not benchmarked.
- External clipboard applications were represented by regression fixtures; each named application was not manually tested.
- This release does not include the roadmap's PDF, EPUB, AI, cloud, collaboration, or advanced publishing features.
- The native smoke test does not drive the Windows Save As dialog; it verifies native filesystem saving and recovery. Browser workflows verify generated/downloaded exports.

Reproduce using the commands in `README.md`. Native reports and screenshots are written to `test-results/native-<timestamp>/` and browser screenshots to `test-results/`.

## Package audit

The root, build, and release executable copies have matching SHA-256 hashes. The portable ZIP contains the current executable, quick-start guide, README, validation notes, license, checksum, and the three screenshots referenced by the README. Its embedded executable matches the tested native build; previous executables and user projects are excluded.
