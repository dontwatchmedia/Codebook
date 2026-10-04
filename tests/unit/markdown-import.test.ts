import { describe, expect, it } from "vitest";
import { generateJSON, type JSONContent } from "@tiptap/core";
import { parseChapterFile } from "../../src/importChapter";
import { sanitizeHTML } from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import { toHTML, toMarkdown } from "../../src/export";
import { docText, validateDocument } from "../../src/model";

function allNodes(document: JSONContent): JSONContent[] {
  return [document, ...(document.content || []).flatMap(allNodes)];
}
function textNode(document: JSONContent, text: string) {
  return allNodes(document).find(
    (node) => node.type === "text" && node.text === text,
  );
}

describe("Markdown chapter file conversion", () => {
  it("takes the first meaningful H1 as the title while retaining it and all heading levels", () => {
    const { title, document } = parseChapterFile(
      "old_name.MARKDOWN",
      [
        "<h1></h1>",
        "# Living **World**",
        "## Subsystem",
        "### Function",
        "#### Detail",
        "##### Reference",
        "###### Footnote",
        "",
        "Normal prose.",
      ].join("\n\n"),
    );
    expect(title).toBe("Living World");
    const headings = allNodes(document).filter(
      (node) => node.type === "heading",
    );
    expect(headings.map((node) => node.attrs?.level)).toEqual([
      1, 1, 2, 3, 4, 5, 6,
    ]);
    expect(headings.slice(1).map((node) => node.attrs?.fontSize)).toEqual([
      "22pt",
      "16pt",
      "14pt",
      "12pt",
      "11pt",
      "11pt",
    ]);
    expect(docText(headings[1])).toBe("Living World");
    expect(
      allNodes(headings[1])
        .filter((node) => node.type === "text")
        .every((node) => node.marks?.some((mark) => mark.type === "bold")),
    ).toBe(true);
    expect(document.content?.at(-1)?.attrs).toMatchObject({
      fontFamily: "Arial",
      fontSize: "11pt",
      lineHeight: "1.15",
      marginTop: "0pt",
      marginBottom: "8pt",
    });
    expect(validateDocument(document)).toBe(true);
  });

  it("preserves semantic formatting, nested lists, tables, images, quotes, and dividers", () => {
    const source = [
      "# Systems bible",
      "Regular **bold** *italic* ~~retired~~ [guide](https://example.com/guide) and `read()`.  \nNext line.",
      "- Outer\n  - Nested **item**\n\n3. Ordered item\n4. Next item",
      "> Quoted *context*.",
      "| Name | State |\n| :--- | :---: |\n| Garden | **Done** |",
      "![World diagram](https://example.com/world.png)",
      "---",
      "## More systems",
    ].join("\n\n");
    const { document } = parseChapterFile("systems.md", source);
    const nodes = allNodes(document);
    expect(nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining([
        "heading",
        "paragraph",
        "bulletList",
        "orderedList",
        "blockquote",
        "table",
        "tableHeader",
        "tableCell",
        "image",
        "horizontalRule",
        "hardBreak",
      ]),
    );
    expect(
      textNode(document, "bold")?.marks?.map((mark) => mark.type),
    ).toContain("bold");
    expect(
      textNode(document, "italic")?.marks?.map((mark) => mark.type),
    ).toContain("italic");
    expect(
      textNode(document, "retired")?.marks?.map((mark) => mark.type),
    ).toContain("strike");
    expect(textNode(document, "guide")?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({ href: "https://example.com/guide" }),
        }),
      ]),
    );
    expect(
      textNode(document, "read()")?.marks?.map((mark) => mark.type),
    ).toEqual(["code"]);
    expect(
      textNode(document, "Regular ")?.marks?.some(
        (mark) => mark.type === "bold",
      ),
    ).not.toBe(true);
    const list = document.content?.find((node) => node.type === "bulletList");
    expect(list?.content?.[0].content?.[1].type).toBe("bulletList");
    expect(list?.content?.[0].content?.[0].attrs).toMatchObject({
      fontFamily: "Arial",
      fontSize: "11pt",
      marginBottom: "0pt",
    });
    expect(
      document.content?.find((node) => node.type === "orderedList")?.attrs
        ?.start,
    ).toBe(3);
    const headers = nodes.filter((node) => node.type === "tableHeader");
    expect(headers[0].attrs?.textAlign).toBe("left");
    expect(headers[1].attrs?.textAlign).toBe("center");
    expect(nodes.find((node) => node.type === "image")?.attrs).toMatchObject({
      src: "https://example.com/world.png",
      alt: "World diagram",
    });
    expect(validateDocument(document)).toBe(true);
  });

  it("keeps fenced code language, indentation, blank lines, and literal markup without prose styles", () => {
    const code =
      'function read() {\n\tconst text = "<p>**literal**</p>";\n\n    return text;\n}';
    const { document } = parseChapterFile(
      "code.md",
      `# Code\n\n\`\`\`javascript\n${code}\n\`\`\`\n\nAfter code.`,
    );
    const block = document.content?.find((node) => node.type === "codeBlock");
    expect(block?.attrs?.language).toBe("javascript");
    expect(block?.attrs?.fontFamily).toBeUndefined();
    expect(block?.attrs?.fontSize).toBeUndefined();
    // The source line break immediately before the closing fence is retained.
    expect(block?.content?.[0]).toEqual({ type: "text", text: `${code}\n` });
    expect(
      parseChapterFile("again.md", toMarkdown(document)).document.content?.find(
        (node) => node.type === "codeBlock",
      ),
    ).toEqual(block);
  });

  it("retains checked and unchecked task states at every list depth without modifying fenced code", () => {
    const code =
      '- [x] Literal checked source\n- [ ] Literal unchecked source\n<input type="checkbox" checked>';
    const { document } = parseChapterFile(
      "tasks.md",
      [
        "# Tasks",
        "- [x] Finished **system**\n- [ ] Pending system\n  - [X] Finished child\n  - [ ] Pending child",
        `\`\`\`markdown\n${code}\n\`\`\``,
      ].join("\n\n"),
    );
    const lists = allNodes(document).filter(
      (node) => node.type === "bulletList",
    );
    expect(lists).toHaveLength(2);
    const writing = docText(lists[0]);
    expect(writing).toContain("☑ Finished system");
    expect(writing).toContain("☐ Pending system");
    expect(writing).toContain("☑ Finished child");
    expect(writing).toContain("☐ Pending child");
    expect(
      textNode(document, "system")?.marks?.map((mark) => mark.type),
    ).toContain("bold");
    expect(
      document.content?.find((node) => node.type === "codeBlock")?.content?.[0]
        .text,
    ).toBe(`${code}\n`);
    const html = toHTML(document);
    expect(html).not.toContain('<input type="checkbox"');
    expect(generateJSON(sanitizeHTML(html), extensions())).toEqual(document);
    expect(validateDocument(document)).toBe(true);
  });

  it("keeps local image captions and companion paths visible while retaining supported images", () => {
    const { document } = parseChapterFile(
      "diagrams.md",
      [
        "# Diagrams",
        '![Garden map](./images/garden.png "Growth zones")',
        "![](../images/overview.webp)",
        '<img src="file:///C:/notes/world.png" alt="Local world">',
        "![Remote world](https://example.com/world.png)",
        '<img src="data:image/png;base64,YQ==" alt="Embedded world">',
        "```markdown\n![Literal map](./images/literal.png)\n```",
      ].join("\n\n"),
    );
    const writing = docText(document);
    expect(writing).toContain(
      "[Image: Garden map — Growth zones — ./images/garden.png]",
    );
    expect(writing).toContain("[Local image: ../images/overview.webp]");
    expect(writing).toContain(
      "[Image: Local world — file:///C:/notes/world.png]",
    );
    expect(
      allNodes(document)
        .filter((node) => node.type === "image")
        .map((node) => node.attrs?.src),
    ).toEqual(["https://example.com/world.png", "data:image/png;base64,YQ=="]);
    expect(
      document.content?.find((node) => node.type === "codeBlock")?.content?.[0]
        .text,
    ).toBe("![Literal map](./images/literal.png)\n");
    expect(validateDocument(document)).toBe(true);
  });

  it("round trips its Google-style typography through portable HTML without expanding blank space", () => {
    const { document } = parseChapterFile(
      "overview.md",
      "# Overview\n\n**One** paragraph.\n\n---\n\n## Details\n\n- Item\n  - Child\n\n> Context.",
    );
    const html = toHTML(document);
    expect(html).toContain("font-size: 22pt");
    expect(html).toContain("font-size: 16pt");
    expect(html).toContain("font-family: Arial");
    expect(html).toContain("line-height: 1.15");
    expect(html).toContain("margin-bottom: 8pt");
    const roundTrip = generateJSON(sanitizeHTML(html), extensions());
    expect(roundTrip).toEqual(document);
    expect(
      allNodes(document).filter(
        (node) => node.type === "paragraph" && !node.content?.length,
      ),
    ).toHaveLength(0);
  });

  it("uses a cleaned filename when there is no title and keeps frontmatter-like source content", () => {
    expect(
      parseChapterFile(
        "C:\\notes\\garden_system-v2.md",
        "## Garden\n\nDetails.",
      ).title,
    ).toBe("garden system v2");
    const { title, document } = parseChapterFile(
      "metadata.md",
      "---\ntitle: Keep this source\n---\n\n# Real title\n\nBody.",
    );
    expect(title).toBe("Real title");
    expect(docText(document)).toContain("title: Keep this source");
  });

  it("preserves source HTML typography and treats text files as literal plain text", () => {
    const html = parseChapterFile(
      "source.htm",
      '<h1 style="font-family:Verdana;font-size:19pt;margin-top:4pt">Source title</h1><p style="font-family:Calibri;font-size:12pt;line-height:1.5;margin-bottom:10pt">Source <strong>bold</strong>.</p>',
    );
    expect(html.title).toBe("Source title");
    expect(html.document.content?.[0].attrs).toMatchObject({
      fontFamily: "Verdana",
      fontSize: "19pt",
      marginTop: "4pt",
    });
    expect(html.document.content?.[1].attrs).toMatchObject({
      fontFamily: "Calibri",
      fontSize: "12pt",
      lineHeight: "1.5",
      marginBottom: "10pt",
    });
    const plain = parseChapterFile(
      "literal_text.txt",
      "# Literal heading\r\n\r\n**literal** <script>text</script>",
    );
    expect(plain.title).toBe("literal text");
    expect(plain.document.content?.map((node) => node.type)).toEqual([
      "paragraph",
      "paragraph",
      "paragraph",
    ]);
    expect(docText(plain.document)).toContain(
      "**literal** <script>text</script>",
    );
    expect(allNodes(plain.document).some((node) => node.marks?.length)).toBe(
      false,
    );
    expect(plain.document.content?.[0].attrs?.fontSize).toBeNull();
  });

  it("sanitizes unsafe rich content while retaining safe embedded images", () => {
    const { document } = parseChapterFile(
      "safe.md",
      '# Safe\n\n<script>evil()</script>\n\n<a href="javascript:evil()">Read</a>\n\n<img src="data:image/png;base64,YQ==" alt="Embedded diagram" onerror="evil()">',
    );
    expect(validateDocument(document)).toBe(true);
    const html = toHTML(document);
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(html).toContain("data:image/png;base64,YQ==");
  });

  it("handles BOM and empty Markdown, and rejects unsupported file types descriptively", () => {
    expect(parseChapterFile("bom.md", "\uFEFF# Title\n\nText").title).toBe(
      "Title",
    );
    expect(validateDocument(parseChapterFile("empty.md", "").document)).toBe(
      true,
    );
    expect(() => parseChapterFile("project.pdf", "%PDF")).toThrow(
      /Markdown.*HTML.*plain text/,
    );
  });
});
