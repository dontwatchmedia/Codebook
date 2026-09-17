# CodeBook — Product and Technical Design Document

## 1. Product Summary

**CodeBook** is a desktop-first book-writing application designed for technical authors who need the simplicity of a traditional writing application combined with first-class support for code.

The application should feel like a hybrid of:

* Scrivener
* Microsoft Word
* Typora
* Obsidian
* A lightweight IDE

The core goal is simple:

> Allow a user to write and organize a technical book without thinking about Markdown, HTML, Git repositories, static-site generators, or publishing pipelines.

A user should be able to copy formatted content from ChatGPT, a webpage, documentation, another document, or another CodeBook project and paste it into the editor while preserving meaningful structure such as:

* Headings
* Paragraphs
* Bold and italic formatting
* Lists
* Quotes
* Hyperlinks
* Tables
* Images
* Inline code
* Code blocks
* Programming-language metadata where available

The application organizes content naturally as:

```text
Book
├── Front Matter
├── Part I
│   ├── Chapter 1
│   ├── Chapter 2
│   └── Chapter 3
├── Part II
│   ├── Chapter 4
│   └── Chapter 5
└── Back Matter
```

The user should not need to understand how the content is stored internally.

---

# 2. Problem

Most existing tools fall into one of two categories.

### Traditional book-writing tools

Applications such as Scrivener, Atticus, and traditional word processors provide good chapter organization and prose editing, but technical content is often awkward.

Common weaknesses include:

* Poor code-block handling
* No syntax highlighting
* Code formatting destroyed during copy/paste
* No programming-language metadata
* Difficult Markdown interoperability
* Weak export of technical content

### Developer documentation tools

Platforms such as GitBook, Docusaurus, MkDocs, and mdBook handle code very well but are designed around documentation workflows.

They commonly introduce concepts such as:

* Repositories
* Markdown files
* Deployment
* Static-site generation
* Configuration files
* Git branches
* Documentation websites

These are unnecessary complications for someone who simply wants to write a book.

CodeBook fills the space between these two categories.

---

# 3. Product Principles

## 3.1 Writing First

The application should never feel like an IDE unless the user is actively editing code.

The default experience should feel like writing a book.

---

## 3.2 Structure Without Complexity

Book structure should be immediately understandable.

The user manages:

* Books
* Parts
* Chapters
* Sections

They should not need to manage individual Markdown files unless they intentionally enable an advanced mode.

---

## 3.3 Rich Text With Portable Data

The editor should behave like a rich-text editor.

The underlying content should remain portable and convertible into formats such as:

* Markdown
* HTML
* EPUB
* PDF
* DOCX

---

## 3.4 Code Is a First-Class Content Type

Code blocks are not simply paragraphs using a monospace font.

A code block should have structured metadata.

Example:

```text
Type: code_block
Language: cpp
Filename: hello.cpp
Line Numbers: false
Highlight Lines: 5-7
Content: ...
```

---

## 3.5 Copy/Paste Must Be Excellent

Clipboard handling should be one of the application's defining features.

A technical author should be able to copy an entire response containing:

* H1/H2/H3 headings
* Lists
* paragraphs
* code
* tables

and paste it directly into CodeBook without manually rebuilding the formatting.

---

# 4. Target User

Primary users include:

* Programming-book authors
* Technical writers
* Software developers
* Educators
* Tutorial writers
* Course creators
* Engineering authors
* Game-development authors
* Science and mathematics writers

Secondary users may include anyone writing documentation-heavy books.

---

# 5. Core User Experience

The main application uses a three-pane layout.

```text
┌─────────────────────────────────────────────────────────────────────┐
│ CodeBook                                         Search    Export   │
├──────────────────┬──────────────────────────────────────┬───────────┤
│ BOOK STRUCTURE   │ EDITOR                               │ INSPECTOR │
│                  │                                      │           │
│ Learning C++     │ Chapter 1                            │ Chapter   │
│                  │                                      │ Settings  │
│ Introduction     │ Hello, World!                        │           │
│                  │                                      │ Status    │
│ ▼ Part I         │ Your first program will be small.    │ Draft     │
│   1. Hello       │                                      │           │
│   2. Variables   │ ┌ C++ ────────────────────────────┐ │ Words     │
│   3. Decisions   │ │ #include <iostream>             │ │ 2,431     │
│                  │ │                                  │ │           │
│ ▼ Part II        │ │ int main()                       │ │ Tags      │
│   4. Functions   │ │ {                                │ │ beginner  │
│   5. Classes     │ │     std::cout << "Hello";        │ │ cpp       │
│                  │ │ }                                │ │           │
│                  │ └──────────────────────────────────┘ │ Notes     │
│ + Chapter        │                                      │           │
└──────────────────┴──────────────────────────────────────┴───────────┘
```

The inspector can be collapsed.

---

# 6. Book Library

On launch, users see their books.

Example:

```text
My Books

┌─────────────────────┐
│ Learning C++        │
│                     │
│ 12 Chapters         │
│ 31,482 words        │
│ Edited 8 min ago    │
└─────────────────────┘

┌─────────────────────┐
│ Godot From Scratch  │
│                     │
│ 7 Chapters          │
│ 18,210 words        │
└─────────────────────┘

+ New Book
```

Each book should support:

* Title
* Subtitle
* Author
* Description
* Cover
* Language
* Created date
* Modified date
* Version
* ISBN optional
* Publishing metadata

---

# 7. Book Structure

The navigation tree supports several node types.

## Part

A grouping of chapters.

Example:

```text
Part I — Fundamentals
```

---

## Chapter

Primary writing unit.

Example:

```text
Chapter 3 — Variables and Types
```

---

## Section

Optional organizational node within a chapter.

Example:

```text
3.1 Integers
3.2 Floating Point
3.3 Strings
```

Sections can be automatically generated from headings or explicitly represented in the outline.

---

## Front Matter

Special book sections such as:

* Title page
* Copyright
* Dedication
* Preface
* Foreword
* Introduction
* Table of contents

---

## Back Matter

Possible sections include:

* Appendix
* Glossary
* Index
* Bibliography
* About the Author

---

# 8. Drag-and-Drop Organization

Users should be able to reorganize their entire book by dragging nodes.

Example:

```text
Part I
    Chapter 1
    Chapter 2
    Chapter 3
```

Dragging Chapter 3 above Chapter 2 automatically updates chapter numbering.

A chapter may also be moved between parts.

---

# 9. Editor

The central component is a block-based rich-text editor.

Each document consists of structured blocks rather than one giant HTML string.

Supported block types should include:

* Paragraph
* Heading 1
* Heading 2
* Heading 3
* Heading 4
* Bulleted list
* Numbered list
* Task list
* Blockquote
* Code block
* Image
* Table
* Horizontal rule
* Callout
* Warning
* Note
* Tip
* Equation
* Diagram
* Page break

---

# 10. Editor Toolbar

Default toolbar:

```text
Undo Redo

H1 H2 H3

B I U S

Code
Code Block

• List
1. List

Quote
Callout

Link
Image
Table

────────

Insert
```

Formatting keyboard shortcuts should follow common standards.

Examples:

```text
Ctrl+B      Bold
Ctrl+I      Italic
Ctrl+K      Link
Ctrl+Z      Undo
Ctrl+Y      Redo

Ctrl+Alt+1  Heading 1
Ctrl+Alt+2  Heading 2
Ctrl+Alt+3  Heading 3
```

---

# 11. Code Blocks

Code blocks are one of the product's central features.

A code block may contain:

```cpp
#include <iostream>

int main()
{
    std::cout << "Hello, World!\n";
    return 0;
}
```

The block toolbar should expose:

```text
C++    Copy    Filename    Line Numbers    •••
```

Language selection includes common languages such as:

* C
* C++
* C#
* Java
* Kotlin
* Python
* JavaScript
* TypeScript
* Rust
* Go
* Swift
* HTML
* CSS
* SQL
* Bash
* PowerShell
* JSON
* YAML
* XML
* Markdown

An automatic language-detection option should also exist.

---

# 12. Code Block Properties

Each code block should support:

```typescript
interface CodeBlock {
    id: string;
    language?: string;
    filename?: string;
    content: string;
    showLineNumbers: boolean;
    startLine?: number;
    highlightedLines?: number[];
    caption?: string;
}
```

Possible rendering:

```text
hello.cpp
───────────────────────────────────────
1  #include <iostream>
2
3  int main()
4  {
5      std::cout << "Hello, World!";
6      return 0;
7  }
───────────────────────────────────────
```

---

# 13. Inline Code

Inline technical references should be supported independently from code blocks.

Example:

Use the `std::cout` object to write text to standard output.

The internal model should distinguish inline code from monospace styling.

---

# 14. Clipboard System

Clipboard handling is a major product requirement.

When the user pastes content, CodeBook should check clipboard formats in priority order.

Recommended order:

```text
1. CodeBook native clipboard format
2. text/html
3. text/markdown
4. text/plain
```

This allows the application to preserve the richest source possible.

---

# 15. HTML Paste Conversion

HTML clipboard content should be sanitized and converted into application blocks.

Examples:

```html
<h2>Variables</h2>
```

becomes:

```text
Heading 2
Variables
```

HTML:

```html
<pre><code class="language-cpp">
int x = 5;
</code></pre>
```

becomes:

```text
CodeBlock
language = cpp
content = "int x = 5;"
```

HTML:

```html
<strong>important</strong>
```

becomes bold text.

---

# 16. Markdown Paste Conversion

Markdown input should automatically recognize:

````markdown
# Heading

## Subheading

**Bold**

*Italic*

- List item
- List item

> Quote

```cpp
int value = 10;
````

````

and translate those elements into native editor blocks.

The user should not need to invoke a special import command.

---

# 17. Paste Preview

An optional advanced feature could show:

```text
Pasted Content Detected

✓ 3 headings
✓ 9 paragraphs
✓ 2 code blocks
✓ 1 table

Paste as:

● Formatted content
○ Plain text
○ Markdown source
````

This could appear only when the paste operation contains complex content.

---

# 18. ChatGPT-Friendly Pasting

Content copied from AI assistants should receive special attention.

A typical response may contain:

* Markdown-generated HTML
* syntax-highlighted code
* nested lists
* headings
* tables
* inline code

CodeBook should reconstruct those into native document blocks.

This should be included in automated clipboard tests.

---

# 19. Slash Commands

Typing `/` at the beginning of a paragraph opens an insert menu.

Example:

```text
/code
/image
/table
/quote
/callout
/h1
/h2
/pagebreak
/equation
```

This provides fast formatting without requiring the toolbar.

---

# 20. Command Palette

Advanced users should have access to:

```text
Ctrl+Shift+P
```

Commands might include:

* Add chapter
* Move chapter
* Insert code block
* Export EPUB
* Export PDF
* Change code language
* Toggle focus mode
* Open search

---

# 21. Writing Modes

## Normal

Full interface.

---

## Focus Mode

Hide everything except the editor.

```text
                     Chapter 3

                Variables and Types

        Variables allow a program to store...
```

---

## Typewriter Mode

Keeps the current paragraph vertically centered.

---

## Preview Mode

Shows the chapter as it will approximately appear in the finished book.

---

# 22. Search

Global search should support:

```text
Search Book
```

with filtering by:

* Chapter
* Heading
* Text
* Code
* Language
* Tags

Example:

```text
Search: std::vector

Chapter 6 — Containers
    ...a std::vector stores...

Chapter 9 — Memory
    ...when a std::vector grows...
```

---

# 23. Find in Chapter

Standard:

```text
Ctrl+F
```

Support:

* Find
* Replace
* Replace all
* Case-sensitive
* Regex in advanced mode

---

# 24. Chapter Inspector

Each chapter has metadata.

Example:

```text
Chapter

Title
Variables and Types

Status
Draft

Words
3,821

Characters
21,482

Reading Time
17 min

Tags
cpp
beginner
variables

Created
September 16, 2026

Modified
September 16, 2026
```

---

# 25. Writing Status

Possible chapter statuses:

```text
Idea
Outline
Draft
Revision
Editing
Final
```

Custom statuses should eventually be supported.

---

# 26. Notes

Every chapter should have a private notes field.

These notes are not included during export.

Examples:

```text
Add diagram here.

Explain stack vs heap later.

Need a better example for references.
```

---

# 27. Comments

Authors should be able to attach comments to selected content.

Example:

```text
[Explain why this is undefined behavior.]
```

Comments should remain outside exported manuscripts unless specifically requested.

---

# 28. Statistics

Book-level statistics include:

```text
Words
82,391

Characters
447,202

Chapters
22

Code Blocks
184

Images
72

Tables
19

Estimated Reading Time
6h 4m
```

---

# 29. Goals

Optional writing goals could include:

```text
Book Goal
100,000 words

Current
82,391

82%
```

Chapter-level targets should also be supported.

---

# 30. Export

Export is another major product feature.

Initial export targets:

* Markdown
* HTML
* PDF
* EPUB

Later:

* DOCX
* LaTeX

---

# 31. Export Profiles

Users can save export configurations.

Example:

```text
Profile:
Programming eBook

Format:
EPUB

Code Theme:
Light

Font:
Source Serif

Code Font:
JetBrains Mono

Chapter Numbers:
Enabled

Table of Contents:
Enabled

Syntax Highlighting:
Enabled
```

---

# 32. Markdown Export

Exported files could resemble:

```text
book/
    introduction.md

    part-01/
        01-hello-world.md
        02-variables.md
        03-control-flow.md

    part-02/
        04-functions.md
        05-classes.md
```

This gives technical users complete portability.

---

# 33. Single-File Markdown Export

Also provide:

```text
learning-cpp.md
```

containing the entire manuscript.

---

# 34. HTML Export

HTML should preserve:

* Heading hierarchy
* Semantic elements
* Code language
* Highlighting
* Tables
* Images
* Links
* Callouts

Code blocks should use:

```html
<pre>
    <code class="language-cpp">
    ...
    </code>
</pre>
```

---

# 35. EPUB Export

EPUB should automatically generate:

* Cover
* Metadata
* Navigation
* Table of contents
* Chapter boundaries
* Embedded images
* Styled code blocks

---

# 36. PDF Export

PDF export should support book-layout controls.

Example:

```text
Page Size
6 × 9 in

Margins
Inside: 0.85"
Outside: 0.65"
Top: 0.75"
Bottom: 0.75"

Body Font
Source Serif

Code Font
JetBrains Mono

Font Size
11 pt

Line Height
1.35
```

---

# 37. Themes

Editor themes:

* Light
* Dark
* Sepia

Export themes are independent.

Possible book themes:

* Technical
* Academic
* Minimal
* Programming
* Textbook

---

# 38. Project Storage

The safest project architecture is a structured directory.

Example:

```text
Learning C++/
│
├── book.json
├── chapters/
│   ├── chapter-001.json
│   ├── chapter-002.json
│   └── chapter-003.json
│
├── assets/
│   ├── images/
│   └── diagrams/
│
├── metadata/
│
└── backups/
```

The application could expose this as one apparent `.codebook` project.

---

# 39. Book Metadata

Example `book.json`:

```json
{
  "version": 1,
  "id": "b59d7c92",
  "title": "Learning C++",
  "subtitle": "Programming From First Principles",
  "author": "Joshua Parsons",
  "language": "en-US",
  "structure": [
    {
      "type": "part",
      "title": "Fundamentals",
      "children": [
        "chapter-001",
        "chapter-002"
      ]
    }
  ]
}
```

---

# 40. Chapter Storage

Do not store chapter content as arbitrary editor HTML.

Use a structured document model.

Example:

```json
{
  "id": "chapter-001",
  "title": "Hello, World!",
  "blocks": [
    {
      "type": "heading",
      "level": 1,
      "content": "Hello, World!"
    },
    {
      "type": "paragraph",
      "content": [
        {
          "text": "Every programmer eventually writes their first program."
        }
      ]
    },
    {
      "type": "code",
      "language": "cpp",
      "content": "#include <iostream>\n\nint main() {\n    std::cout << \"Hello\";\n}"
    }
  ]
}
```

This makes exporting substantially easier and safer.

---

# 41. Editor Technology

A block-oriented editor framework is recommended rather than building text editing from scratch.

Strong candidates include:

### ProseMirror

Provides a powerful structured document model.

Advantages:

* Mature
* Extremely customizable
* Excellent selection handling
* Excellent clipboard support
* Strong schema model

---

### Tiptap

A higher-level framework built on ProseMirror.

Advantages:

* Easier API
* Mature extension ecosystem
* Code blocks
* Tables
* Images
* Collaboration
* Custom node types

This is likely the strongest candidate.

---

### Lexical

Created by Meta.

Advantages:

* Fast
* Modern architecture
* Extensible

Also viable.

---

# 42. Recommended Application Stack

For a desktop-first application:

```text
Frontend
React
TypeScript

Desktop Runtime
Tauri

Editor
Tiptap / ProseMirror

Styling
Tailwind CSS or CSS modules

Database
SQLite

Project Format
JSON + assets

Syntax Highlighting
Shiki

Export
Pandoc where appropriate
Custom HTML/EPUB pipeline
Chromium print pipeline for PDF
```

---

# 43. Why Tauri

Tauri is preferable to Electron for this application because the editor itself does not require a giant bundled browser runtime.

Benefits include:

* Smaller executable
* Lower memory usage
* Native filesystem access
* Rust backend
* Windows/macOS/Linux support

The frontend can still be built using ordinary web technologies.

---

# 44. Database

SQLite should primarily store application-level information.

Example tables:

```sql
books
recent_projects
preferences
export_profiles
templates
```

The manuscript itself should preferably remain file-based so users retain ownership of their work.

---

# 45. Autosave

Autosave should be aggressive but safe.

Suggested behavior:

```text
Editor change
     ↓
500–1000 ms debounce
     ↓
Write chapter
     ↓
Atomic filesystem replace
```

Never write directly over the existing chapter file without an atomic replacement strategy.

---

# 46. Backup System

Automatic snapshots could occur:

```text
Every 5 minutes
Every application close
Before major import
Before migration
```

Retention:

```text
Hourly      24 hours
Daily       30 days
Weekly      12 weeks
```

This should be configurable.

---

# 47. Crash Recovery

On launch, detect whether the previous session terminated incorrectly.

If unsaved recovery data exists:

```text
CodeBook recovered changes from your previous session.

Chapter 4 — Functions
Modified 8:41 PM

[Restore] [Compare] [Discard]
```

---

# 48. Undo System

Undo should operate naturally within the active chapter.

Minimum expectation:

```text
Ctrl+Z
Ctrl+Y
```

Long-running undo history could optionally persist during the session.

---

# 49. Images

Images can be inserted using:

* Paste
* Drag and drop
* File picker

The application copies the image into the project's asset directory.

Example:

```text
assets/images/vector-memory-layout.png
```

Image properties include:

* Caption
* Alt text
* Alignment
* Width
* Figure number

---

# 50. Tables

Tables should support:

* Add/remove rows
* Add/remove columns
* Header rows
* Alignment
* Copy/paste from spreadsheets
* Markdown export

---

# 51. Callouts

Technical books commonly need informational boxes.

Types:

```text
Note
Tip
Warning
Important
Example
Exercise
```

Example:

```text
┌────────────────────────────────────────┐
│ ⚠ Warning                              │
│                                        │
│ Accessing memory after it has been     │
│ freed results in undefined behavior.   │
└────────────────────────────────────────┘
```

---

# 52. Exercises

A dedicated exercise block could eventually be added.

Example:

```text
Exercise 3.4

Write a program that asks the user for two integers and prints their sum.
```

Metadata:

```text
difficulty
solution
chapter
exercise_number
```

Solutions could optionally appear at the back of the book.

---

# 53. Cross References

Allow references such as:

```text
See Chapter 8.

See Figure 4.2.

See Example 7.1.
```

Internally these should refer to stable IDs rather than literal chapter numbers.

This allows numbering to change automatically when chapters are reordered.

---

# 54. Automatic Numbering

Optional automatic numbering for:

* Parts
* Chapters
* Sections
* Figures
* Tables
* Listings
* Exercises

Example:

```text
Chapter 4

4.1 Functions
4.2 Arguments
4.3 Return Values
```

---

# 55. Table of Contents

Generated automatically from book structure.

Optionally include:

```text
Parts
Chapters
H1
H2
H3
```

---

# 56. Templates

Users can create books from templates.

Initial templates:

### Technical Book

Includes:

```text
Preface

Part I

Chapter 1

Appendix

Glossary
```

### Programming Tutorial

Adds:

* Example callouts
* Exercise blocks
* Code-friendly export style

### Blank Book

No predefined content.

---

# 57. Import

Initial import formats should include:

* Markdown
* HTML
* Plain text

Later:

* DOCX
* EPUB

---

# 58. Markdown Import

When importing a directory of Markdown files, CodeBook could infer chapters from filenames or top-level headings.

Example:

```text
01-introduction.md
02-variables.md
03-functions.md
```

becomes three chapters.

---

# 59. Revision History

Later versions could provide lightweight document versioning.

Example:

```text
Chapter 3 History

Today 8:41 PM
Today 7:12 PM
Yesterday
September 14
```

The user could compare revisions and restore them.

---

# 60. Comparison View

A future diff viewer could show:

```text
Previous                           Current

A vector contains objects.         A std::vector stores objects
                                   in contiguous memory.
```

This would be particularly valuable for technical editing.

---

# 61. AI Integration

AI features should remain optional rather than defining the product.

Possible capabilities:

* Rewrite paragraph
* Explain selected code
* Generate examples
* Find inconsistencies
* Check terminology
* Summarize chapter
* Suggest headings
* Identify undefined terms
* Generate exercises

The editor must remain fully functional without AI.

---

# 62. AI Context

If AI is eventually added, it should understand book structure.

Possible context hierarchy:

```text
Current selection
Current section
Current chapter
Nearby chapters
Book glossary
Book terminology rules
```

Users should control what context is sent.

---

# 63. Spell Checking

Support:

* System dictionary
* Custom dictionary
* Ignore word
* Technical dictionary

Code blocks should not be spell checked.

Inline code should generally be excluded as well.

---

# 64. Technical Dictionary

Programming authors frequently use words that ordinary spell checkers flag.

Examples:

```text
constexpr
namespace
std
nullptr
runtime
filesystem
deserialization
```

Users should be able to add project-specific terms.

---

# 65. Writing Style Rules

Future functionality could flag:

* Repeated wording
* Very long sentences
* Passive voice
* Undefined acronym
* Inconsistent capitalization
* Terminology inconsistencies

Example:

```text
"filesystem" appears 17 times.
"file system" appears 31 times.

Choose preferred terminology.
```

---

# 66. Accessibility

The editor should support:

* Keyboard navigation
* Screen readers
* Scalable UI
* High contrast
* Reduced animation
* Configurable editor font size

---

# 67. Offline First

Core writing functionality must never require an internet connection.

The user should always be able to:

* Open books
* Edit chapters
* Save
* Search
* Export

without logging into an account.

---

# 68. Accounts

For the initial version:

**Do not require accounts.**

Projects live on the user's computer.

Cloud synchronization could be added later.

---

# 69. Cloud Sync

Future synchronization could support:

* CodeBook Cloud
* Dropbox
* OneDrive
* Google Drive

This should be optional.

---

# 70. Collaboration

Real-time collaboration should not be part of the MVP.

Possible later functionality:

* Share manuscript
* Suggest edits
* Comments
* Change tracking

---

# 71. MVP

The first useful release should remain tightly scoped.

## MVP Features

### Library

* Create book
* Open book
* Delete book
* Rename book

### Structure

* Create chapter
* Rename chapter
* Delete chapter
* Drag chapters
* Create parts
* Move chapters between parts

### Editor

* Paragraphs
* H1/H2/H3
* Bold
* Italic
* Links
* Lists
* Quotes
* Inline code
* Code blocks
* Images
* Tables

### Code

* Syntax highlighting
* Language selection
* Copy button

### Clipboard

* HTML paste
* Markdown paste
* Plain text paste
* Code-block detection

### Saving

* Autosave
* Crash recovery
* Backups

### Export

* Markdown
* HTML

---

# 72. Version 1.0

Once the core editor is stable:

* PDF export
* EPUB export
* Table of contents
* Front/back matter
* Search
* Word counts
* Chapter statuses
* Inspector
* Export themes
* Callout blocks
* Automatic numbering
* Templates

---

# 73. Version 2.0

Possible future capabilities:

* DOCX
* Revision history
* Comments
* AI tools
* Collaboration
* Cloud sync
* Cross references
* Glossary tools
* Index generation
* Bibliographies
* Citation management
* Exercise/solution system
* Publishing integration

---

# 74. Recommended Development Order

The project should be built vertically rather than building every subsystem separately.

## Milestone 1 — Basic Editor

Build:

```text
Desktop window
Book
Chapter
Editor
Autosave
```

A user should already be able to write and reopen a book.

---

## Milestone 2 — Book Structure

Add:

```text
Parts
Chapter tree
Drag/drop
Rename
Delete
Automatic ordering
```

---

## Milestone 3 — Technical Editing

Add:

```text
Inline code
Code blocks
Syntax highlighting
Language selection
Tables
Callouts
```

---

## Milestone 4 — Clipboard

Spend substantial development time here.

Test paste operations from:

* ChatGPT
* Chrome
* Firefox
* Edge
* VS Code
* GitHub
* Stack Overflow
* Microsoft Word
* Google Docs
* Markdown editors

The clipboard system should be treated as a core feature, not a minor utility.

---

# 75. Clipboard Acceptance Test

Copy the following content from a browser:

````text
## Hello, World!

Our first program prints some text.

```cpp
#include <iostream>

int main()
{
    std::cout << "Hello, World!\n";
}
````

The `std::cout` object writes to standard output.

### What happened?

1. We included `<iostream>`.
2. We created `main()`.
3. We printed text.

````

Paste into CodeBook.

Expected result:

```text
Heading 2
Paragraph
C++ code block
Paragraph containing inline code
Heading 3
Numbered list
````

No manual correction should be necessary.

That test should become one of the project's permanent regression tests.

---

# 76. Milestone 5 — Export

Implement:

```text
Markdown
HTML
```

Validate round-trip portability.

A CodeBook project exported to Markdown and reimported should preserve essentially all supported document structure.

---

# 77. Milestone 6 — Publishing

Add:

```text
EPUB
PDF
Cover
Metadata
TOC
Page layout
Export profiles
```

---

# 78. Technical Architecture

Suggested high-level architecture:

```text
┌─────────────────────────────────────────┐
│ React UI                                │
│                                         │
│  Book Tree      Tiptap Editor           │
│  Inspector      Search                  │
└───────────────────┬─────────────────────┘
                    │
                Commands
                    │
┌───────────────────▼─────────────────────┐
│ Application Layer                       │
│                                         │
│ BookService                             │
│ ChapterService                          │
│ ClipboardService                        │
│ ExportService                           │
│ SearchService                           │
│ BackupService                           │
└───────────────────┬─────────────────────┘
                    │
┌───────────────────▼─────────────────────┐
│ Tauri / Rust Backend                    │
│                                         │
│ Filesystem                              │
│ SQLite                                  │
│ Export processes                        │
│ Native dialogs                          │
└─────────────────────────────────────────┘
```

---

# 79. Domain Model

Suggested structure:

```typescript
interface Book {
    id: string;
    title: string;
    subtitle?: string;
    author?: string;
    structure: BookNode[];
    settings: BookSettings;
}

type BookNode =
    | PartNode
    | ChapterNode;

interface PartNode {
    type: "part";
    id: string;
    title: string;
    children: ChapterNode[];
}

interface ChapterNode {
    type: "chapter";
    id: string;
    title: string;
    status: ChapterStatus;
}
```

---

# 80. Document Model

The document editor should use a strict schema.

Possible nodes:

```text
doc
paragraph
heading
text
bullet_list
ordered_list
list_item
blockquote
code_block
image
table
table_row
table_cell
callout
horizontal_rule
hard_break
page_break
```

Possible marks:

```text
bold
italic
underline
strike
link
inline_code
```

This schema becomes the application's canonical manuscript format.

---

# 81. Separation of Content and Presentation

The manuscript should never store formatting such as:

```text
font-size: 19px
color: #282828
margin-bottom: 17px
```

Instead it stores semantics:

```text
heading level 2
paragraph
code block
warning
```

Presentation belongs to themes.

This makes the same manuscript exportable to:

* PDF
* EPUB
* Website
* Markdown
* DOCX

without contaminating the content with layout information.

---

# 82. Performance Goals

The editor should comfortably support:

```text
100+ chapters
500,000+ words
Thousands of code blocks
Thousands of images
```

Only the current chapter needs to remain mounted in the editor.

This prevents enormous books from becoming one massive DOM document.

---

# 83. Security

Imported HTML must always be sanitized.

Never allow pasted content to execute:

```text
<script>
event handlers
iframes
embedded arbitrary HTML
```

The clipboard parser should translate recognized semantic content and discard unsafe elements.

---

# 84. File Integrity

Every chapter save should follow roughly:

```text
Serialize document
        ↓
Validate schema
        ↓
Write temporary file
        ↓
Flush
        ↓
Atomic rename
        ↓
Update backup
```

A crash halfway through a write should not destroy a chapter.

---

# 85. Project Philosophy

The user-facing mental model should remain:

```text
I am writing a book.
```

Never:

```text
I am maintaining a structured collection of Markdown documents being processed through a publishing system.
```

The technology should disappear behind the writing experience.

---

# 86. Core Differentiator

The strongest product message is:

> A book editor built for writing about code.

Or:

> Write technical books like books, not documentation repositories.

The critical combination is:

```text
Book organization
+
Rich-text editing
+
First-class code
+
Excellent copy/paste
+
Portable export
```

Individually, all of these features already exist.

The value comes from putting them together in one focused application.

---

# 87. Proposed MVP Screen

```text
┌──────────────────────────────────────────────────────────────────────┐
│ CodeBook     Learning C++                         Search     Export   │
├───────────────────┬──────────────────────────────────────────────────┤
│                   │                                                  │
│ LEARNING C++      │ Chapter 1                                        │
│                   │                                                  │
│ Preface           │ Hello, World!                                    │
│                   │                                                  │
│ ▼ FUNDAMENTALS    │ Programming begins with giving the computer      │
│                   │ instructions.                                    │
│   1 Hello World   │                                                  │
│   2 Variables     │ Your first C++ program will look like this:      │
│   3 Decisions     │                                                  │
│   4 Loops         │ ┌─ C++ ─────────────────────────────── Copy ─┐  │
│                   │ │ #include <iostream>                         │  │
│ ▼ PROGRAM DESIGN  │ │                                             │  │
│                   │ │ int main()                                  │  │
│   5 Functions     │ │ {                                           │  │
│   6 Classes       │ │     std::cout << "Hello, World!";           │  │
│                   │ │ }                                           │  │
│                   │ └─────────────────────────────────────────────┘  │
│                   │                                                  │
│ + Chapter         │ The program contains several important pieces.  │
│ + Part            │                                                  │
│                   │                                                  │
└───────────────────┴──────────────────────────────────────────────────┘
```

If this screen works extremely well, the product already has value.

Everything else can be layered on afterward.

---

# 88. Initial Success Criteria

The MVP is successful when a user can:

1. Create a book.
2. Create and rearrange chapters.
3. Write normally using rich formatting.
4. Paste a formatted technical response from ChatGPT.
5. Preserve its headings, lists, inline code, and code blocks.
6. Edit code with syntax highlighting.
7. Close the application.
8. Reopen it without losing anything.
9. Export the book to clean Markdown.
10. Export the book to readable HTML.

The application does not need EPUB, PDF, AI, collaboration, accounts, cloud synchronization, or publishing integrations to prove the concept.

The editor and clipboard experience are the product.

---

# 89. Recommended Starting Stack

For an initial implementation:

```text
Tauri 2
React
TypeScript
Tiptap
ProseMirror
Shiki
SQLite
Rust
```

Suggested repository structure:

```text
codebook/
│
├── src/
│   ├── components/
│   ├── editor/
│   ├── book/
│   ├── clipboard/
│   ├── export/
│   ├── stores/
│   └── types/
│
├── src-tauri/
│   ├── src/
│   └── capabilities/
│
├── tests/
│   ├── clipboard/
│   ├── editor/
│   └── export/
│
└── package.json
```

---

# 90. First Development Goal

Do not begin by implementing PDF export, publishing, AI, accounts, or collaboration.

Build this first:

```text
Book
    ↓
Chapter
    ↓
Tiptap editor
    ↓
Code block
    ↓
Paste formatted ChatGPT response
    ↓
Save
    ↓
Reload
```

Once that workflow is excellent, the application's hardest and most distinguishing technical requirement has already been proven.

Everything else builds around it.
