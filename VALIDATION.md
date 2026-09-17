# CodeBook MVP validation

Validated on Windows with Node 24, Microsoft Edge, Rust 1.98.1, and the native Tauri/WebView2 runtime.

## Automated checks

| Check | Result |
| --- | --- |
| TypeScript and production Vite build | Pass |
| Document, clipboard, export, ordering, and storage tests | 21 passed |
| Browser workflows in Microsoft Edge | 8 passed |
| Rust atomic replacement, path validation, and recovery revision checks | 3 passed |
| Native application integration | 6 checks passed |

The permanent clipboard test uses the specification's exact Hello World structure: H2, paragraph, C++ code, paragraph with inline code, H3, numbered list. It checks language, whitespace, and inline semantics, plus Markdown export/import round trips.

Browser workflows cover creating a book, renaming and editing chapters, drag reordering, part changes, metadata, autosave/reload, search, replace, tables, formatted paste, native clipboard priority and metadata, malicious HTML sanitization, embedded images, and actual downloaded exports. Browser export uses downloads; native export uses the OS save dialog.

## Native integration

`node scripts/native-smoke.mjs` exercises the compiled release executable with isolated project and WebView directories:

1. Launches the bundled app and its sample book, with no development server.
2. Writes a real structured `book.json` and a backup snapshot through Rust.
3. Terminates and reopens the native process, then checks the saved chapter.
4. Edits a chapter and force-terminates the process before debounced autosave; verifies the recovery prompt and restored text after restart.
5. Checks for JavaScript runtime errors throughout the workflow.

The first native crash test exposed WebView2's delayed browser-storage persistence. The implementation was corrected to write an immediate, flushed, atomic recovery file through Rust. The repeated test passed with that change. Recovery cleanup compares revision timestamps so an older completed save cannot delete a newer pending edit.

## Visual review

Dark mode was reviewed on the bookshelf, editor, code blocks, inspector, and export dialog. The appearance workflow checks switching from both main screens, preference synchronization, light/sepia fallback, and persistence across reloads. Native integration additionally confirms the dark preference survives process termination and restart. The desktop stores the appearance in a flushed `.preferences.json` file inside the library directory, independent of WebView2's deferred browser-storage writes.

Inspected screenshots of the bookshelf and editor in Edge at 1440 × 1000, and the actual native WebView2 editor at the machine's display scaling. Confirmed the three-pane layout, editable code rendering, line numbers, inspector, and bookshelf were visible without overlapping controls.

## Limits of these results

- A process-crash test is not a hardware power-loss test.
- The specification's 500,000-word and thousands-of-assets performance targets were not benchmarked.
- External clipboard applications were represented by regression fixtures; each named application was not manually tested.
- This release does not include the roadmap's PDF, EPUB, AI, cloud, collaboration, or advanced publishing features.
- The native smoke test does not drive the Windows Save As dialog; it verifies native filesystem saving and recovery. Browser workflows verify generated/downloaded exports.

Reproduce using the commands in `README.md`. Native reports and screenshots are written to `test-results/native-<timestamp>/` and browser screenshots to `test-results/`.
