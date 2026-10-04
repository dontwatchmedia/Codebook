import { generateJSON } from "@tiptap/core";
import { expect, it } from "vitest";
import { sanitizeHTML } from "../../src/clipboard";
import { extensions } from "../../src/editor/extensions";
import { toHTML } from "../../src/export";

it("preserves the source font on empty copied lines without altering their content", () => {
  const doc = generateJSON(
    sanitizeHTML(
      '<p style="line-height:1.15;margin-bottom:0pt"><span style="font-family:Arial;font-size:11pt">&nbsp;</span></p><p><span style="font-family:Arial;font-size:11pt"><br></span></p>',
    ),
    extensions(),
  );
  for (const node of doc.content || [])
    expect(node.attrs).toMatchObject({ fontFamily: "Arial", fontSize: "11pt" });
  expect(toHTML(doc)).toContain("font-size: 11pt");
});
