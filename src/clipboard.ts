import DOMPurify from "dompurify";
import { marked } from "marked";
import { sanitizeInlineStyle } from "./formatting";
export const NATIVE_MIME = "application/x-codebook";
const blockTags = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "LI",
  "TD",
  "TH",
  "ASIDE",
]);
const inheritedProperties = [
  "font-family",
  "font-size",
  "color",
  "line-height",
];
const absoluteFontSize = (value: string) =>
  /^\d+(?:\.\d+)?(?:px|pt)$/.test(value);

function retainDocumentFormatting(parsed: Document) {
  parsed.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = sanitizeInlineStyle(element.getAttribute("style") || "");
    if (style) element.setAttribute("style", style);
    else element.removeAttribute("style");
  });
  // Google Docs uses a normal-weight <b> around the entire copied selection.
  // Removing its style would make every paragraph bold in a rich text parser.
  parsed.querySelectorAll<HTMLElement>("b, strong").forEach((element) => {
    if (element.style.fontWeight !== "400") return;
    const span = parsed.createElement("span");
    for (const attribute of element.attributes)
      span.setAttribute(attribute.name, attribute.value);
    span.replaceChildren(...element.childNodes);
    element.replaceWith(span);
  });
  const propagate = (element: HTMLElement, inherited: Map<string, string>) => {
    const current = new Map(inherited);
    for (const property of inheritedProperties) {
      const own = element.style.getPropertyValue(property);
      if (own) current.set(property, own);
      else if (
        blockTags.has(element.tagName) &&
        inherited.has(property) &&
        (property !== "font-size" || absoluteFontSize(inherited.get(property)!))
      )
        element.style.setProperty(property, inherited.get(property)!);
    }
    for (const child of element.children)
      propagate(child as HTMLElement, current);
  };
  propagate(parsed.body, new Map());
  // A Docs paragraph often stores its font on every span, rather than on the
  // paragraph. Its line height and spacing still need that common font size.
  // Work from children to parents so list markers inherit the same font as
  // their text. Relative font sizes stay on their original element; copying
  // them onto an ancestor would multiply the size again.
  Array.from(
    parsed.querySelectorAll<HTMLElement>(
      "p, h1, h2, h3, h4, h5, h6, li, ul, ol",
    ),
  )
    .reverse()
    .forEach((block) => {
      for (const property of [
        "font-family",
        "font-size",
        "color",
        "line-height",
      ]) {
        if (block.style.getPropertyValue(property)) continue;
        const values: string[] = [];
        const inspect = (element: HTMLElement, inherited: string) => {
          const own = element.style.getPropertyValue(property) || inherited;
          for (const child of element.childNodes) {
            if (child.nodeType === 3 && child.textContent?.trim())
              values.push(own);
            else if (child.nodeType === 1) inspect(child as HTMLElement, own);
          }
        };
        inspect(block, "");
        // Blank Docs lines still carry a font on their otherwise empty span.
        // Keep it on the paragraph before the parser discards that empty run.
        if (
          !values.length &&
          !block.textContent?.trim() &&
          (property === "font-family" || property === "font-size")
        ) {
          for (const span of block.querySelectorAll<HTMLElement>("span[style]"))
            values.push(span.style.getPropertyValue(property));
        }
        if (
          values.length &&
          values[0] &&
          (property !== "font-size" || absoluteFontSize(values[0])) &&
          values.every((value) => value === values[0])
        )
          block.style.setProperty(property, values[0]);
      }
    });
}
export function sanitizeHTML(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "style",
      "button",
      "input",
      "form",
      "iframe",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["srcset"],
    ADD_ATTR: [
      "data-language",
      "data-filename",
      "data-line-numbers",
      "data-caption",
      "data-callout",
    ],
  });
  const parsed = new DOMParser().parseFromString(clean, "text/html");
  retainDocumentFormatting(parsed);
  parsed.querySelectorAll("pre").forEach((pre) => {
    const code = pre.querySelector("code");
    const language =
      code?.className.match(/(?:language-|lang-)([\w+#-]+)/)?.[1] ||
      pre.getAttribute("data-language") ||
      pre.className.match(/(?:language-|lang-)([\w+#-]+)/)?.[1];
    const fresh = parsed.createElement("code");
    if (language) fresh.className = `language-${language}`;
    fresh.textContent = (code ?? pre).textContent;
    pre.replaceChildren(fresh);
  });
  parsed.querySelectorAll("a").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!/^(https?:|mailto:|#)/i.test(href)) a.removeAttribute("href");
  });
  parsed.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (!/^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(src))
      img.remove();
  });
  return parsed.body.innerHTML;
}
export function markdownHTML(markdown: string) {
  return sanitizeHTML(
    marked.parse(markdown, { gfm: true, breaks: false }) as string,
  );
}
export function looksLikeMarkdown(text: string) {
  return /(^|\n)(#{1,4} |\s*```|\s*~~~|> |[-*+] |\d+\. )|\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\n\|?.+\|\n\|?\s*:?-{3}/m.test(
    text,
  );
}
export function clipboardHTML(
  data: Pick<DataTransfer, "getData">,
): string | null {
  const html = data.getData("text/html");
  if (html) return sanitizeHTML(html);
  const markdown = data.getData("text/markdown");
  if (markdown) return markdownHTML(markdown);
  const plain = data.getData("text/plain");
  return looksLikeMarkdown(plain) ? markdownHTML(plain) : null;
}
