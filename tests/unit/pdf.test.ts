import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { PDFDocument } from "pdf-lib";
import { makeBook, makeChapter, type Chapter } from "../../src/model";
import {
  DEFAULT_PDF_OPTIONS,
  PDF_MARGIN_INCHES,
  estimatePDFPages,
  exportPDFHTML,
  generateBookPDF,
  normalizePDFOptions,
  pdfNodeHTML,
  readPDFOptions,
  saveBookPDF,
  savePDFOptions,
} from "../../src/pdf";
import { generateNativePDF, saveNativePDF } from "../../src/pdfNative";

vi.mock("../../src/pdfNative", () => ({
  generateNativePDF: vi.fn(),
  saveNativePDF: vi.fn(),
}));
const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (value: string): JSONContent => ({
  type: "paragraph",
  content: [text(value)],
});
const parsed = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
function fixture() {
  const book = makeBook("Open Blue design", "bible");
  const overview = book.nodes[0] as Chapter;
  overview.title = book.title;
  overview.document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: {
          level: 1,
          fontFamily: "Arial",
          fontSize: "22pt",
          marginTop: "0pt",
        },
        content: [text(book.title)],
      },
      {
        type: "paragraph",
        attrs: {
          fontFamily: "Arial",
          fontSize: "11pt",
          lineHeight: "1.15",
          marginBottom: "8pt",
        },
        content: [
          text("A normal sentence with "),
          { ...text("important words"), marks: [{ type: "bold" }] },
          text(" and "),
          {
            ...text("a source"),
            marks: [
              { type: "link", attrs: { href: "https://example.com/design" } },
              { type: "italic" },
            ],
          },
        ],
      },
    ],
  };
  const child = makeChapter("Living City", overview.id);
  child.document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, fontSize: "16pt", fontFamily: "Arial" },
        content: [text(child.title)],
      },
      paragraph("A separate subsystem."),
    ],
  };
  const nested = makeChapter("Residents", child.id);
  nested.document = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2, fontSize: "16pt", fontFamily: "Arial" },
        content: [text(nested.title)],
      },
      paragraph("A deeply nested subsystem."),
    ],
  };
  book.nodes.push(child, nested);
  return book;
}

describe("PDF layout preserves project formatting", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });
  it("prints flat outline order without shrinking nested headings or repeating source titles", () => {
    const book = fixture();
    const before = JSON.stringify(book);
    const doc = parsed(exportPDFHTML(book));
    expect(
      [...doc.querySelectorAll("section")].map((section) => section.id),
    ).toEqual(book.nodes.map((node) => node.id));
    expect(doc.querySelectorAll("section section")).toHaveLength(0);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    expect(
      [...doc.querySelectorAll("h2")].map((heading) => heading.textContent),
    ).toEqual(["Living City", "Residents"]);
    expect(doc.querySelectorAll("h2")[1].style.fontSize).toBe("16pt");
    expect(doc.querySelector(".pdf-breadcrumb")?.textContent).toBe(book.title);
    expect(doc.querySelectorAll(".pdf-breadcrumb")[1].textContent).toBe(
      `${book.title} / Living City`,
    );
    const p = doc.querySelector("section p")!;
    expect(p.style.fontFamily).toBe("Arial");
    expect(p.style.fontSize).toBe("11pt");
    expect(p.style.lineHeight).toBe("1.15");
    expect(p.style.marginBottom).toBe("10px");
    expect(p.querySelector("strong")?.textContent).toBe("important words");
    expect(p.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/design",
    );
    expect(p.querySelector("em")?.textContent).toBe("a source");
    expect(JSON.stringify(book)).toBe(before);
    expect(doc.body.textContent).not.toContain("MANUSCRIPT");
  });
  it("keeps author and subtitle after an opening source title without duplicating it", () => {
    const book = fixture();
    book.author = "The Open Blue Team";
    book.subtitle = "A living system bible";
    const doc = parsed(exportPDFHTML(book));
    expect(doc.querySelector(".pdf-project-title")).toBeNull();
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    const metadata = doc.querySelector(".pdf-project-metadata")!;
    expect(metadata.previousElementSibling?.textContent).toBe(book.title);
    expect(metadata.textContent).toContain(book.subtitle);
    expect(metadata.querySelector(".pdf-author")?.textContent).toBe(
      book.author,
    );
    expect(doc.querySelectorAll(".pdf-author")).toHaveLength(1);

    // An outline label that differs from the source title still appears,
    // after the title and project metadata rather than ahead of them.
    book.nodes[0].title = "Overview";
    const labeled = parsed(exportPDFHTML(book));
    expect(
      labeled.querySelector("section")?.firstElementChild?.textContent,
    ).toBe(book.title);
    expect(
      labeled.querySelector(".pdf-project-metadata")?.nextElementSibling
        ?.textContent,
    ).toBe("Overview");
  });
  it("keeps the front project title and later section labels when titles repeat", () => {
    const book = fixture();
    book.subtitle = "Project subtitle";
    book.author = "Project author";
    const first = book.nodes[0] as Chapter;
    first.title = "Introduction";
    first.document = { type: "doc", content: [paragraph("Start here.")] };
    const later = book.nodes[1] as Chapter;
    later.title = book.title;
    later.document = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [text(book.title)] },
      ],
    };
    const doc = parsed(exportPDFHTML(book));
    expect(doc.body.firstElementChild?.className).toBe("pdf-project-title");
    expect(doc.querySelector(".pdf-project-title h1")?.textContent).toBe(
      book.title,
    );
    expect(doc.querySelector(".pdf-author")?.textContent).toBe(book.author);
    expect(doc.querySelector(".pdf-project-title")?.textContent).toContain(
      book.subtitle,
    );
    expect(
      doc.querySelectorAll("section")[1].querySelectorAll("h1"),
    ).toHaveLength(1);

    later.document = { type: "doc", content: [paragraph("A later section.")] };
    const withoutSourceTitle = parsed(exportPDFHTML(book));
    expect(
      withoutSourceTitle.querySelectorAll("section")[1].querySelector("h1")
        ?.textContent,
    ).toBe(book.title);
  });
  it("keeps flow arrow columns narrow alongside automatic content columns", () => {
    const flow = (width: number): JSONContent => ({
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [paragraph("Draft")] },
            {
              type: "tableCell",
              attrs: { colwidth: [width] },
              content: [paragraph("→")],
            },
            { type: "tableCell", content: [paragraph("Published")] },
          ],
        },
      ],
    });
    const columns = parsed(pdfNodeHTML(flow(32))).querySelectorAll("col");
    expect(columns).toHaveLength(3);
    expect(columns[0].style.width).toBe("");
    expect(parseFloat(columns[1].style.width)).toBeLessThan(5);
    expect(columns[2].style.width).toBe("");
    const oversized = parsed(pdfNodeHTML(flow(10000))).querySelectorAll("col");
    expect(oversized[1].style.width).toBe("50%");
  });
  it("preserves merged tables, column proportions, code metadata and optional line numbers", () => {
    const table: JSONContent = {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableHeader",
              attrs: { colspan: 2, colwidth: [100, 200] },
              content: [paragraph("Systems")],
            },
            {
              type: "tableHeader",
              attrs: { colwidth: [100] },
              content: [paragraph("Status")],
            },
          ],
        },
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { rowspan: 2 },
              content: [paragraph("Weather")],
            },
            { type: "tableCell", content: [paragraph("Seasons")] },
            { type: "tableCell", content: [paragraph("Ready")] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [paragraph("Snow")] },
            { type: "tableCell", content: [paragraph("Planned")] },
          ],
        },
      ],
    };
    const dom = parsed(pdfNodeHTML(table));
    expect(
      [...dom.querySelectorAll("col")].map((column) => column.style.width),
    ).toEqual(["25%", "50%", "25%"]);
    expect(dom.querySelector("th")?.getAttribute("colspan")).toBe("2");
    expect(dom.querySelector("td")?.getAttribute("rowspan")).toBe("2");
    expect(dom.querySelectorAll("thead tr")).toHaveLength(1);
    const code: JSONContent = {
      type: "codeBlock",
      attrs: {
        language: "javascript",
        filename: "world.ts",
        caption: "Season transitions",
        showLineNumbers: true,
      },
      content: [text('const season = "winter";\n  // Keep indentation\n')],
    };
    const rendered = parsed(pdfNodeHTML(code));
    expect(rendered.querySelector(".pdf-code-filename")?.textContent).toBe(
      "world.ts",
    );
    expect(rendered.querySelector(".pdf-code-caption")?.textContent).toBe(
      "Season transitions",
    );
    expect(
      [...rendered.querySelectorAll(".pdf-line-number")].map(
        (line) => line.textContent,
      ),
    ).toEqual(["1", "2", "3"]);
    expect(rendered.querySelectorAll(".pdf-line-source")[1].textContent).toBe(
      "  // Keep indentation",
    );
    expect(rendered.querySelector(".hljs-keyword")?.textContent).toBe("const");
    code.attrs!.showLineNumbers = false;
    expect(
      parsed(pdfNodeHTML(code)).querySelectorAll(".pdf-line-number"),
    ).toHaveLength(0);
  });
  it("retains multiline syntax highlighting and source text with line numbers", () => {
    const source =
      "/* Documentation\nconst fake = 7;\n*/\nconst message = `hello\nworld`;\n";
    const doc = parsed(
      pdfNodeHTML({
        type: "codeBlock",
        attrs: { language: "javascript", showLineNumbers: true },
        content: [text(source)],
      }),
    );
    const lines = [...doc.querySelectorAll(".pdf-line-source")];
    expect(
      lines
        .map((line) => line.textContent?.replaceAll("\u200b", ""))
        .join("\n"),
    ).toBe(source);
    expect(lines[1].querySelector(".hljs-comment")?.textContent).toBe(
      "const fake = 7;",
    );
    expect(lines[1].querySelector(".hljs-keyword")).toBeNull();
    expect(lines[4].querySelector(".hljs-string")?.textContent).toBe("world`");
    expect(doc.querySelectorAll(".pdf-code-line .pdf-code-line")).toHaveLength(
      0,
    );
    expect(doc.querySelectorAll(".pdf-line-number")).toHaveLength(6);
  });
  it("keeps images, dividers, nested lists and callouts with safe source attributes", () => {
    const doc = parsed(
      pdfNodeHTML({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              src: "data:image/png;base64,AAAA",
              alt: 'A "diagram"',
              width: 320,
              height: 180,
            },
          },
          { type: "horizontalRule" },
          {
            type: "orderedList",
            attrs: { start: 3 },
            content: [
              {
                type: "listItem",
                content: [
                  paragraph("First"),
                  {
                    type: "bulletList",
                    content: [
                      { type: "listItem", content: [paragraph("Nested")] },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "callout",
            attrs: { kind: "warning", color: "#243c34", fontFamily: "Arial" },
            content: [paragraph("Remember seasons")],
          },
          {
            type: "paragraph",
            attrs: {
              fontFamily: 'Arial; background:url("evil")',
              fontSize: "100pt; position:fixed",
            },
            content: [
              {
                ...text("Unsafe link"),
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      }),
    );
    expect(doc.querySelector("img")?.getAttribute("width")).toBe("320");
    expect(doc.querySelector("img")?.getAttribute("alt")).toBe('A "diagram"');
    expect(doc.querySelectorAll("hr")).toHaveLength(1);
    expect(doc.querySelector("ol")?.getAttribute("start")).toBe("3");
    expect(doc.querySelector("ol ul li")?.textContent).toBe("Nested");
    expect(doc.querySelector("aside")?.getAttribute("data-callout")).toBe(
      "warning",
    );
    expect(doc.querySelector("aside")?.style.fontFamily).toBe("Arial");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("");
    expect(doc.documentElement.innerHTML).not.toContain("position:fixed");
    expect(
      pdfNodeHTML({ type: "image", attrs: { src: "javascript:alert(1)" } }),
    ).toBe("");
  });
  it("compacts old imported margins around blank paragraphs and dividers without changing font styles", () => {
    const book = fixture();
    (book.nodes[0] as Chapter).document = {
      type: "doc",
      content: [
        {
          ...paragraph("A question?"),
          attrs: {
            marginTop: "48pt",
            marginBottom: "48pt",
            fontFamily: "Arial",
            fontSize: "11pt",
          },
        },
        {
          type: "paragraph",
          attrs: { fontSize: "11pt", marginTop: "60pt", marginBottom: "60pt" },
        },
        { type: "horizontalRule" },
        {
          type: "heading",
          attrs: {
            level: 2,
            fontSize: "16pt",
            marginTop: "72pt",
            marginBottom: "36pt",
          },
          content: [text("The Core Fantasy")],
        },
      ],
    };
    const compact = parsed(exportPDFHTML(book));
    const p = compact.querySelector("section p")!;
    expect(p.style.marginTop).toBe("16px");
    expect(p.style.marginBottom).toBe("10px");
    expect(p.style.fontSize).toBe("11pt");
    expect(
      compact.querySelector("section h2")?.getAttribute("style"),
    ).toContain("margin-top: 16px");
    expect(compact.querySelector(".pdf-empty-paragraph")).not.toBeNull();
    expect(compact.body.className).toBe("pdf-compact");
    const original = parsed(exportPDFHTML(book, { compactSpacing: false }));
    expect(original.querySelector("section p")?.style.marginTop).toBe("48pt");
    expect(original.querySelector("section h2")?.style.marginTop).toBe("72pt");
    expect(original.body.className).toBe("");
  });
  it("remembers validated paper settings and changes actual print page rules", () => {
    localStorage.setItem("codebook.pdfOptions", "broken json");
    expect(readPDFOptions()).toEqual(DEFAULT_PDF_OPTIONS);
    expect(
      normalizePDFOptions({
        paper: "bogus" as "a4",
        pageNumbers: "yes" as unknown as boolean,
      }),
    ).toEqual(DEFAULT_PDF_OPTIONS);
    const settings = {
      paper: "a4" as const,
      includeTitle: false,
      startChaptersOnNewPage: true,
      pageNumbers: false,
      compactSpacing: true,
    };
    savePDFOptions(settings);
    expect(readPDFOptions()).toEqual(settings);
    const dom = parsed(exportPDFHTML(fixture(), settings));
    expect(dom.querySelector("style")?.textContent).toContain(
      "size:A4;margin:0.55in",
    );
    expect(dom.querySelector("style")?.textContent).not.toContain(
      "counter(page)",
    );
    expect(dom.querySelectorAll(".pdf-new-page")).toHaveLength(2);
    expect(dom.querySelector(".pdf-project-title")).toBeNull();
  });
  it("estimates all chapters with font, code and image heights without claiming exact pagination", () => {
    const book = fixture();
    expect(estimatePDFPages(book)).toBe(1);
    const chapter = book.nodes[0] as Chapter;
    chapter.document = {
      type: "doc",
      content: Array.from({ length: 80 }, () => ({
        ...paragraph("A longer section of design text. ".repeat(10)),
        attrs: { fontSize: "11pt" },
      })),
    };
    const normal = estimatePDFPages(book);
    chapter.document.content!.forEach((node) => {
      node.attrs!.fontSize = "22pt";
    });
    expect(estimatePDFPages(book)).toBeGreaterThan(normal);
    expect(estimatePDFPages(book, { paper: "a4" })).toBeLessThanOrEqual(
      estimatePDFPages(book),
    );
    expect(estimatePDFPages(fixture(), { startChaptersOnNewPage: true })).toBe(
      3,
    );
  });
  it("counts generated PDF bytes, caches identical exports and propagates save cancellation", async () => {
    const book = fixture();
    const bytes = new Uint8Array([37, 80, 68, 70]);
    vi.mocked(generateNativePDF).mockResolvedValue(bytes);
    const parser = vi
      .spyOn(PDFDocument, "load")
      .mockResolvedValue({ getPageCount: () => 7 } as PDFDocument);
    const result = await generateBookPDF(book, { paper: "a4" });
    expect(result.pageCount).toBe(7);
    expect(result.bytes).toBe(bytes);
    expect(parser).toHaveBeenCalledWith(bytes);
    expect(generateNativePDF).toHaveBeenCalledWith(
      expect.stringContaining("size:A4"),
      "a4",
      PDF_MARGIN_INCHES,
    );
    expect(await generateBookPDF(book, { paper: "a4" })).toBe(result);
    expect(generateNativePDF).toHaveBeenCalledTimes(1);
    vi.mocked(saveNativePDF).mockResolvedValue(false);
    expect(await saveBookPDF(book, result)).toBe(false);
    expect(saveNativePDF).toHaveBeenCalledWith("Open Blue design.pdf", bytes);
    book.title = "Open:Blue/Design";
    vi.mocked(saveNativePDF).mockRejectedValue(new Error("Disk is full"));
    await expect(saveBookPDF(book, result)).rejects.toThrow("Disk is full");
    expect(saveNativePDF).toHaveBeenLastCalledWith(
      "Open-Blue-Design.pdf",
      bytes,
    );
    parser.mockRestore();
  });
  it("retries failed generation and queues changes rather than running two native printers", async () => {
    const book = fixture();
    vi.mocked(generateNativePDF).mockRejectedValueOnce(
      new Error("An image could not load"),
    );
    await expect(generateBookPDF(book)).rejects.toThrow(
      "An image could not load",
    );
    const parser = vi
      .spyOn(PDFDocument, "load")
      .mockResolvedValue({ getPageCount: () => 2 } as PDFDocument);
    let finish!: (bytes: Uint8Array) => void;
    vi.mocked(generateNativePDF)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(new Uint8Array([1]));
    const first = generateBookPDF(book);
    const second = generateBookPDF(book, { paper: "a4" });
    await vi.waitFor(() => expect(generateNativePDF).toHaveBeenCalledTimes(2));
    finish(new Uint8Array([1]));
    await expect(first).resolves.toMatchObject({ pageCount: 2 });
    await expect(second).resolves.toMatchObject({ pageCount: 2 });
    expect(generateNativePDF).toHaveBeenCalledTimes(3);
    parser.mockRestore();
  });
});
