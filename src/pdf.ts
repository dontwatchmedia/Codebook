import type { JSONContent } from "@tiptap/core";
import {
  ancestors,
  outlineEntries,
  type Book,
  type OutlineIndex,
} from "./model";
import { blockStyleCSS } from "./formatting";
import { highlightedCode, toHTML } from "./export";
import { generateNativePDF, saveNativePDF } from "./pdfNative";

export interface PDFOptions {
  paper: "letter" | "a4";
  includeTitle: boolean;
  startChaptersOnNewPage: boolean;
  pageNumbers: boolean;
  compactSpacing: boolean;
}
export const DEFAULT_PDF_OPTIONS: Readonly<PDFOptions> = {
  paper: "letter",
  includeTitle: true,
  startChaptersOnNewPage: false,
  pageNumbers: true,
  compactSpacing: true,
};
export const PDF_MARGIN_INCHES = 0.55;
const settingsKey = "codebook.pdfOptions";
export function normalizePDFOptions(
  value: Partial<PDFOptions> = {},
): PDFOptions {
  return {
    paper: value.paper === "a4" ? "a4" : "letter",
    includeTitle:
      typeof value.includeTitle === "boolean" ? value.includeTitle : true,
    startChaptersOnNewPage: value.startChaptersOnNewPage === true,
    pageNumbers:
      typeof value.pageNumbers === "boolean" ? value.pageNumbers : true,
    compactSpacing:
      typeof value.compactSpacing === "boolean" ? value.compactSpacing : true,
  };
}
export function readPDFOptions(): PDFOptions {
  try {
    return normalizePDFOptions(
      JSON.parse(localStorage.getItem(settingsKey) || "{}"),
    );
  } catch {
    return normalizePDFOptions();
  }
}
export function savePDFOptions(options: PDFOptions): void {
  localStorage.setItem(
    settingsKey,
    JSON.stringify(normalizePDFOptions(options)),
  );
}
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const safeURL = (value: unknown): string =>
  typeof value === "string" &&
  /^(https?:|data:image\/(png|jpeg|gif|webp);base64,)/i.test(value)
    ? value
    : "";
const styleAttribute = (value: string) =>
  value ? ` style="${escape(value)}"` : "";
const textOf = (node: JSONContent): string =>
  node.type === "hardBreak"
    ? "\n"
    : node.text || (node.content || []).map(textOf).join("");
const titleKey = (value: string) =>
  value.trim().replace(/\s+/g, " ").normalize("NFKC").toLocaleLowerCase();
const boundedInteger = (value: unknown, max: number): number =>
  Math.min(max, Math.max(1, Math.floor(Number(value) || 1)));

function printBlockStyle(node: JSONContent, options: PDFOptions): string {
  const attrs = { ...node.attrs };
  if (
    options.compactSpacing &&
    ["paragraph", "heading", "bulletList", "orderedList", "listItem"].includes(
      node.type || "",
    )
  ) {
    const top =
      node.type === "heading"
        ? 16
        : ["bulletList", "orderedList"].includes(node.type || "")
          ? 8
          : 0;
    const bottom = node.type === "listItem" ? 2 : 8;
    attrs.marginTop = `${Math.min(16, Math.max(0, points(attrs.marginTop, top * 0.75) / 0.75))}px`;
    attrs.marginBottom = `${Math.min(10, Math.max(0, points(attrs.marginBottom, bottom * 0.75) / 0.75))}px`;
  }
  return blockStyleCSS(attrs);
}
/** Keep multiline tokens intact while giving every printed line balanced markup. */
function highlightedLines(source: string, language: string): string[] {
  const highlighted = highlightedCode(source, language);
  const openSpans: string[] = [];
  const lines: string[] = [];
  let line = "";
  let offset = 0;
  for (const match of highlighted.matchAll(/<span\b[^>]*>|<\/span>|\n/g)) {
    line += highlighted.slice(offset, match.index);
    const token = match[0];
    if (token === "\n") {
      lines.push(line + "</span>".repeat(openSpans.length));
      line = openSpans.join("");
    } else {
      line += token;
      if (token === "</span>") openSpans.pop();
      else openSpans.push(token);
    }
    offset = match.index + token.length;
  }
  lines.push(line + highlighted.slice(offset));
  return lines;
}
/** Print HTML preserves source font sizes; outline depth never changes body typography. */
export function pdfNodeHTML(
  node: JSONContent,
  input: Partial<PDFOptions> = {},
): string {
  return renderPDFNode(node, normalizePDFOptions(input));
}
function renderPDFNode(node: JSONContent, options: PDFOptions): string {
  const children = () =>
    (node.content || []).map((child) => renderPDFNode(child, options)).join("");
  const style = printBlockStyle(node, options);
  if (node.type === "text") return toHTML(node);
  if (node.type === "codeBlock") {
    const language = String(node.attrs?.language || "plaintext");
    const raw = textOf(node);
    const numbered = node.attrs?.showLineNumbers === true;
    const code = numbered
      ? highlightedLines(raw, language)
          .map(
            (line, index) =>
              `<span class="pdf-code-line"><span class="pdf-line-number" aria-hidden="true">${index + 1}</span><span class="pdf-line-source">${line || "&#8203;"}</span></span>`,
          )
          .join("")
      : highlightedCode(raw, language);
    return `<figure class="pdf-code">${node.attrs?.filename ? `<figcaption class="pdf-code-filename">${escape(String(node.attrs.filename))}</figcaption>` : ""}<pre${styleAttribute(style)}><code class="language-${escape(language)}${numbered ? " pdf-numbered-code" : ""}">${code}</code></pre>${node.attrs?.caption ? `<figcaption class="pdf-code-caption">${escape(String(node.attrs.caption))}</figcaption>` : ""}</figure>`;
  }
  if (node.type === "table") {
    const rows = node.content || [];
    // Tiptap stores each column's width on its cell, including merged cells.
    const widths: number[] = [];
    for (const cell of rows[0]?.content || []) {
      const count = boundedInteger(cell.attrs?.colspan, 100);
      for (let index = 0; index < count; index++) {
        const width = Number(cell.attrs?.colwidth?.[index]);
        widths.push(
          Number.isFinite(width) && width > 0 ? Math.min(width, 10000) : 0,
        );
      }
    }
    const total = widths.reduce((sum, width) => sum + width, 0);
    const columns =
      total && widths.every(Boolean)
        ? `<colgroup>${widths.map((width) => `<col style="width:${((width / total) * 100).toFixed(3)}%">`).join("")}</colgroup>`
        : "";
    const header = rows[0]?.content?.every(
      (cell) =>
        cell.type === "tableHeader" &&
        boundedInteger(cell.attrs?.rowspan, 100) === 1,
    );
    return `<table${styleAttribute(style)}>${columns}${header ? `<thead>${renderPDFNode(rows[0], options)}</thead>` : ""}<tbody>${rows
      .slice(header ? 1 : 0)
      .map((row) => renderPDFNode(row, options))
      .join("")}</tbody></table>`;
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    const tag = node.type === "tableHeader" ? "th" : "td";
    return `<${tag} colspan="${boundedInteger(node.attrs?.colspan, 100)}" rowspan="${boundedInteger(node.attrs?.rowspan, 100)}"${styleAttribute(style)}>${children()}</${tag}>`;
  }
  if (node.type === "image") {
    const src = safeURL(node.attrs?.src);
    if (!src) return "";
    const width = Number(node.attrs?.width);
    const height = Number(node.attrs?.height);
    return `<img src="${escape(src)}" alt="${escape(String(node.attrs?.alt || ""))}"${node.attrs?.title ? ` title="${escape(String(node.attrs.title))}"` : ""}${Number.isFinite(width) && width > 0 ? ` width="${Math.min(width, 10000)}"` : ""}${Number.isFinite(height) && height > 0 ? ` height="${Math.min(height, 10000)}"` : ""}>`;
  }
  if (node.type === "hardBreak") return "<br>";
  if (node.type === "horizontalRule") return "<hr>";
  if (
    node.type === "paragraph" &&
    !textOf(node).trim() &&
    !(node.content || []).some((child) => child.type === "image")
  )
    return `<p class="pdf-empty-paragraph"${styleAttribute(style)}>${children()}</p>`;
  if (node.type === "heading") {
    const level = boundedInteger(node.attrs?.level, 6);
    return `<h${level}${styleAttribute(style)}>${children()}</h${level}>`;
  }
  if (node.type === "orderedList")
    return `<ol start="${boundedInteger(node.attrs?.start, 1000000)}"${styleAttribute(style)}>${children()}</ol>`;
  if (node.type === "callout")
    return `<aside data-callout="${escape(String(node.attrs?.kind || "note"))}"${styleAttribute(style)}>${children()}</aside>`;
  const tag = (
    {
      paragraph: "p",
      bulletList: "ul",
      listItem: "li",
      blockquote: "blockquote",
      tableRow: "tr",
    } as Record<string, string>
  )[node.type || ""];
  return tag
    ? `<${tag}${styleAttribute(style)}>${children()}</${tag}>`
    : children();
}

export function exportPDFHTML(
  book: Book,
  input: Partial<PDFOptions> = {},
): string {
  const options = normalizePDFOptions(input);
  const entries = outlineEntries(book);
  const firstNode = entries[0]?.node;
  const initialContent =
    firstNode?.type === "chapter" ? firstNode.document.content || [] : [];
  const initialHeadingIndex = initialContent.findIndex(
    (child) => child.type !== "paragraph" || textOf(child).trim(),
  );
  const initialHeading = initialContent[initialHeadingIndex];
  const useSourceProjectTitle =
    options.includeTitle &&
    initialHeading?.type === "heading" &&
    titleKey(textOf(initialHeading)) === titleKey(book.title);
  const metadata = `${book.subtitle ? `<p>${escape(book.subtitle)}</p>` : ""}${book.author ? `<p class="pdf-author">${escape(book.author)}</p>` : ""}`;
  const body = entries
    .map(({ node, depth }, index) => {
      const breadcrumb = ancestors(book, node.id)
        .map((ancestor) => ancestor.title)
        .join(" / ");
      const content =
        node.type === "chapter" ? node.document.content || [] : [];
      const first = content.find(
        (child) => child.type !== "paragraph" || textOf(child).trim(),
      );
      const sameHeading =
        first?.type === "heading" &&
        titleKey(textOf(first)) === titleKey(node.title);
      const sameProject = titleKey(node.title) === titleKey(book.title);
      const heading =
        sameHeading || (index === 0 && sameProject && options.includeTitle)
          ? ""
          : `<h1 class="pdf-section-title">${escape(node.title)}</h1>`;
      const sourceTitleHere = index === 0 && useSourceProjectTitle;
      const document = content
        .map(
          (child, childIndex) =>
            renderPDFNode(child, options) +
            (sourceTitleHere && childIndex === initialHeadingIndex
              ? `${metadata ? `<div class="pdf-project-metadata">${metadata}</div>` : ""}${heading}`
              : ""),
        )
        .join("");
      return `<section id="${escape(node.id)}" data-outline-depth="${depth}" class="pdf-section${options.startChaptersOnNewPage && index > 0 ? " pdf-new-page" : ""}">${breadcrumb ? `<p class="pdf-breadcrumb">${escape(breadcrumb)}</p>` : ""}${sourceTitleHere ? "" : heading}${document}</section>`;
    })
    .join("\n");
  // Only the opening source heading can stand in for the project title.
  const header =
    options.includeTitle && !useSourceProjectTitle
      ? `<header class="pdf-project-title"><h1>${escape(book.title)}</h1>${metadata}</header>`
      : "";
  return `<!doctype html><html lang="${escape(book.language || "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(book.title)}</title><style>
@page{size:${options.paper === "a4" ? "A4" : "Letter"};margin:${PDF_MARGIN_INCHES}in;${options.pageNumbers ? "@bottom-center{content:counter(page);font:9pt Arial,sans-serif;color:#555}" : ""}}
*{box-sizing:border-box}html{color-scheme:light;background:white}body{margin:0;color:#111;background:#fff;font:11pt/1.15 Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-wrap:break-word}
h1,h2,h3,h4,h5,h6{font-family:Arial,Helvetica,sans-serif;font-weight:700;line-height:1.15;margin:14pt 0 6pt;break-after:avoid;orphans:2;widows:2}h1{font-size:22pt}h2{font-size:16pt}h3{font-size:14pt}h4{font-size:12pt}h5,h6{font-size:11pt}p{margin:0 0 8pt;orphans:2;widows:2}a{color:#1751a4;text-decoration:underline}strong,b{font-weight:700}em,i{font-style:italic}
.pdf-project-title{margin:0 0 18pt;border-bottom:1px solid #ddd;padding:0 0 9pt}.pdf-project-title h1{margin-top:0}.pdf-project-title p,.pdf-project-metadata p{margin-bottom:4pt}.pdf-project-metadata{margin-bottom:12pt}.pdf-author{font-size:10pt;color:#444}.pdf-section{margin:0 0 16pt}.pdf-section-title{font-size:20pt}.pdf-breadcrumb{font-size:9pt;color:#555;margin:10pt 0 4pt;break-after:avoid}.pdf-new-page{break-before:page}.pdf-section>h1:first-child{margin-top:0}
ul,ol{padding-left:22pt;margin:0 0 8pt}li{margin:0 0 2pt}li p{margin-bottom:2pt}hr{border:0;border-top:1px solid #bbb;margin:8pt 0}blockquote,aside{border-left:2pt solid #7895ae;padding:5pt 10pt;margin:8pt 0;background:#f4f6f8}blockquote p:last-child,aside p:last-child{margin-bottom:0}
.pdf-empty-paragraph{min-height:1.15em}.pdf-compact .pdf-empty-paragraph{height:12px;min-height:12px;line-height:12px!important;margin:0!important}.pdf-compact li,.pdf-compact li>p{margin-bottom:0!important}.pdf-compact li+li>p:first-child{margin-top:0!important}.pdf-compact hr{margin:8px 0}
table{width:100%;border-collapse:collapse;table-layout:fixed;margin:8pt 0;break-inside:auto}thead{display:table-header-group}tr{break-inside:avoid}td,th{border:1px solid #aab2bc;padding:5pt;vertical-align:top;text-align:left;overflow-wrap:anywhere}th{background:#edf1f6}td p,th p{margin:0 0 3pt}td p:last-child,th p:last-child{margin:0}img{max-width:100%;max-height:${options.paper === "a4" ? "9.9in" : "9.2in"};height:auto;object-fit:contain;display:block;margin:8pt 0;break-inside:avoid}
.pdf-code{margin:8pt 0;break-inside:auto}.pdf-code-filename{font:9pt/1.3 Consolas,'Courier New',monospace;background:#edf1f6;border:1px solid #c5cbd3;border-bottom:0;padding:5pt 7pt;break-after:avoid}.pdf-code pre{font:9pt/1.35 Consolas,'Courier New',monospace;border:1px solid #c5cbd3;background:#f5f7fa;margin:0;padding:7pt;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4;break-inside:auto}.pdf-code code{font:inherit}.pdf-code-caption{font:9pt/1.3 Arial,sans-serif;color:#444;margin:4pt 0;break-before:avoid}.pdf-code-line{display:flex;break-inside:avoid;min-width:0}.pdf-line-number{user-select:none;color:#6c7480;text-align:right;flex:0 0 3ch;margin-right:1.5ch}.pdf-line-source{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;flex:1}p code,li code,td code{font:0.92em Consolas,'Courier New',monospace;background:#eef1f5;padding:1pt 2pt}.hljs-keyword,.hljs-selector-tag{color:#794d91}.hljs-string{color:#2f703c}.hljs-number,.hljs-literal{color:#a34c1e}.hljs-title,.hljs-type,.hljs-built_in{color:#185c94}.hljs-comment{color:#596370;font-style:italic}
@media screen{body{width:${options.paper === "a4" ? "210mm" : "8.5in"};min-height:${options.paper === "a4" ? "297mm" : "11in"};padding:${PDF_MARGIN_INCHES}in;margin:16px auto;box-shadow:0 1px 8px #0002}.pdf-new-page{border-top:1px dashed #ccc;padding-top:12pt}}
@media print{body{zoom:1!important}}
</style></head><body${options.compactSpacing ? ' class="pdf-compact"' : ""}>${header}${body}</body></html>`;
}

function points(value: unknown, fallback: number): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return fallback;
  const match = value.match(/^([\d.]+)(pt|px|in|cm|mm)?$/);
  if (!match) return fallback;
  const scale =
    { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }[
      match[2] || "pt"
    ] || 1;
  return Number(match[1]) * scale;
}
/** A quick layout estimate; only a generated PDF can provide an exact page count. */
export function estimatePDFPages(
  book: Book,
  input: Partial<PDFOptions> = {},
): number {
  return measurePDFPages(book, input);
}
const estimateHeights = new WeakMap<
  JSONContent,
  { key: string; height: number }
>();
/** For immutable editor snapshots; reuse unchanged paragraph/list/table estimates. */
export function cachedEstimatePDFPages(
  book: Book,
  input: Partial<PDFOptions> = {},
  index?: OutlineIndex,
): number {
  return measurePDFPages(book, input, estimateHeights, index);
}
function measurePDFPages(
  book: Book,
  input: Partial<PDFOptions>,
  cache?: WeakMap<JSONContent, { key: string; height: number }>,
  index?: OutlineIndex,
): number {
  const options = normalizePDFOptions(input);
  const pageWidth =
    (options.paper === "a4" ? 595.28 : 612) - PDF_MARGIN_INCHES * 144;
  const pageHeight =
    (options.paper === "a4" ? 841.89 : 792) - PDF_MARGIN_INCHES * 144;
  const optionsKey = `${pageHeight}/${options.compactSpacing}`;
  const height = (node: JSONContent, width = pageWidth): number => {
    const key = `${width}/${optionsKey}`;
    const previous = cache?.get(node);
    if (previous?.key === key) return previous.height;
    const result = calculateHeight(node, width);
    cache?.set(node, { key, height: result });
    return result;
  };
  const calculateHeight = (node: JSONContent, width: number): number => {
    if (node.type === "image")
      return (
        Math.min(pageHeight * 0.85, points(node.attrs?.height, width * 0.5)) +
        16
      );
    if (node.type === "horizontalRule") return 17;
    if (
      options.compactSpacing &&
      node.type === "paragraph" &&
      !textOf(node).trim()
    )
      return 9;
    if (node.type === "table")
      return (node.content || []).reduce(
        (sum, row) =>
          sum +
          Math.max(
            18,
            ...(row.content || []).map((cell) =>
              (cell.content || []).reduce(
                (total, child) =>
                  total +
                  height(
                    child,
                    width / Math.max(1, row.content?.length || 1) - 10,
                  ),
                10,
              ),
            ),
          ),
        16,
      );
    if (
      ["doc", "listItem", "tableCell", "tableHeader", "tableRow"].includes(
        node.type || "",
      )
    )
      return (node.content || []).reduce(
        (sum, child) => sum + height(child, width),
        0,
      );
    if (
      ["bulletList", "orderedList", "blockquote", "callout"].includes(
        node.type || "",
      )
    )
      return (node.content || []).reduce(
        (sum, child) => sum + height(child, width - 24),
        8,
      );
    const font = points(
      node.attrs?.fontSize,
      node.type === "heading"
        ? [22, 16, 14, 12, 11, 11][boundedInteger(node.attrs?.level, 6) - 1]
        : node.type === "codeBlock"
          ? 9
          : 11,
    );
    const lineHeight =
      typeof node.attrs?.lineHeight === "string" &&
      /^[\d.]+$/.test(node.attrs.lineHeight)
        ? Number(node.attrs.lineHeight)
        : 1.15;
    const capacity = Math.max(
      8,
      Math.floor(width / (font * (node.type === "codeBlock" ? 0.6 : 0.48))),
    );
    const lines = textOf(node)
      .split("\n")
      .reduce(
        (sum, line) => sum + Math.max(1, Math.ceil(line.length / capacity)),
        0,
      );
    return (
      lines * font * lineHeight +
      (options.compactSpacing
        ? Math.min(
            12,
            points(node.attrs?.marginTop, node.type === "heading" ? 12 : 0),
          )
        : points(node.attrs?.marginTop, node.type === "heading" ? 14 : 0)) +
      (options.compactSpacing
        ? Math.min(7.5, points(node.attrs?.marginBottom, 6))
        : points(node.attrs?.marginBottom, node.type === "heading" ? 6 : 8)) +
      (node.type === "codeBlock" ? 25 : 0)
    );
  };
  let used = options.includeTitle ? 65 : 0;
  let pages = 0;
  const entries = outlineEntries(book, index);
  entries.forEach(({ node }, index) => {
    if (index && options.startChaptersOnNewPage) {
      pages += Math.max(1, Math.ceil(used / pageHeight));
      used = 0;
    }
    used += 38 + (node.type === "chapter" ? height(node.document) : 0);
  });
  return Math.max(1, pages + Math.ceil(used / pageHeight));
}

export interface GeneratedPDF {
  bytes: Uint8Array;
  pageCount: number;
  options: PDFOptions;
}
let cachedPDF: { key: string; result: Promise<GeneratedPDF> } | undefined;
let generationQueue: Promise<unknown> = Promise.resolve();
export function generateBookPDF(
  book: Book,
  input: Partial<PDFOptions> = {},
): Promise<GeneratedPDF> {
  const options = normalizePDFOptions(input);
  // Content is part of the key: a caller can export unsaved editor changes safely.
  const key = JSON.stringify([book, options]);
  if (cachedPDF?.key === key) return cachedPDF.result;
  const result = generationQueue
    .catch(() => {})
    .then(async () => {
      const bytes = await generateNativePDF(
        exportPDFHTML(book, options),
        options.paper,
        PDF_MARGIN_INCHES,
      );
      const { PDFDocument } = await import("pdf-lib");
      const document = await PDFDocument.load(bytes);
      return { bytes, pageCount: document.getPageCount(), options };
    });
  generationQueue = result;
  cachedPDF = { key, result };
  void result.catch(() => {
    if (cachedPDF?.result === result) cachedPDF = undefined;
  });
  return result;
}
export function saveBookPDF(
  book: Book,
  result: GeneratedPDF,
): Promise<boolean> {
  const filename =
    (book.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim() || "CodeBook") +
    ".pdf";
  return saveNativePDF(filename, result.bytes);
}
