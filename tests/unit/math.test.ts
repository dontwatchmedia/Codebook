import { afterEach, describe, expect, it, vi } from "vitest";
// Vitest normally stubs CSS imports; use the actual installed stylesheet to
// exercise the same font embedding transformation used by Vite's app build.
vi.mock("katex/dist/katex.min.css?raw", async () => ({
  default: (await import("node:fs")).readFileSync(
    "node_modules/katex/dist/katex.min.css",
    "utf8",
  ),
}));
import { Editor, generateJSON, type JSONContent } from "@tiptap/core";
import { marked } from "marked";
import { extensions } from "../../src/editor/extensions";
import { formatMarkdown } from "../../src/editor/formatMarkdown";
import {
  mathSource,
  normalizeMathHTML,
  protectMarkdownMath,
  renderMath,
  MAX_MATH_SOURCE,
} from "../../src/math";
import { mathExportCSS } from "../../src/mathExport";
import {
  cachedDocumentStats,
  docText,
  makeBook,
  plainText,
  validateDocument,
  wordCount,
  type Chapter,
} from "../../src/model";
import { exportHTML, exportMarkdown, toMarkdown } from "../../src/export";
import { exportPDFHTML } from "../../src/pdf";
import { parseChapterFile } from "../../src/importChapter";
const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
const editors: Editor[] = [];
function editor(document: JSONContent) {
  const instance = new Editor({ extensions: extensions(), content: document });
  editors.push(instance);
  return instance;
}
afterEach(() => editors.splice(0).forEach((value) => value.destroy()));
const math = (latex: string, block = false): JSONContent => ({
  type: block ? "blockMath" : "inlineMath",
  attrs: { latex },
});
const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  content,
});
const doc = (...content: JSONContent[]): JSONContent => ({
  type: "doc",
  content,
});

describe("source-preserving equations", () => {
  it("recovers one equation from each KaTeX renderer including its hidden MathML without duplicating text", () => {
    const parsed = parse(
      `<p>Inline ${renderMath("x^2 + y^2 = r^2", false)} remains.</p>${renderMath(String.raw`P_{stage}=\frac{W_{stage}}{\sum_{i=1}^{n} W_i}`, true)}`,
    );
    normalizeMathHTML(parsed);
    const nodes = [...parsed.querySelectorAll("[data-codebook-math]")];
    expect(nodes).toHaveLength(2);
    expect(
      nodes.map((node) => node.getAttribute("data-codebook-math")),
    ).toEqual(["inline", "block"]);
    expect(nodes[1].getAttribute("data-latex")).toBe(
      String.raw`P_{stage}=\frac{W_{stage}}{\sum_{i=1}^{n} W_i}`,
    );
    expect(parsed.body.textContent).toBe("Inline  remains.");
    expect(parsed.querySelector("math,.katex")).toBeNull();
  });

  it("extracts raw inline and display notation across styled spans, retaining surrounding text and order", () => {
    const parsed = parse(
      String.raw`<p>Before \(<em>x^2</em>+y^2\) after.</p><p>First \[\frac{a}{b}\] last.</p>`,
    );
    normalizeMathHTML(parsed);
    expect([...parsed.body.children].map((node) => node.tagName)).toEqual([
      "P",
      "P",
      "DIV",
      "P",
    ]);
    expect(
      parsed
        .querySelector('[data-codebook-math="inline"]')
        ?.getAttribute("data-latex"),
    ).toBe("x^2+y^2");
    expect(parsed.body.textContent).toBe("Before  after.First  last.");
    expect(
      generateJSON(parsed.body.innerHTML, extensions()).content?.[2],
    ).toEqual(math(String.raw`\frac{a}{b}`, true));
  });

  it("protects Markdown delimiters and escapes while preserving code, currency, and unrelated prose", () => {
    const source =
      String.raw`Inline \(\frac{a_1}{b^2}\), then $x^2$.

$$
\sum_{i=1}^{n} i
$$

Pay $5 and $10; \$25 remains currency. Use ` +
      "`$x$ \\(y\\)`" +
      String.raw` in code.

` +
      "```tex\n\\[raw code\\]\n$x$\n```";
    const protectedMath = protectMarkdownMath(source);
    const parsed = parse(
      protectedMath.restore(marked.parse(protectedMath.source) as string),
    );
    normalizeMathHTML(parsed);
    expect(
      [...parsed.querySelectorAll("[data-codebook-math]")].map((node) =>
        node.getAttribute("data-latex"),
      ),
    ).toEqual([String.raw`\frac{a_1}{b^2}`, "x^2", "\n\\sum_{i=1}^{n} i\n"]);
    expect(parsed.body.textContent).toContain("Pay $5 and $10");
    expect(parsed.querySelector("pre code")?.textContent).toBe(
      "\\[raw code\\]\n$x$\n",
    );
    expect(
      [...parsed.querySelectorAll("p")].filter(
        (node) =>
          !node.textContent?.trim() &&
          !node.querySelector("[data-codebook-math]"),
      ),
    ).toHaveLength(0);
  });

  it("ignores raw math in code, scripts, controls, and already converted equations", () => {
    const parsed = parse(
      String.raw`<pre>\[code\]</pre><p><code>$x$</code></p><script>\(script\)</script><style>\(style\)</style><button>\(button\)</button><textarea>\(draft\)</textarea><p><span data-math="a+b" data-math-display="true"></span></p>`,
    );
    normalizeMathHTML(parsed);
    normalizeMathHTML(parsed);
    expect(parsed.querySelectorAll("[data-codebook-math]")).toHaveLength(1);
    expect(
      parsed.querySelector("[data-codebook-math]")?.getAttribute("data-latex"),
    ).toBe("a+b");
    expect(parsed.querySelector("code")?.textContent).toBe("$x$");
  });

  it("keeps explicitly escaped Markdown delimiters literal after Markdown parsing", () => {
    const source = String.raw`Escaped \$x\$ and \\(y\\) stay literal; actual $z^2$ is math.`;
    const protectedMath = protectMarkdownMath(source);
    const parsed = parse(
      protectedMath.restore(marked.parse(protectedMath.source) as string),
    );
    normalizeMathHTML(parsed);
    expect(parsed.querySelectorAll("[data-codebook-math]")).toHaveLength(1);
    expect(
      parsed.querySelector("[data-codebook-math]")?.getAttribute("data-latex"),
    ).toBe("z^2");
    expect(parsed.body.textContent).toContain(
      String.raw`Escaped $x$ and \(y\) stay literal`,
    );
  });

  it("does not turn four-space or tab-indented Markdown code examples into equations", () => {
    const source =
      "    \\[code\\]\n    $x^2$\n\n\t\\(more code\\)\n\nProse $y^2$ renders.";
    const imported = parseChapterFile("indented-equations.md", source).document;
    const allNodes = (node: JSONContent): JSONContent[] => [
      node,
      ...(node.content || []).flatMap(allNodes),
    ];
    const nodes = allNodes(imported);
    expect(
      nodes
        .filter((node) => node.type === "inlineMath")
        .map((node) => node.attrs?.latex),
    ).toEqual(["y^2"]);
    expect(nodes.filter((node) => node.type === "blockMath")).toHaveLength(0);
    expect(
      nodes
        .filter((node) => node.type === "codeBlock")
        .map(docText)
        .join("\n"),
    ).toContain("\\[code\\]\n$x^2$");
    expect(
      nodes
        .filter((node) => node.type === "codeBlock")
        .map(docText)
        .join("\n"),
    ).toContain("\\(more code\\)");
  });

  it("round-trips display equations inside blockquotes and list items without moving or corrupting them", () => {
    const equation = math(String.raw`\frac{a}{b}`, true);
    const quoted: JSONContent = {
      type: "blockquote",
      content: [paragraph(text("Before")), equation, paragraph(text("After"))],
    };
    const listed: JSONContent = {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            paragraph(text("Item")),
            equation,
            paragraph(text("After")),
          ],
        },
      ],
    };
    for (const container of [
      quoted,
      listed,
      { type: "blockquote", content: [quoted] },
    ]) {
      const imported = parseChapterFile(
        "nested-math.md",
        toMarkdown(doc(container)),
      ).document;
      expect(imported.content?.map((node) => node.type)).toEqual([
        container.type,
      ]);
      const unwrap = (node: JSONContent): JSONContent[] => [
        node,
        ...(node.content || []).flatMap(unwrap),
      ];
      const equations = unwrap(imported).filter(
        (node) => node.type === "blockMath",
      );
      expect(equations).toEqual([equation]);
      expect(docText(imported)).toContain("After");
    }
  });

  it("preserves oversized equation source as literal text instead of silently dropping it", () => {
    const source = "x".repeat(MAX_MATH_SOURCE + 1);
    const parsed = parse(
      `<p>Before <span data-math="${source}"></span> after.</p>`,
    );
    normalizeMathHTML(parsed);
    expect(parsed.querySelector("[data-codebook-math]")).toBeNull();
    expect(parsed.body.textContent).toBe(`Before \\(${source}\\) after.`);
  });

  it("stores equations as validated atoms and retains searchable/copyable source with accurate cached stats", () => {
    const document = doc(
      paragraph(text("Use "), math("x+y"), text(" here.")),
      math(String.raw`\frac{a}{b}`, true),
    );
    expect(validateDocument(document)).toBe(true);
    expect(docText(document)).toContain(String.raw`\(x+y\)`);
    expect(plainText(document)).toContain(String.raw`\frac{a}{b}`);
    expect(cachedDocumentStats(document).words).toBe(wordCount(document));
    expect(cachedDocumentStats(document).characters).toBe(
      docText(document).length,
    );
    expect(
      validateDocument(doc(math("x".repeat(MAX_MATH_SOURCE + 1), true))),
    ).toBe(false);
    expect(validateDocument(doc(math("", true)))).toBe(false);
    expect(
      validateDocument(doc({ ...math("x", true), content: [text("hidden")] })),
    ).toBe(false);
  });

  it("renders safe local math and preserves invalid or untrusted commands as readable source", () => {
    expect(
      parse(renderMath(String.raw`\frac{1}{2}`, false)).querySelector(
        ".katex .mfrac",
      ),
    ).not.toBeNull();
    for (const source of [
      String.raw`\href{javascript:alert(1)}{click}`,
      String.raw`\htmlData{onclick=alert(1)}{x}`,
      String.raw`\def\loop{\loop}\loop`,
      "<script>alert(1)</script>\\unknown",
    ]) {
      const parsed = parse(renderMath(source, false));
      expect(parsed.querySelector("script,a,[onclick]")).toBeNull();
      expect(parsed.body.textContent).toContain(source);
    }
    expect(
      parse(
        renderMath(String.raw`\rule{99999em}{99999em}`, true),
      ).querySelector(".katex-html")!.innerHTML,
    ).not.toContain("99999em");
  });

  it("bundles offline fonts and includes rendered math plus exact source in HTML, Markdown and PDF export", () => {
    const book = makeBook("Equation guide");
    (book.nodes[0] as Chapter).document = doc(
      paragraph(text("Radius "), math("x^2+y^2=r^2")),
      math(String.raw`\frac{a}{b}`, true),
    );
    expect(mathExportCSS.match(/@font-face/g)?.length).toBeGreaterThan(10);
    expect(mathExportCSS).toContain(
      '@media print{[data-codebook-math="block"]{overflow:visible}}',
    );
    expect(
      mathExportCSS.match(/data:font\/woff2;base64,/g)?.length,
    ).toBeGreaterThan(10);
    expect(mathExportCSS).not.toMatch(
      /url\(["']?(?:fonts\/|https?:|\/node_modules)/,
    );
    for (const html of [exportHTML(book), exportPDFHTML(book)]) {
      const parsed = parse(html);
      expect(parsed.querySelectorAll("[data-codebook-math]")).toHaveLength(2);
      expect(parsed.querySelectorAll(".katex")).toHaveLength(2);
      expect(
        parsed
          .querySelector('[data-codebook-math="block"]')
          ?.getAttribute("data-latex"),
      ).toBe(String.raw`\frac{a}{b}`);
      expect(parsed.querySelector("style")?.textContent).toContain(
        "data:font/woff2;base64,",
      );
    }
    const markdown = exportMarkdown(book);
    expect(markdown).toContain(String.raw`\(x^2+y^2=r^2\)`);
    expect(markdown).toContain("$$\n\\frac{a}{b}\n$$");
    const imported = parseChapterFile("equations.md", markdown).document;
    expect(JSON.stringify(imported)).toContain('"inlineMath"');
    expect(JSON.stringify(imported)).toContain('"blockMath"');
    const native = editor((book.nodes[0] as Chapter).document);
    const roundTrip = generateJSON(native.getHTML(), extensions());
    expect(roundTrip.content?.[0].content?.[1]).toEqual(math("x^2+y^2=r^2"));
    expect(roundTrip.content?.[1]).toEqual(math(String.raw`\frac{a}{b}`, true));
    expect(native.getText()).toContain(mathSource(math("x^2+y^2=r^2")));
  });

  it("Format Markdown converts equation-only source, keeps existing math, and restores the original with one Undo", () => {
    const existing = math("a+b");
    const instance = editor(
      doc(
        paragraph(text("Already "), existing, text(" and **bold**.")),
        paragraph(text(String.raw`\[\frac{x}{y}\]`)),
      ),
    );
    const before = instance.getJSON();
    expect(formatMarkdown(instance).changed).toBe(true);
    const json = instance.getJSON();
    expect(JSON.stringify(json)).toContain('"inlineMath"');
    expect(JSON.stringify(json)).toContain('"blockMath"');
    expect(JSON.stringify(json)).not.toContain("CODEBOOK");
    expect(instance.commands.undo()).toBe(true);
    expect(instance.getJSON()).toEqual(before);
  });

  it("editing equation source changes a single atom and supports Undo and Redo", () => {
    const instance = editor(
      doc(paragraph(text("Before "), math("x^2"), text(" after."))),
    );
    const before = instance.getJSON();
    const element =
      instance.view.dom.querySelector<HTMLElement>(".math-rendered")!;
    element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = instance.view.dom.querySelector<HTMLTextAreaElement>(
      '[aria-label="Equation source"]',
    )!;
    expect(input.value).toBe("x^2");
    input.value = "x^3";
    [...instance.view.dom.querySelectorAll("button")]
      .find((button) => button.textContent === "Save equation")!
      .click();
    expect(instance.getJSON().content?.[0].content?.[1]).toEqual(math("x^3"));
    expect(instance.commands.undo()).toBe(true);
    expect(instance.getJSON()).toEqual(before);
    expect(instance.commands.redo()).toBe(true);
    expect(instance.getJSON().content?.[0].content?.[1]).toEqual(math("x^3"));
    expect(instance.getHTML()).toContain('data-latex="x^3"');
  });
});
