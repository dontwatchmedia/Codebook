import { generateJSON, type JSONContent } from "@tiptap/core";
import { beforeEach, describe, expect, it } from "vitest";
import { sanitizeHTML } from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import {
  exportHTML,
  exportMarkdown,
  toHTML,
  toMarkdown,
} from "../../src/export";
import {
  makeBook,
  validateBook,
  validateDocument,
  type Chapter,
} from "../../src/model";
import { loadBooks, saveBook, stageBook } from "../../src/storage";

const parse = (html: string) => generateJSON(sanitizeHTML(html), extensions());
const googleDocsCopy = `
  <b id="docs-internal-guid-test" style="font-weight:normal">
    <h2 style="font-family:Arial;font-size:18pt;color:#243c34;line-height:1.2;margin-top:18pt;margin-bottom:6pt">Living City</h2>
    <p style="line-height:1.15;text-align:justify;margin-top:0pt;margin-bottom:8pt">
      <span style="font-family:Arial;font-size:11pt;color:#202124;font-weight:400">Normal text </span>
      <span style="font-family:Arial;font-size:11pt;color:#202124;font-weight:700">important words</span>
      <span style="font-family:Arial;font-size:11pt;color:#202124;font-weight:400"> and </span>
      <span style="font-family:Arial;font-size:11pt;color:#202124;font-style:italic;text-decoration:underline;background-color:#fff2cc">emphasized words.</span>
    </p>
    <ul style="margin-top:6pt;margin-bottom:12pt;padding-left:24pt;line-height:1.2">
      <li style="font-family:Calibri;font-size:12pt"><p>Housing systems</p></li>
    </ul>
  </b>`;

function textNodes(doc: JSONContent): JSONContent[] {
  return doc.type === "text" ? [doc] : (doc.content || []).flatMap(textNodes);
}

function formattedBook() {
  const book = makeBook("Formatting survives", "bible");
  (book.nodes[0] as Chapter).document = parse(googleDocsCopy);
  return book;
}

describe("Formatting stays part of portable document data", () => {
  it("keeps the copied font, size, color and spacing without turning normal Docs text bold", () => {
    const doc = parse(googleDocsCopy);
    expect(validateDocument(doc)).toBe(true);
    expect(doc.content?.[0]).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        fontFamily: "Arial",
        fontSize: "18pt",
        lineHeight: "1.2",
        marginTop: "18pt",
        marginBottom: "6pt",
      },
    });
    expect(doc.content?.[1]).toMatchObject({
      type: "paragraph",
      attrs: {
        fontFamily: "Arial",
        fontSize: "11pt",
        textAlign: "justify",
        lineHeight: "1.15",
        marginTop: "0pt",
        marginBottom: "8pt",
      },
    });
    const normal = textNodes(doc).find((node) =>
      node.text?.includes("Normal text"),
    )!;
    expect(normal.marks?.some((mark) => mark.type === "bold")).toBe(false);
    expect(normal.marks).toContainEqual(
      expect.objectContaining({
        type: "textStyle",
        attrs: expect.objectContaining({
          fontFamily: "Arial",
          fontSize: "11pt",
        }),
      }),
    );
    const bold = textNodes(doc).find(
      (node) => node.text === "important words",
    )!;
    expect(bold.marks?.some((mark) => mark.type === "bold")).toBe(true);
    const emphasis = textNodes(doc).find(
      (node) => node.text === "emphasized words.",
    )!;
    expect(emphasis.marks?.map((mark) => mark.type)).toEqual(
      expect.arrayContaining(["italic", "underline", "textStyle"]),
    );
    expect(doc.content?.[2]?.attrs).toMatchObject({
      marginTop: "6pt",
      marginBottom: "12pt",
      paddingLeft: "24pt",
    });
  });

  it("round trips supported visual attributes through sanitized HTML exports", () => {
    const doc = parse(googleDocsCopy);
    const html = toHTML(doc);
    expect(html).toContain("font-family: Arial");
    expect(html).toContain("font-size: 11pt");
    expect(html).toContain("margin-bottom: 8pt");
    expect(html).toContain("padding-left: 24pt");
    expect(parse(html)).toEqual(doc);
    const book = formattedBook();
    expect(exportHTML(book)).toContain("font-family: Arial");
    expect(validateBook(book)).toBe(true);
  });

  it("round trips paragraph side margins and first-line indentation", () => {
    const doc = parse(
      '<p style="font-family:Arial;font-size:11pt;margin-left:24pt;margin-right:12pt;text-indent:9pt">Inset overview writing.</p>',
    );
    expect(validateDocument(doc)).toBe(true);
    expect(doc.content?.[0]?.attrs).toMatchObject({
      marginLeft: "24pt",
      marginRight: "12pt",
      textIndent: "9pt",
    });
    const html = toHTML(doc);
    expect(html).toContain("margin-left: 24pt");
    expect(html).toContain("margin-right: 12pt");
    expect(html).toContain("text-indent: 9pt");
    expect(parse(html)).toEqual(doc);
    expect(toMarkdown(doc)).toBe("Inset overview writing.\n");
  });

  it("retains table cell, table header, callout and level-six heading formatting", () => {
    const doc = parse(
      `<h6 style="font-family:'Times New Roman';font-size:10pt;margin-top:6pt">Small heading</h6><table><tr><th style="text-align:center;background-color:#dddddd;padding-left:4pt"><p>Name</p></th><td style="font-family:Verdana;font-size:12px;line-height:1.5"><p>Housing</p></td></tr></table><aside data-callout="note" style="font-family:Arial;font-size:11pt;margin-top:8pt;margin-bottom:12pt"><p>Keep this note.</p></aside>`,
    );
    expect(validateDocument(doc)).toBe(true);
    expect(doc.content?.[0]?.attrs).toMatchObject({
      level: 6,
      fontFamily: '"Times New Roman"',
      fontSize: "10pt",
      marginTop: "6pt",
    });
    expect(doc.content?.[1]?.content?.[0]?.content?.[0]?.attrs).toMatchObject({
      textAlign: "center",
      paddingLeft: "4pt",
    });
    expect(doc.content?.[2]?.attrs).toMatchObject({
      fontFamily: "Arial",
      fontSize: "11pt",
      marginBottom: "12pt",
    });
    expect(parse(toHTML(doc))).toEqual(doc);
  });

  it("keeps Markdown semantic and leaves visual font and spacing attributes out", () => {
    const book = formattedBook();
    const markdown = exportMarkdown(book);
    expect(markdown).toContain("**important words**");
    expect(markdown).toContain("*emphasized words.*");
    expect(markdown).not.toMatch(
      /font-family|font-size|margin-bottom|background-color|<span/,
    );
    const callout = parse(
      '<aside data-callout="note" style="font-family:Arial;font-size:11pt"><p><span style="font-size:11pt">A styled note.</span></p></aside>',
    );
    expect(toMarkdown(callout)).toContain("A styled note.");
    expect(toMarkdown(callout)).not.toMatch(/font-family|font-size|<span/);
    const legacy: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Plain text" }] },
      ],
    };
    expect(validateDocument(legacy)).toBe(true);
    expect(toHTML(legacy)).toBe("<p>Plain text</p>\n");
    expect(toMarkdown(legacy)).toBe("Plain text\n");
  });
});

describe("Formatting validation and export reject unsafe native attributes", () => {
  it.each([
    ["fontFamily", "Arial; background-image:url(https://example.com)"],
    ["fontFamily", 'Arial\" onmouseover=\"bad()'],
    ["fontSize", "12px;position:fixed"],
    ["fontSize", 12],
    ["color", "url(javascript:bad())"],
    ["backgroundColor", "expression(bad())"],
    ["lineHeight", "calc(100vh)"],
    ["textAlign", "center;display:none"],
    ["marginBottom", "-999px"],
    ["marginLeft", "-2pt"],
    ["marginRight", "-4px"],
    ["textIndent", "-1em"],
    ["paddingLeft", { value: "12px" }],
  ])("rejects unsafe %s document data", (attribute, value) => {
    const doc: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { [attribute]: value },
          content: [{ type: "text", text: "Safe writing" }],
        },
      ],
    };
    expect(validateDocument(doc)).toBe(false);
    expect(toHTML(doc)).toBe("<p>Safe writing</p>\n");
  });

  it("rejects hostile textStyle marks and escapes valid quoted font families", () => {
    const hostile: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Safe writing",
              marks: [
                {
                  type: "textStyle",
                  attrs: {
                    color: "url(javascript:bad())",
                    fontFamily: "Arial;position:fixed",
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(validateDocument(hostile)).toBe(false);
    expect(toHTML(hostile)).toBe("<p>Safe writing</p>\n");
    const valid: JSONContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { fontFamily: '"Times New Roman", serif', fontSize: null },
          content: [{ type: "text", text: "<script>bad()</script>" }],
        },
      ],
    };
    expect(validateDocument(valid)).toBe(true);
    expect(toHTML(valid)).toContain(
      'style="font-family: &quot;Times New Roman&quot;, serif"',
    );
    expect(toHTML(valid)).not.toContain("<script>");
  });
});

describe("Styled writing survives saving and recovery", () => {
  beforeEach(() => localStorage.clear());

  it("reopens the exact visual document and recovers a newer styled draft", async () => {
    const book = formattedBook();
    book.modified = "2026-01-01T00:00:00.000Z";
    await saveBook(book);
    expect((await loadBooks()).books[0]).toEqual(book);
    const draft = {
      ...book,
      modified: "2026-01-02T00:00:00.000Z",
      nodes: book.nodes.map((node) =>
        node.type === "chapter"
          ? {
              ...node,
              document: parse(
                '<p style="font-family:Calibri;font-size:14pt;margin-bottom:10pt"><span style="font-family:Calibri;font-size:14pt">A newer styled draft.</span></p>',
              ),
            }
          : node,
      ),
    };
    stageBook(draft);
    expect((await loadBooks()).recovery[0]).toEqual(draft);
    await saveBook(draft);
    expect((await loadBooks()).books[0]).toEqual(draft);
    expect((await loadBooks()).recovery).toHaveLength(0);
  });
});
