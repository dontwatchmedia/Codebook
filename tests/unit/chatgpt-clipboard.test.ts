import { describe, expect, it } from "vitest";
import { generateJSON, type JSONContent } from "@tiptap/core";
import fixture from "../fixtures/chatgpt-rich.html?raw";
import { clipboardHTML, sanitizeHTML } from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import { docText, validateDocument } from "../../src/model";
import { toHTML } from "../../src/export";
import { parseChapterFile } from "../../src/importChapter";

const paste = (content: string, mime = "text/html") =>
  clipboardHTML({ getData: (type) => (type === mime ? content : "") })!;
const parse = (html: string) => generateJSON(html, extensions());
function nodes(document: JSONContent, type: string): JSONContent[] {
  return [
    ...(document.type === type ? [document] : []),
    ...(document.content || []).flatMap((node) => nodes(node, type)),
  ];
}

describe("ChatGPT rich clipboard", () => {
  it("gives class-only prose Google-style typography while keeping selective emphasis", () => {
    const document = parse(paste(fixture));
    expect(validateDocument(document)).toBe(true);
    expect(document.content?.[0]).toMatchObject({
      type: "heading",
      attrs: {
        level: 2,
        fontFamily: "Arial",
        fontSize: "16pt",
        lineHeight: "1.15",
      },
    });
    expect(document.content?.[1]).toMatchObject({
      type: "paragraph",
      attrs: { fontFamily: "Arial", fontSize: "11pt", marginBottom: "8pt" },
    });
    const text = nodes(document, "text");
    expect(
      text
        .find((node) => node.text?.includes("Each stage"))
        ?.marks?.some((mark) => mark.type === "bold") || false,
    ).toBe(false);
    expect(
      text
        .find((node) => node.text === "selective emphasis")
        ?.marks?.some((mark) => mark.type === "bold"),
    ).toBe(true);
    expect(
      text
        .find((node) => node.text === "careful timing")
        ?.marks?.some((mark) => mark.type === "italic"),
    ).toBe(true);
    expect(
      text
        .find((node) => node.text === "simulation.ini")
        ?.marks?.some((mark) => mark.type === "code"),
    ).toBe(true);
  });

  it("keeps INI language and exact literal code without Copy/Edit controls or header text", () => {
    const document = parse(paste(fixture));
    const code = nodes(document, "codeBlock");
    expect(code).toHaveLength(1);
    expect(code[0].attrs?.language).toBe("ini");
    expect(code[0].content).toEqual([
      {
        type: "text",
        text: "[Simulation]\nEnabled=true\n  ; Keep indentation and **literal** syntax\nMaxSteps=12",
      },
    ]);
    expect(docText(document)).not.toMatch(
      /Copy code|Edit response|\bini\b(?=\s*\[Simulation\])/,
    );
    expect(nodes(document, "callout")).toHaveLength(0);
  });

  it("recovers the language from a code header when code has no language class", () => {
    const document = parse(
      paste(
        '<div class="markdown"><div class="rounded border"><div><span>INI</span><button>Copy code</button></div><pre><code>  key=value\n\nnext=2\n</code></pre></div></div>',
      ),
    );
    expect(nodes(document, "codeBlock")[0]).toMatchObject({
      attrs: { language: "ini" },
      content: [{ text: "  key=value\n\nnext=2\n" }],
    });
    expect(docText(document)).not.toContain("INI");
  });

  it("never mistakes response prose for the code language beside a Copy response button", () => {
    const document = parse(
      paste(
        '<div class="markdown"><p>Use <span>Go</span> today.</p><pre><code>unchanged code</code></pre><button>Copy response</button></div>',
      ),
    );
    expect(docText(document)).toContain("Use Go today.");
    expect(nodes(document, "codeBlock")[0].attrs?.language).toBeNull();
    const withHeader = parse(
      paste(
        '<div class="markdown"><p>Use <span>Go</span> today.</p><div><div><span>INI</span><button>Copy code</button></div><pre><code>key=value</code></pre></div><button>Copy response</button></div>',
      ),
    );
    expect(docText(withHeader)).toContain("Use Go today.");
    expect(nodes(withHeader, "codeBlock")[0].attrs?.language).toBe("ini");
    expect(docText(withHeader)).not.toContain("INI");
  });

  it("preserves editable card columns and textual lifecycle arrows in order", () => {
    const document = parse(paste(fixture));
    const tables = nodes(document, "table");
    expect(tables).toHaveLength(2);
    expect(tables[0].content?.[0].content).toHaveLength(2);
    expect(docText(tables[0].content![0].content![0])).toContain("Inputs");
    expect(docText(tables[0].content![0].content![1])).toContain("Outputs");
    expect(nodes(tables[0], "bulletList")[0].content).toHaveLength(2);
    expect(nodes(tables[0], "heading")[0].attrs).toMatchObject({
      level: 3,
      fontFamily: "Arial",
      fontSize: "14pt",
    });
    expect(
      tables[1].content?.[0].content?.map((cell) => docText(cell)),
    ).toEqual([
      "Draft\nWrite the rule",
      "→",
      "Review\nTest the rule",
      "→",
      "Published\nUse the rule",
    ]);
    expect(
      tables[1].content?.[0].content?.map((cell) => cell.attrs?.colwidth),
    ).toEqual([null, [32], null, [32], null]);
    expect(parse(sanitizeHTML(toHTML(document)))).toEqual(document);
  });

  it("converts explicit grid layout and standalone cards without inventing structure for generic divs", () => {
    const document = parse(
      paste(
        '<div class="prose"><div style="display:grid;grid-template-columns:repeat(2, 1fr)"><div>A</div><div>B</div><div>C</div></div><div class="rounded border" style="background-color:#eef4ff"><strong>Note</strong><p>Keep this grouped.</p></div><div>Ordinary</div><div>text</div></div>',
      ),
    );
    expect(nodes(document, "table")).toHaveLength(1);
    expect(nodes(document, "table")[0].content).toHaveLength(2);
    expect(nodes(document, "callout")).toHaveLength(1);
    expect(nodes(document, "callout")[0].attrs?.backgroundColor).toBe(
      "rgb(238, 244, 255)",
    );
    expect(docText(document)).toContain("Ordinary");
    expect(docText(document)).toContain("text");
  });

  it("retains citation links while removing citation-only icons and count badges", () => {
    const clean = paste(
      '<div class="markdown"><p>A claim <span data-testid="webpage-citation"><a href="https://example.com/research"><img src="https://example.com/favicon.png"><span>Research source</span><span>+2</span></a><span>+3</span></span>.</p><p>Normal +2 prose <a href="https://example.com/gallery"><img src="https://example.com/chart.png" alt="Chart"></a></p></div>',
    );
    const document = parse(clean);
    const reference = nodes(document, "text").find(
      (node) => node.text === "Research source",
    );
    expect(reference?.marks).toContainEqual(
      expect.objectContaining({
        type: "link",
        attrs: expect.objectContaining({
          href: "https://example.com/research",
        }),
      }),
    );
    expect(clean).not.toMatch(/favicon|\+3/);
    expect(docText(document)).toContain("Normal +2 prose");
    expect(nodes(document, "image")[0].attrs?.alt).toBe("Chart");
  });

  it("preserves existing Google Docs fonts, relative sizes, spacing and regular wrapper weight", () => {
    const source =
      '<b id="docs-internal-guid-synthetic" style="font-weight:normal;font-family:Calibri"><h2 style="margin-top:18pt;margin-bottom:6pt;line-height:1.3"><span style="font-size:20pt">A heading</span></h2><p style="margin-bottom:12pt;text-align:right"><span style="font-size:12pt">Regular </span><span style="font-size:12pt;font-weight:700">important</span></p></b>';
    const document = parse(paste(source));
    expect(document.content?.[0].attrs).toMatchObject({
      fontFamily: "Calibri",
      fontSize: "20pt",
      marginTop: "18pt",
      marginBottom: "6pt",
      lineHeight: "1.3",
    });
    expect(document.content?.[1].attrs).toMatchObject({
      fontFamily: "Calibri",
      fontSize: "12pt",
      marginBottom: "12pt",
      textAlign: "right",
    });
    expect(
      nodes(document, "text")
        .find((node) => node.text === "Regular ")
        ?.marks?.some((mark) => mark.type === "bold") || false,
    ).toBe(false);
    const relative = new DOMParser().parseFromString(
      paste('<div style="font-size:120%"><p>Relative</p></div>'),
      "text/html",
    );
    expect(relative.querySelector("p")?.style.fontSize).toBe("");
  });

  it("keeps unsafe HTML and layout styles out of normalized cards, links, code and math", () => {
    const clean = paste(
      '<div class="markdown" onclick="bad()"><div class="grid grid-cols-2" style="position:fixed"><div class="rounded border" style="background-image:url(javascript:bad());color:#123456"><p>A</p><script>bad()</script></div><div><a href="javascript:bad()">Link</a><img src="data:image/svg+xml;base64,PHN2Zz4="></div></div><pre><code class="language-ini">&lt;script&gt;literal&lt;/script&gt;</code><button>Copy</button></pre><iframe src="https://example.com"></iframe><svg onload="bad()"></svg></div>',
    );
    expect(clean).not.toMatch(
      /onclick|onload|javascript:|background-image|position:|<script|<iframe|<svg|<button/,
    );
    expect(clean).toContain("&lt;script&gt;literal&lt;/script&gt;");
    expect(validateDocument(parse(clean))).toBe(true);
  });

  it("keeps explicit fonts when creating paragraphs for tight cells and lists", () => {
    const document = parse(
      paste(
        '<table><tr><td style="font-family:Verdana;font-size:13pt;line-height:1.4">Cell text</td></tr></table><ul style="font-family:Calibri;font-size:12pt"><li>List text</li></ul>',
      ),
    );
    const paragraphs = nodes(document, "paragraph");
    expect(
      paragraphs.find((node) => docText(node) === "Cell text")?.attrs,
    ).toMatchObject({
      fontFamily: "Verdana",
      fontSize: "13pt",
      lineHeight: "1.4",
    });
    expect(
      paragraphs.find((node) => docText(node) === "List text")?.attrs,
    ).toMatchObject({ fontFamily: "Calibri", fontSize: "12pt" });
  });

  it("bounds table column widths while keeping legitimate fixed arrow widths", () => {
    const html = sanitizeHTML(
      '<table><tr><td colwidth="32">→</td><td colwidth="999999">Large</td><td colwidth="-20">Negative</td><td colwidth="4px">Malformed</td><td colwidth="120,80">Merged</td></tr></table>',
    );
    const cells = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelectorAll("td");
    expect(
      Array.from(cells).map((cell) => cell.getAttribute("colwidth")),
    ).toEqual(["32", null, null, null, "120,80"]);
  });
});

describe("ChatGPT Copy button Markdown", () => {
  const source =
    "# Simulation\n\nA **balanced** stage with \\(x^2 + y^2 = r^2\\).\n\n## Stage weights\n\n\\[\nP_{stage} = \\frac{W_{stage}}{\\sum_i W_i}\n\\]\n\n- Keep state\n- Review output\n\n```ini\n[Stage]\n  Formula=\\(literal\\)\nEnabled=true\n```\n\n[Reference](https://example.com/reference)";
  it.each(["text/plain", "text/markdown"])(
    "formats %s without consuming LaTeX or literal INI source",
    (mime) => {
      const document = parse(paste(source, mime));
      expect(validateDocument(document)).toBe(true);
      expect(
        nodes(document, "heading").map((node) => node.attrs?.fontSize),
      ).toEqual(["22pt", "16pt"]);
      expect(nodes(document, "inlineMath")[0].attrs?.latex).toBe(
        "x^2 + y^2 = r^2",
      );
      expect(nodes(document, "blockMath")[0].attrs?.latex.trim()).toBe(
        "P_{stage} = \\frac{W_{stage}}{\\sum_i W_i}",
      );
      expect(nodes(document, "bulletList")[0].content).toHaveLength(2);
      expect(nodes(document, "codeBlock")[0]).toMatchObject({
        attrs: { language: "ini" },
        content: [{ text: "[Stage]\n  Formula=\\(literal\\)\nEnabled=true\n" }],
      });
      expect(
        nodes(document, "text")
          .find((node) => node.text === "balanced")
          ?.marks?.some((mark) => mark.type === "bold"),
      ).toBe(true);
      expect(
        nodes(document, "text")
          .find((node) => node.text === "Reference")
          ?.marks?.some((mark) => mark.type === "link"),
      ).toBe(true);
    },
  );

  it("recognizes math-only Copy button text without treating ordinary prose or prices as math", () => {
    expect(
      nodes(parse(paste("$x^2$", "text/plain")), "inlineMath"),
    ).toHaveLength(1);
    expect(paste("The price is $5 and $10.", "text/plain")).toBeNull();
    expect(paste("Ordinary prose.", "text/plain")).toBeNull();
  });

  it("uses the same math-safe import for Markdown files and Format Markdown", () => {
    const document = parseChapterFile("simulation.md", source).document;
    expect(nodes(document, "inlineMath")[0].attrs?.latex).toBe(
      "x^2 + y^2 = r^2",
    );
    expect(nodes(document, "blockMath")[0].attrs?.latex).toContain("\\frac");
    expect(nodes(document, "codeBlock")[0].content?.[0].text).toContain(
      "Formula=\\(literal\\)",
    );
  });

  it("retains flattened source lines and restores only known standalone image links", () => {
    const image1 =
      "https://images.openai.com/static-rsc-4/synthetic-overview?purpose=fullsize";
    const image2 =
      "https://images.openai.com/static-rsc-4/synthetic-detail?purpose=fullsize";
    const copied = [
      "A systems note",
      "Stage",
      "Meaning",
      "Draft",
      "Write a rule",
      "",
      `[Overview illustration](${image1})`,
      "",
      `[Detail illustration](${image2})`,
      "",
      "[A source](https://example.org/reference)",
      "",
      "[Publisher](https://www.google.com/s2/favicons?domain=https://example.org&sz=32)",
      "",
      "| Key | Value |",
      "| --- | --- |",
      "| phase | 1 |",
      "",
      "```ini",
      "  key=value",
      "next=2",
      "```",
    ].join("\n");
    const document = parse(paste(copied, "text/plain"));
    expect(nodes(document, "hardBreak")).toHaveLength(4);
    expect(nodes(document, "heading")).toHaveLength(0);
    expect(
      nodes(document, "image").map((node) => ({
        src: node.attrs?.src,
        alt: node.attrs?.alt,
      })),
    ).toEqual([
      { src: image1, alt: "Overview illustration" },
      { src: image2, alt: "Detail illustration" },
    ]);
    expect(nodes(document, "table")).toHaveLength(1); // Only the actual Markdown table.
    expect(nodes(document, "codeBlock")[0].content?.[0].text).toBe(
      "  key=value\nnext=2\n",
    );
    const links = nodes(document, "text")
      .flatMap((node) => node.marks || [])
      .filter((mark) => mark.type === "link");
    expect(links.map((mark) => mark.attrs?.href)).toEqual(
      expect.arrayContaining([
        image1,
        image2,
        "https://example.org/reference",
        "https://www.google.com/s2/favicons?domain=https://example.org&sz=32",
      ]),
    );
    expect(parse(sanitizeHTML(toHTML(document)))).toEqual(document);
  });

  it("does not promote inline image mentions, lookalike hosts, favicon links or normal illustrations", () => {
    const copied =
      "See [a gallery](https://images.openai.com/static-rsc-4/synthetic?purpose=fullsize) in this sentence.\n\n[Not that host](https://images.openai.com.example.org/static-rsc-4/nope)\n\n[Ordinary diagram](https://example.org/diagram.png)\n\n[Publisher](https://www.google.com/s2/favicons?domain=example.org&sz=32)";
    expect(nodes(parse(paste(copied, "text/plain")), "image")).toHaveLength(0);
  });

  it("splits adjacent whole-line gallery links away from surrounding prose without losing lines", () => {
    const image1 =
      "https://images.openai.com/static-rsc-4/synthetic-one?purpose=fullsize";
    const image2 =
      "https://images.openai.com/static-rsc-4/synthetic-two?purpose=fullsize";
    const image3 =
      "https://images.openai.com/static-rsc-4/synthetic-three?purpose=fullsize";
    const copied = [
      "A systems note.",
      "Stage",
      "Meaning",
      `[First illustration](${image1})`,
      `[Second illustration](${image2})`,
      `[Third illustration](${image3})`,
      "The explanation continues.",
      "Keep each line.",
      `See [an inline image reference](${image1}) in this sentence.`,
    ].join("\n");
    const document = parse(paste(copied, "text/plain"));
    expect(document.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "image",
      "paragraph",
      "image",
      "paragraph",
      "image",
      "paragraph",
      "paragraph",
    ]);
    expect(nodes(document, "image").map((node) => node.attrs?.src)).toEqual([
      image1,
      image2,
      image3,
    ]);
    expect(
      document.content?.[0].content
        ?.filter((node) => node.type === "text")
        .map((node) => node.text),
    ).toEqual(["A systems note.", "Stage", "Meaning"]);
    expect(
      document.content
        ?.at(-1)
        ?.content?.filter((node) => node.type === "text")
        .map((node) => node.text)
        .join(""),
    ).toBe(
      "The explanation continues.Keep each line.See an inline image reference in this sentence.",
    );
    expect(nodes(document, "hardBreak")).toHaveLength(4);
    expect(parse(sanitizeHTML(toHTML(document)))).toEqual(document);
  });
});
