import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { extensions } from "../../src/editor/extensions";
import { parsePastedHTML } from "../../src/editor/pasteHTML";
import { sanitizeHTML } from "../../src/clipboard";

const schema = getSchema(extensions());
const parse = (html: string) =>
  parsePastedHTML(sanitizeHTML(html), schema).toJSON();

describe("HTML paste whitespace", () => {
  it("collapses source indentation around inline equations while preserving explicit breaks and real code", () => {
    const result = parse(`
      <p>A circular boundary uses
        <span data-codebook-math="inline" data-latex="x^2">x^2</span>.
      </p>
      <p>First line<br>Second line</p>
      <pre><code class="language-ini">[stage]\n  weight=2\n\n</code></pre>
    `);
    expect(result).toHaveLength(3);
    expect(result[0].content).toEqual([
      { type: "text", text: "A circular boundary uses " },
      { type: "inlineMath", attrs: { latex: "x^2" } },
      { type: "text", text: "." },
    ]);
    expect(
      result[1].content.map((node: { type: string }) => node.type),
    ).toEqual(["text", "hardBreak", "text"]);
    expect(result[2].content[0].text).toBe("[stage]\n  weight=2\n\n");
  });

  it("retains indentation and typography inside literal fences without changing surrounding prose", () => {
    const result = parse(`
      <p>Intro
        words.</p>
      <p style="font-family:Arial;font-size:11pt">\`\`\`javascript</p>
      <p style="font-family:Arial;font-size:11pt">  // preserved indentation</p>
      <p></p>
      <p>\treturn  2;</p>
      <p>\`\`\`</p>
      <p>After
        words.</p>
    `);
    expect(
      result.map(
        (node: { content?: { text?: string }[] }) =>
          node.content?.[0]?.text || "",
      ),
    ).toEqual([
      "Intro words.",
      "```javascript",
      "  // preserved indentation",
      "",
      "\treturn  2;",
      "```",
      "After words.",
    ]);
    expect(result[2].attrs).toMatchObject({
      fontFamily: "Arial",
      fontSize: "11pt",
    });
  });

  it("preserves a multiline literal fence and keeps unrelated containers independent", () => {
    const result =
      parse(`<blockquote><p>~~~ini<br>  weight=2<br>~~~</p></blockquote>
      <p>Outer
        prose.</p>`);
    expect(result[0].content[0].content).toEqual([
      { type: "text", text: "~~~ini" },
      { type: "hardBreak" },
      { type: "text", text: "  weight=2" },
      { type: "hardBreak" },
      { type: "text", text: "~~~" },
    ]);
    expect(result[1].content[0].text).toBe("Outer prose.");
  });
});
