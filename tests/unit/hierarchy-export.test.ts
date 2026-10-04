import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { exportHTML, exportMarkdown } from "../../src/export";
import { makeBook, makeChapter, type Book } from "../../src/model";

const content = (text: string): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
function bible(): Book {
  const book = makeBook("Open Blue");
  book.mode = "bible";
  const overview = makeChapter("Overview");
  overview.document = content("A world of connected systems.");
  overview.icon = "gamepad";
  overview.progress = "in-progress";
  const city = makeChapter("Living City", overview.id);
  city.icon = "users";
  city.progress = "complete";
  city.document = content("City system overview.");
  const housing = makeChapter("Housing", city.id);
  housing.icon = "hammer";
  housing.progress = "blocked";
  housing.notes = "Private implementation reminder";
  housing.tags = "private-planning-tag";
  housing.document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Ownership" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Homes have persistent owners." }],
      },
      {
        type: "codeBlock",
        attrs: { language: "javascript" },
        content: [{ type: "text", text: "const owner = 'player';" }],
      },
    ],
  };
  const events = makeChapter("Community Events", city.id);
  events.document = content("Seasonal gatherings.");
  const forestry = makeChapter("Forestry", overview.id);
  forestry.icon = "leaf";
  forestry.progress = "on-hold";
  forestry.document = content("Forest growth and logging.");
  book.nodes = [overview, city, housing, events, forestry];
  return book;
}

describe("System bible exports", () => {
  it("exports every layer in order with readable progress and icons", () => {
    const output = exportMarkdown(bible());
    expect(output).toContain("## 1 🎮 Overview");
    expect(output).toContain("### 1.1 👥 Living City");
    expect(output).toContain("#### 1.1.1 🔨 Housing");
    expect(output).toContain("##### Ownership");
    expect(output).toContain("**Status:** Blocked");
    expect(output).toContain("**Status:** Complete");
    expect(output).toContain("**Status:** On hold");
    expect(output).toContain("    - [1.1.1 🔨 Housing]");
    expect(output.indexOf("Homes have persistent owners.")).toBeLessThan(
      output.indexOf("Seasonal gatherings."),
    );
    expect(output.indexOf("Seasonal gatherings.")).toBeLessThan(
      output.indexOf("Forest growth and logging."),
    );
    expect(output).toContain("```javascript\nconst owner = 'player';\n```");
    expect(output).not.toContain("Private implementation reminder");
    expect(output).not.toContain("private-planning-tag");
  });

  it("retains document content on parent sections and creates nested linked contents", () => {
    const book = bible();
    const output = exportHTML(book);
    const page = new DOMParser().parseFromString(output, "text/html");
    const overview = page.getElementById(book.nodes[0].id)!;
    const city = page.getElementById(book.nodes[1].id)!;
    const housing = page.getElementById(book.nodes[2].id)!;
    expect(overview.parentElement?.tagName).toBe("BODY");
    expect(city.parentElement).toBe(overview);
    expect(housing.parentElement).toBe(city);
    expect(
      overview.querySelector(":scope > p:not(.section-progress)")?.textContent,
    ).toBe("A world of connected systems.");
    expect(
      city.querySelector(":scope > p:not(.section-progress)")?.textContent,
    ).toBe("City system overview.");
    expect(housing.querySelector("h4")?.textContent).toBe("1.1.1 🔨 Housing");
    expect(housing.querySelector("h5")?.textContent).toBe("Ownership");
    const link = page.querySelector(`nav a[href="#${book.nodes[2].id}"]`)!;
    expect(link.closest("ol")?.parentElement?.tagName).toBe("LI");
    expect(link.parentElement?.querySelector(".progress")?.textContent).toBe(
      "Blocked",
    );
    expect(output).toContain('class="language-javascript"');
    expect(output).not.toContain("Private implementation reminder");
  });

  it("preserves levels deeper than six without flattening their identities", () => {
    const book = makeBook("Deep bible");
    book.mode = "bible";
    let parentId: string | null = null;
    book.nodes = Array.from({ length: 9 }, (_, depth) => {
      const section = makeChapter(`Layer ${depth + 1}`, parentId);
      section.document = content(`Content at layer ${depth + 1}.`);
      parentId = section.id;
      return section;
    });
    const markdown = exportMarkdown(book);
    expect(markdown).toContain('role="heading" aria-level="10"');
    expect(markdown).toContain("1.1.1.1.1.1.1.1.1 📄 Layer 9");
    expect(markdown).toContain("Content at layer 9.");
    const page = new DOMParser().parseFromString(exportHTML(book), "text/html");
    const last = page.getElementById(book.nodes[8].id)!;
    expect(last.querySelector(":scope > h6")?.getAttribute("aria-level")).toBe(
      "10",
    );
    expect(last.getAttribute("data-outline-path")).toBe("1.1.1.1.1.1.1.1.1");
    expect(last.parentElement?.id).toBe(book.nodes[7].id);
    expect(page.querySelectorAll("nav a")).toHaveLength(9);
  });

  it("escapes hostile titles at every hierarchy depth", () => {
    const book = bible();
    book.nodes[2].title = '<img src=x onerror="bad()">';
    const output = exportHTML(book);
    expect(output).toContain("&lt;img");
    expect(
      new DOMParser().parseFromString(output, "text/html").querySelector("img"),
    ).toBeNull();
  });

  it("exports a valid 2,500-layer outline without overflowing the call stack", () => {
    const book = makeBook("Deep export", "bible");
    let parentId: string | null = null;
    book.nodes = Array.from({ length: 2500 }, (_, index) => {
      const section = makeChapter(`Layer ${index + 1}`, parentId);
      section.document = content(`Content at layer ${index + 1}.`);
      parentId = section.id;
      return section;
    });
    const markdown = exportMarkdown(book);
    const html = exportHTML(book);
    expect(markdown).toContain('role="heading" aria-level="2501"');
    expect(markdown).toContain("Content at layer 2500.");
    expect(html).toContain('role="heading" aria-level="2501"');
    expect(html).toContain("Content at layer 2500.");
    expect(html.match(/<section /g)).toHaveLength(2500);
    expect(html.match(/<\/section>/g)).toHaveLength(2500);
    expect(html.match(/<ol>/g)).toHaveLength(2500);
    expect(html.match(/<\/ol>/g)).toHaveLength(2500);
  });

  it("retains nested section exports when switching a bible to book view", () => {
    const book = bible();
    book.mode = "book";
    expect(exportMarkdown(book)).toContain("#### 1.1.1 🔨 Housing");
    const page = new DOMParser().parseFromString(exportHTML(book), "text/html");
    expect(page.getElementById(book.nodes[2].id)?.parentElement?.id).toBe(
      book.nodes[1].id,
    );
  });

  it("leaves existing book exports in their established manuscript format", () => {
    const book = makeBook("Existing book", "technical");
    const markdown = exportMarkdown(book);
    expect(markdown).toContain("# Preface\n\n");
    expect(markdown).toContain("# Fundamentals\n\n");
    expect(markdown).not.toContain("Status:");
    expect(exportHTML(book)).toContain(`<h1>Fundamentals</h1>`);
  });
});
