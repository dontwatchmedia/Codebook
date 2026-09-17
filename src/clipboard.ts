import DOMPurify from "dompurify";
import { marked } from "marked";
export const NATIVE_MIME = "application/x-codebook";
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
    FORBID_ATTR: ["style", "srcset"],
    ADD_ATTR: [
      "data-language",
      "data-filename",
      "data-line-numbers",
      "data-caption",
      "data-callout",
    ],
  });
  const parsed = new DOMParser().parseFromString(clean, "text/html");
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
