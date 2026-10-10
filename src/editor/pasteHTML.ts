import {
  DOMParser as ProseMirrorDOMParser,
  type Schema,
  type TagParseRule,
} from "@tiptap/pm/model";

// Normal HTML indentation is presentation source, not a manuscript line break.
// Literal Markdown copied as paragraphs is the exception: spaces inside its
// fences must survive so Format Markdown can recover the exact code later.
export function parsePastedHTML(html: string, schema: Schema) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const preserve = new WeakSet<Element>();
  const fences = new Map<Element, { character: string; length: number }>();
  for (const paragraph of parsed.body.querySelectorAll("p")) {
    if (paragraph.closest("pre, code") || !paragraph.parentElement) continue;
    const parent = paragraph.parentElement;
    let fence = fences.get(parent);
    if (fence) preserve.add(paragraph);
    const source = paragraph.cloneNode(true) as Element;
    source.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    for (const line of (source.textContent || "").split(/\r?\n/)) {
      const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) continue;
      if (!fence) {
        if (match[1][0] === "`" && match[2].includes("`")) continue;
        fence = { character: match[1][0], length: match[1].length };
        preserve.add(paragraph);
      } else if (
        match[1][0] === fence.character &&
        match[1].length >= fence.length &&
        !match[2].trim()
      ) {
        fence = undefined;
      }
    }
    if (fence) fences.set(parent, fence);
    else fences.delete(parent);
  }
  const standard = ProseMirrorDOMParser.fromSchema(schema);
  const literalRules = standard.rules
    .filter(
      (rule): rule is TagParseRule =>
        "tag" in rule && "node" in rule && rule.node === "paragraph",
    )
    .map((rule): TagParseRule => ({
      ...rule,
      preserveWhitespace: "full",
      getAttrs: (element) =>
        preserve.has(element) ? (rule.getAttrs?.(element) ?? null) : false,
    }));
  return new ProseMirrorDOMParser(schema, [
    ...literalRules,
    ...standard.rules,
  ]).parseSlice(parsed.body, { preserveWhitespace: false }).content;
}
