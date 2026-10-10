import { generateJSON, type JSONContent } from "@tiptap/core";
import { marked } from "marked";
import { sanitizeHTML } from "./clipboard";
import { extensions } from "./editor/extensions";
import { validateDocument } from "./model";
import { protectMarkdownMath } from "./math";

export interface ImportedChapter {
  title: string;
  document: JSONContent;
}

const supportedExtensions = new Set(["md", "markdown", "html", "htm", "txt"]);
const headingSizes = [22, 16, 14, 12, 11, 11];
const blockTags = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "PRE",
  "BLOCKQUOTE",
  "UL",
  "OL",
  "TABLE",
  "HR",
  "DIV",
  "ASIDE",
]);

function fileTitle(fileName: string): string {
  const basename = fileName.split(/[\\/]/).pop() || fileName;
  return (
    basename
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Imported chapter"
  );
}

function chapterMarkdownHTML(source: string): string {
  const protectedMath = protectMarkdownMath(source);
  const parsed = new DOMParser().parseFromString(
    protectedMath.restore(
      marked.parse(protectedMath.source, {
        gfm: true,
        breaks: false,
      }) as string,
    ),
    "text/html",
  );
  // The manuscript schema does not have interactive task-list nodes. Preserve
  // Markdown task state as writing before the sanitizer removes form inputs.
  parsed
    .querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')
    .forEach((input) => {
      input.replaceWith(
        parsed.createTextNode(input.hasAttribute("checked") ? "☑ " : "☐ "),
      );
    });
  // A file import cannot read local companion images. Keep their descriptions
  // and paths visible so references are not silently lost during conversion.
  parsed.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const src = image.getAttribute("src") || "";
    const local =
      src &&
      ((!/^[a-z][a-z\d+.-]*:/i.test(src) && !src.startsWith("//")) ||
        /^file:/i.test(src) ||
        /^[a-z]:[\\/]/i.test(src));
    if (!local) return;
    const alt = image.getAttribute("alt")?.trim();
    const caption = image.getAttribute("title")?.trim();
    const description = [alt, caption && caption !== alt ? caption : ""]
      .filter(Boolean)
      .join(" — ");
    image.replaceWith(
      parsed.createTextNode(
        description
          ? `[Image: ${description} — ${src}]`
          : `[Local image: ${src}]`,
      ),
    );
  });
  return sanitizeHTML(parsed.body.innerHTML);
}

// Tight Markdown lists and table cells do not contain <p> tags. Give their
// prose an explicit paragraph so its typography also survives saving/export.
function wrapInlineRuns(element: HTMLElement, parsed: Document) {
  let run: ChildNode[] = [];
  const flush = () => {
    if (run.some((node) => node.nodeType !== 3 || node.textContent?.trim())) {
      const paragraph = parsed.createElement("p");
      element.insertBefore(paragraph, run[0]);
      paragraph.append(...run);
    }
    run = [];
  };
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1 && blockTags.has((child as Element).tagName))
      flush();
    else run.push(child);
  }
  flush();
}

function styleMarkdown(parsed: Document) {
  parsed.querySelectorAll<HTMLElement>("li, th, td").forEach((element) => {
    wrapInlineRuns(element, parsed);
  });
  parsed
    .querySelectorAll<HTMLElement>(
      "p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, th, td",
    )
    .forEach((element) => {
      // Fenced and inline code keep the editor's monospace presentation. Do not
      // add textStyle marks or font attributes to their code nodes.
      if (element.closest("pre")) return;
      element.style.fontFamily = "Arial";
      element.style.fontSize = "11pt";
      element.style.lineHeight = "1.15";
      element.style.marginTop = "0pt";
      element.style.marginBottom =
        element.matches("li, th, td") || element.closest("li, th, td")
          ? "0pt"
          : "8pt";
      if (/^H[1-6]$/.test(element.tagName)) {
        const level = Number(element.tagName[1]);
        element.style.fontSize = `${headingSizes[level - 1]}pt`;
        element.style.fontWeight = "700";
        element.style.marginTop = level === 1 ? "16pt" : "12pt";
        element.style.marginBottom = level <= 2 ? "8pt" : "6pt";
      }
      // marked's GFM table alignment is an HTML attribute; the editor stores
      // alignment as a supported block style instead.
      const alignment = element.getAttribute("align");
      if (alignment && /^(left|center|right)$/.test(alignment))
        element.style.textAlign = alignment;
    });
}

/** Convert a local chapter file using the same safe rich-text schema as paste. */
export function parseChapterFile(
  fileName: string,
  text: string,
): ImportedChapter {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (!supportedExtensions.has(extension))
    throw new Error(
      "Choose a Markdown (.md or .markdown), HTML, or plain text chapter file.",
    );
  if (typeof text !== "string")
    throw new Error("The chapter file could not be read as text.");
  const source = text.replace(/^\uFEFF/, "");
  const parsed = new DOMParser().parseFromString(
    extension === "md" || extension === "markdown"
      ? chapterMarkdownHTML(source)
      : extension === "html" || extension === "htm"
        ? sanitizeHTML(source)
        : "",
    "text/html",
  );
  if (extension === "txt") {
    for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
      const paragraph = parsed.createElement("p");
      paragraph.textContent = line;
      parsed.body.append(paragraph);
    }
  } else if (extension === "md" || extension === "markdown") {
    styleMarkdown(parsed);
  }
  const heading = Array.from(parsed.querySelectorAll("h1"))
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
    .find(Boolean);
  const document = generateJSON(parsed.body.innerHTML, extensions());
  if (!validateDocument(document))
    throw new Error(
      "This chapter contains formatting that CodeBook cannot save.",
    );
  return { title: heading || fileTitle(fileName), document };
}
