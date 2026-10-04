import { describe, expect, it } from "vitest";
import { generateJSON, type JSONContent } from "@tiptap/core";
import { sanitizeHTML } from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import {
  blockStyleCSS,
  normalizeFormattingValue,
  sanitizeInlineStyle,
  textStyleCSS,
} from "../../src/formatting";

// Google Docs puts regular content in a normal-weight <b>, with formatting
// spread across per-run spans instead of semantic strong/em elements.
const googleDocsHTML = `<b id="docs-internal-guid-abc" style="font-weight:normal;font-family:Arial">
<p style="line-height:1.38;text-align:center;margin-top:0pt;margin-bottom:0pt"><span style="font-family:Arial;font-size:9pt;font-weight:400;color:rgb(142,124,195)">☑ - In progress</span><span style="font-family:Arial;font-size:9pt;font-weight:400;color:rgb(106,168,79)"> ☑ - Done</span></p>
<h1 style="line-height:1.2;margin-top:24pt;margin-bottom:12pt"><span style="font-family:Arial;font-size:24pt;font-weight:700;color:#000000">Open Blue — Game Bible</span></h1>
<p style="line-height:1.38;margin-top:0pt;margin-bottom:12pt"><span style="font-family:Arial;font-size:11pt;font-weight:400;color:#000000">Open Blue is an open-ended voxel life simulator. </span><span style="font-family:Arial;font-size:11pt;font-weight:700;color:#000000">Farm, fish, hunt.</span></p>
<p style="line-height:1.38;margin-top:0pt;margin-bottom:12pt"><span style="font-family:Arial;font-size:11pt;font-weight:400;font-style:italic;text-decoration:underline;color:#000000;background-color:#fff2cc">Choose your own life.</span></p>
<ul><li><p style="line-height:1.38;margin-top:0pt;margin-bottom:0pt"><span style="font-family:Arial;font-size:11pt;font-weight:400">A farmer</span></p><ul><li><p><span style="font-family:Arial;font-size:11pt;font-weight:400;text-decoration:line-through">Old profession notes</span></p></li></ul></li></ul></b>`;
const parse = (html: string) => generateJSON(sanitizeHTML(html), extensions());
function findText(node: JSONContent, match: string): JSONContent | undefined {
  if (node.type === "text" && node.text?.includes(match)) return node;
  return node.content?.map((child) => findText(child, match)).find(Boolean);
}

describe("Google Docs rich clipboard regression", () => {
  it("does not turn the Google Docs normal-weight clipboard wrapper into bold prose", () => {
    const clean = sanitizeHTML(googleDocsHTML);
    expect(clean).not.toMatch(/<b[\s>]/);
    const doc = parse(googleDocsHTML);
    expect(
      Boolean(
        findText(doc, "Open Blue is an open-ended")?.marks?.some(
          (mark) => mark.type === "bold",
        ),
      ),
    ).toBe(false);
    expect(
      findText(doc, "Farm, fish, hunt.")?.marks?.some(
        (mark) => mark.type === "bold",
      ),
    ).toBe(true);
    expect(
      findText(doc, "Open Blue — Game Bible")?.marks?.some(
        (mark) => mark.type === "bold",
      ),
    ).toBe(true);
  });
  it("retains font, color, alignment, spacing, and semantic structure from Docs HTML", () => {
    const clean = sanitizeHTML(googleDocsHTML);
    const parsed = new DOMParser().parseFromString(clean, "text/html");
    const paragraphs = parsed.querySelectorAll("p");
    expect(paragraphs[0].style.textAlign).toBe("center");
    expect(paragraphs[0].style.fontFamily).toBe("Arial");
    expect(paragraphs[0].style.fontSize).toBe("9pt");
    expect(paragraphs[1].style.fontSize).toBe("11pt");
    expect(paragraphs[1].style.lineHeight).toBe("1.38");
    expect(paragraphs[1].style.marginBottom).toBe("12pt");
    expect(parsed.querySelector("h1")?.style.fontSize).toBe("24pt");
    const doc = parse(googleDocsHTML);
    expect(doc.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "heading",
      "paragraph",
      "paragraph",
      "bulletList",
    ]);
    const highlighted = findText(doc, "Choose your own life.");
    expect(highlighted?.marks?.map((mark) => mark.type)).toEqual(
      expect.arrayContaining(["italic", "underline"]),
    );
    expect(
      findText(doc, "Old profession notes")?.marks?.some(
        (mark) => mark.type === "strike",
      ),
    ).toBe(true);
    expect(doc.content?.[4].content?.[0].content?.[1].type).toBe("bulletList");
  });
  it("keeps explicit normal-weight text regular inside a genuinely bold run", () => {
    const doc = parse(
      '<p><strong>Bold <span style="font-weight:normal">regular</span> bold again</strong></p>',
    );
    expect(
      findText(doc, "Bold")?.marks?.some((mark) => mark.type === "bold"),
    ).toBe(true);
    expect(
      Boolean(
        findText(doc, "regular")?.marks?.some((mark) => mark.type === "bold"),
      ),
    ).toBe(false);
    expect(
      findText(doc, "bold again")?.marks?.some((mark) => mark.type === "bold"),
    ).toBe(true);
  });
  it("keeps text highlights separate from explicit block backgrounds", () => {
    const clean = sanitizeHTML(
      '<p><span style="background-color:#fff2cc">Highlighted text</span></p><h2><span style="background-color:#fff2cc">Highlighted heading</span></h2><p style="background-color:#d9ead3"><span style="background-color:#fff2cc">Explicit block background</span></p>',
    );
    const parsed = new DOMParser().parseFromString(clean, "text/html");
    expect(parsed.querySelectorAll("p")[0].style.backgroundColor).toBe("");
    expect(parsed.querySelector("h2")?.style.backgroundColor).toBe("");
    expect(parsed.querySelectorAll("p")[1].style.backgroundColor).toBe(
      "rgb(217, 234, 211)",
    );
    for (const span of parsed.querySelectorAll("span"))
      expect(span.style.backgroundColor).toBe("rgb(255, 242, 204)");
  });
  it("does not multiply relative font sizes by promoting them to ancestor blocks", () => {
    const clean = sanitizeHTML(
      '<p><span style="font-size:1.2em">Relative span</span></p><div style="font-size:120%"><p>Relative wrapper</p></div>',
    );
    const parsed = new DOMParser().parseFromString(clean, "text/html");
    expect(parsed.querySelector("span")?.style.fontSize).toBe("1.2em");
    expect(parsed.querySelector("div")?.style.fontSize).toBe("120%");
    for (const paragraph of parsed.querySelectorAll("p"))
      expect(paragraph.style.fontSize).toBe("");
  });
  it("matches list marker line spacing to uniform source paragraphs without changing plain lists", () => {
    const clean = sanitizeHTML(
      '<ul><li><p style="line-height:1.15">Farmer</p><ul><li><p style="line-height:1.15">Forester</p></li></ul></li></ul>',
    );
    const parsed = new DOMParser().parseFromString(clean, "text/html");
    for (const block of parsed.querySelectorAll<HTMLElement>("p, li, ul"))
      expect(block.style.lineHeight).toBe("1.15");
    const mixed = new DOMParser().parseFromString(
      sanitizeHTML(
        '<ul><li><p style="line-height:1.15">One</p></li><li><p style="line-height:1.5">Two</p></li></ul>',
      ),
      "text/html",
    );
    expect(mixed.querySelector("ul")?.style.lineHeight).toBe("");
    expect(mixed.querySelectorAll("li")[0].style.lineHeight).toBe("1.15");
    expect(mixed.querySelectorAll("li")[1].style.lineHeight).toBe("1.5");
    const plain = sanitizeHTML("<ul><li><p>Plain list item</p></li></ul>");
    expect(plain).toBe("<ul><li><p>Plain list item</p></li></ul>");
  });
  it("promotes uniform absolute fonts to list ancestors so markers match the text", () => {
    const clean = sanitizeHTML(
      '<ul><li><p><span style="font-family:Arial;font-size:11pt;color:#123456">A farmer</span></p><ul><li><p><span style="font-family:Arial;font-size:11pt;color:#123456">A forester</span></p></li></ul></li></ul>',
    );
    const parsed = new DOMParser().parseFromString(clean, "text/html");
    for (const block of parsed.querySelectorAll("p, li, ul")) {
      expect((block as HTMLElement).style.fontFamily).toBe("Arial");
      expect((block as HTMLElement).style.fontSize).toBe("11pt");
      expect((block as HTMLElement).style.color).toBe("rgb(18, 52, 86)");
    }
    const mixed = new DOMParser().parseFromString(
      sanitizeHTML(
        '<ol><li><p><span style="font-size:11pt">One</span></p></li><li><p><span style="font-size:14pt">Two</span></p></li></ol>',
      ),
      "text/html",
    );
    expect(mixed.querySelector("ol")?.style.fontSize).toBe("");
  });
  it("rejects dangerous CSS while retaining safe document formatting", () => {
    const html = sanitizeHTML(
      '<p onclick="bad()" style="font-family:Arial;font-size:11pt;color:#222;position:fixed;background-image:url(https://evil.test/a);behavior:url(evil.htc);width:99999px;line-height:999;text-align:center">Safe</p><span style="font-family:expression(alert(1));font-size:calc(1px + 5vw);color:var(--evil);background-color:url(javascript:evil());margin-top:-40pt">Unsafe styles</span>',
    );
    expect(html).toContain("font-family: Arial");
    expect(html).toContain("font-size: 11pt");
    expect(html).toContain("text-align: center");
    expect(html).not.toMatch(
      /onclick|position|background-image|url\(|expression|javascript|evil|calc\(|var\(|line-height|margin-top|width/i,
    );
    expect(sanitizeHTML('<p style="position:fixed">Text</p>')).toBe(
      "<p>Text</p>",
    );
  });
  it("applies the same formatting bounds to stored attributes and rendered HTML", () => {
    expect(normalizeFormattingValue("font-size", "11pt")).toBe("11pt");
    expect(normalizeFormattingValue("font-size", "9999px")).toBeNull();
    expect(
      normalizeFormattingValue("font-family", "Arial;position:fixed"),
    ).toBeNull();
    expect(
      sanitizeInlineStyle(
        "font-weight:normal;color:rgb(0, 0, 0);padding-left:36pt",
      ),
    ).toBe("font-weight: 400; color: rgb(0, 0, 0); padding-left: 36pt");
    expect(
      textStyleCSS({
        fontFamily: "Arial",
        fontSize: "11pt",
        color: "#000000",
        backgroundColor: "url(evil)",
      }),
    ).toBe("font-family: Arial; font-size: 11pt; color: #000000");
    expect(
      blockStyleCSS({
        fontSize: "11pt",
        textAlign: "center",
        lineHeight: "1.38",
        marginBottom: "12pt",
        paddingLeft: "calc(10px)",
      }),
    ).toBe(
      "font-size: 11pt; text-align: center; line-height: 1.38; margin-bottom: 12pt",
    );
  });
});
