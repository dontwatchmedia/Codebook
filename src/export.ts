import type { JSONContent } from "@tiptap/core";
import { chapters, outlineEntries, type Book, type BookNode } from "./model";
import { lowlight } from "./editor/highlighting";
const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const safeURL = (s: string) =>
  /^(https?:|mailto:|#|data:image\/(png|jpeg|gif|webp);base64,)/i.test(s)
    ? s
    : "";
const mdEscape = (s: string) => s.replace(/([\\`*_[\]<>])/g, "\\$1");
function highlightedCode(content: string, language: string): string {
  if (!language || !lowlight.registered(language)) return escape(content);
  const render = (node: {
    type: string;
    value?: string;
    properties?: { className?: (string | number)[] };
    children?: unknown[];
  }): string =>
    node.type === "text"
      ? escape(node.value || "")
      : `<span class="${escape((node.properties?.className || []).join(" "))}">${(node.children || []).map((n) => render(n as Parameters<typeof render>[0])).join("")}</span>`;
  return lowlight
    .highlight(language, content)
    .children.map((n) => render(n as Parameters<typeof render>[0]))
    .join("");
}
export function toMarkdown(node: JSONContent, headingOffset = 0): string {
  const children = () =>
    (node.content ?? []).map((n) => toMarkdown(n, headingOffset)).join("");
  if (node.type === "text") {
    let s = mdEscape(node.text || "");
    if (node.marks?.some((m) => m.type === "code")) {
      const longest = Math.max(
        0,
        ...((node.text || "").match(/`+/g) || []).map((s) => s.length),
      );
      const fence = "`".repeat(longest + 1);
      s = `${fence} ${node.text} ${fence}`;
    }
    for (const m of node.marks || []) {
      if (m.type === "bold") s = `**${s}**`;
      if (m.type === "italic") s = `*${s}*`;
      if (m.type === "strike") s = `~~${s}~~`;
      if (m.type === "underline") s = `<u>${s}</u>`;
      if (m.type === "link")
        s = `[${s}](${safeURL(m.attrs?.href || "").replace(/\)/g, "%29")})`;
    }
    return s;
  }
  switch (node.type) {
    case "doc":
      return children().trim() + "\n";
    case "paragraph":
      return children() + "\n\n";
    case "heading": {
      const level = Math.max(
        1,
        (Number(node.attrs?.level) || 2) + headingOffset,
      );
      return level <= 6
        ? "#".repeat(level) + " " + children() + "\n\n"
        : `<div role="heading" aria-level="${level}">${(node.content || []).map((n) => toHTML(n)).join("")}</div>\n\n`;
    }
    case "hardBreak":
      return "  \n";
    case "horizontalRule":
      return "---\n\n";
    case "codeBlock": {
      const raw = (node.content || []).map((n) => n.text || "").join("");
      const fence = "`".repeat(
        Math.max(3, ...(raw.match(/`+/g) || []).map((s) => s.length + 1)),
      );
      return `${fence}${node.attrs?.language || ""}\n${raw}\n${fence}\n\n`;
    }
    case "blockquote":
      return (
        children()
          .trim()
          .split("\n")
          .map((l) => `> ${l}`)
          .join("\n") + "\n\n"
      );
    case "callout":
      return `<aside data-callout="${escape(node.attrs?.kind || "note")}">\n${(node.content || []).map((n) => toHTML(n, headingOffset)).join("")}\n</aside>\n\n`;
    case "bulletList":
    case "orderedList":
      return (
        (node.content || [])
          .map((n, i) => {
            const prefix =
              node.type === "bulletList"
                ? "- "
                : `${(node.attrs?.start || 1) + i}. `;
            const lines = toMarkdown(n, headingOffset).trim().split("\n");
            return (
              prefix +
              lines[0] +
              (lines.length > 1
                ? "\n" +
                  lines
                    .slice(1)
                    .map((l) => " ".repeat(prefix.length) + l)
                    .join("\n")
                : "")
            );
          })
          .join("\n") + "\n\n"
      );
    case "listItem":
      return children();
    case "image":
      return `![${mdEscape(node.attrs?.alt || "")}](${safeURL(node.attrs?.src || "")})\n\n`;
    case "table": {
      const rows = (node.content || []).map(
        (r) =>
          "| " +
          (r.content || [])
            .map((c) =>
              (c.content || [])
                .map((n) => toMarkdown(n, headingOffset))
                .join("")
                .trim()
                .replace(/\n/g, "<br>")
                .replace(/\|/g, "\\|"),
            )
            .join(" | ") +
          " |",
      );
      if (!rows.length) return "";
      rows.splice(
        1,
        0,
        "| " +
          (node.content?.[0].content || []).map(() => "---").join(" | ") +
          " |",
      );
      return rows.join("\n") + "\n\n";
    }
    default:
      return children();
  }
}
export function toHTML(node: JSONContent, headingOffset = 0): string {
  const c = () =>
    (node.content || []).map((n) => toHTML(n, headingOffset)).join("");
  if (node.type === "text") {
    let s = escape(node.text || "");
    for (const m of node.marks || []) {
      const tag = (
        {
          bold: "strong",
          italic: "em",
          underline: "u",
          strike: "s",
          code: "code",
        } as Record<string, string>
      )[m.type];
      if (tag) s = `<${tag}>${s}</${tag}>`;
      if (m.type === "link")
        s = `<a href="${escape(safeURL(m.attrs?.href || ""))}">${s}</a>`;
    }
    return s;
  }
  const tags: Record<string, string> = {
    paragraph: "p",
    bulletList: "ul",
    listItem: "li",
    blockquote: "blockquote",
    table: "table",
    tableRow: "tr",
    tableCell: "td",
    tableHeader: "th",
  };
  if (tags[node.type!]) {
    const tag = tags[node.type!];
    return `<${tag}>${c()}</${tag}>\n`;
  }
  switch (node.type) {
    case "heading": {
      const level = Math.max(
        1,
        (Number(node.attrs?.level) || 2) + headingOffset,
      );
      return level <= 6
        ? `<h${level}>${c()}</h${level}>\n`
        : `<div role="heading" aria-level="${level}">${c()}</div>\n`;
    }
    case "orderedList":
      return `<ol start="${Number(node.attrs?.start) || 1}">${c()}</ol>\n`;
    case "hardBreak":
      return "<br>";
    case "horizontalRule":
      return "<hr>\n";
    case "codeBlock":
      return `<pre data-filename="${escape(node.attrs?.filename || "")}" data-line-numbers="${!!node.attrs?.showLineNumbers}" data-caption="${escape(node.attrs?.caption || "")}"><code class="language-${escape(node.attrs?.language || "plaintext")}">${highlightedCode((node.content || []).map((n) => n.text || "").join(""), node.attrs?.language || "plaintext")}</code></pre>\n`;
    case "image":
      return `<img src="${escape(safeURL(node.attrs?.src || ""))}" alt="${escape(node.attrs?.alt || "")}">\n`;
    case "callout":
      return `<aside data-callout="${escape(node.attrs?.kind || "note")}">${c()}</aside>\n`;
    default:
      return c();
  }
}
export function exportMarkdown(book: Book) {
  if (book.mode === "bible" || hasNestedSections(book))
    return exportBibleMarkdown(book);
  return (
    `# ${mdEscape(book.title)}\n\n${book.subtitle ? mdEscape(book.subtitle) + "\n\n" : ""}${book.author ? "By " + mdEscape(book.author) + "\n\n" : ""}` +
    book.nodes
      .map((n) =>
        n.type === "part"
          ? `# ${mdEscape(n.title)}\n\n`
          : `# ${mdEscape(n.title)}\n\n${toMarkdown(n.document)}\n`,
      )
      .join("")
  );
}
export function exportHTML(book: Book) {
  if (book.mode === "bible" || hasNestedSections(book))
    return exportBibleHTML(book);
  return `<!doctype html>\n<html lang="${escape(book.language || "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(book.title)}</title><style>body{max-width:760px;margin:64px auto;padding:0 28px;font:18px/1.75 Georgia,serif;color:#252d28;background:#fff}h1,h2,h3{line-height:1.25}header{border-bottom:1px solid #ddd;padding-bottom:36px}nav{margin:40px 0}a{color:#2c6853}section{margin:60px 0;break-before:page}pre{background:#f1f4f2;padding:22px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dde4df;border-radius:6px;tab-size:4}code{font:0.85em/1.6 Consolas,monospace}p code{background:#eef2ef;padding:2px 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd5cf;padding:8px;text-align:left}img{max-width:100%}aside,blockquote{border-left:3px solid #62927e;padding:12px 24px;background:#f4f7f3}.hljs-keyword,.hljs-selector-tag{color:#8d4a78}.hljs-string{color:#467148}.hljs-number,.hljs-literal{color:#a3673e}.hljs-title,.hljs-type,.hljs-built_in{color:#326b91}.hljs-comment{color:#7c877a;font-style:italic}@media print{body{margin:0;font-size:11pt}nav{break-after:page}pre{break-inside:avoid}}</style></head><body><header><h1>${escape(book.title)}</h1><p>${escape(book.subtitle)}</p><p>${escape(book.author)}</p></header><nav aria-label="Contents"><h2>Contents</h2><ol>${chapters(
    book,
  )
    .map((c) => `<li><a href="#${escape(c.id)}">${escape(c.title)}</a></li>`)
    .join(
      "",
    )}</ol></nav>${book.nodes.map((n) => (n.type === "part" ? `<h1>${escape(n.title)}</h1>` : `<section id="${escape(n.id)}"><h1>${escape(n.title)}</h1>${toHTML(n.document)}</section>`)).join("\n")}</body></html>`;
}

const sectionIcons: Record<string, string> = {
  document: "📄",
  layers: "🗂️",
  gamepad: "🎮",
  globe: "🌍",
  users: "👥",
  leaf: "🌿",
  hammer: "🔨",
  code: "💻",
  lightbulb: "💡",
  flag: "🚩",
};
const progressLabels: Record<string, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  complete: "Complete",
  blocked: "Blocked",
  "on-hold": "On hold",
};
interface ExportSection {
  node: BookNode;
  depth: number;
  path: string;
}
function exportSections(book: Book): ExportSection[] {
  const sections: ExportSection[] = [];
  const counters: number[] = [];
  for (const { node, depth } of outlineEntries(book)) {
    counters.length = depth + 1;
    counters[depth] = (counters[depth] || 0) + 1;
    sections.push({
      node,
      depth,
      path: counters.join("."),
    });
  }
  return sections;
}
function hasNestedSections(book: Book): boolean {
  const sectionIds = new Set(chapters(book).map((node) => node.id));
  return chapters(book).some(
    (node) => node.parentId !== null && sectionIds.has(node.parentId),
  );
}
function sectionIcon(node: BookNode): string {
  return node.type === "chapter"
    ? sectionIcons[node.icon || "document"] || sectionIcons.document
    : sectionIcons.layers;
}
function sectionProgress(node: BookNode): string {
  return node.type === "chapter"
    ? progressLabels[node.progress || "not-started"] ||
        progressLabels["not-started"]
    : "";
}
function sectionLabel(entry: ExportSection): string {
  return `${entry.path} ${sectionIcon(entry.node)} ${entry.node.title}`;
}
function exportBibleMarkdown(book: Book): string {
  const entries = exportSections(book);
  const contents = entries
    .map((entry) => {
      const progress = sectionProgress(entry.node);
      return `${"  ".repeat(entry.depth)}- [${mdEscape(sectionLabel(entry))}](#${entry.node.id})${progress ? ` — ${progress}` : ""}\n`;
    })
    .join("");
  const body = entries
    .map((entry) => {
      const { node, depth } = entry;
      const level = depth + 2;
      const progress = sectionProgress(node);
      const label = sectionLabel(entry);
      const heading =
        level <= 6
          ? `${"#".repeat(level)} ${mdEscape(label)}\n\n`
          : `<div role="heading" aria-level="${level}">${escape(label)}</div>\n\n`;
      return `<a id="${escape(node.id)}"></a>\n\n${heading}${progress ? `**Status:** ${progress}\n\n` : ""}${node.type === "chapter" ? toMarkdown(node.document, level) + "\n" : ""}`;
    })
    .join("");
  return `# ${mdEscape(book.title)}\n\n${book.subtitle ? mdEscape(book.subtitle) + "\n\n" : ""}${book.author ? "By " + mdEscape(book.author) + "\n\n" : ""}## Contents\n\n${contents}\n${body}`;
}
function exportBibleHTML(book: Book): string {
  const entries = exportSections(book);
  const contents = ["<ol>"];
  const body: string[] = [];
  let previousDepth = 0;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (index > 0) {
      if (entry.depth > previousDepth) contents.push("<ol>");
      else {
        contents.push("</li>");
        for (let depth = previousDepth; depth > entry.depth; depth--)
          contents.push("</ol></li>");
      }
      for (let depth = previousDepth; depth >= entry.depth; depth--)
        body.push("</section>");
    }
    const progress = sectionProgress(entry.node);
    contents.push(
      `<li><a href="#${escape(entry.node.id)}">${escape(sectionLabel(entry))}</a>${progress ? ` <span class="progress">${escape(progress)}</span>` : ""}`,
    );
    const { node, depth } = entry;
    const level = depth + 2;
    const heading = Math.min(level, 6);
    body.push(
      `<section id="${escape(node.id)}" data-outline-path="${entry.path}" class="outline-section"><h${heading}${level > 6 ? ` role="heading" aria-level="${level}"` : ""}>${escape(sectionLabel(entry))}</h${heading}>${progress ? `<p class="section-progress">Status: ${escape(progress)}</p>` : ""}${node.type === "chapter" ? toHTML(node.document, level) : ""}`,
    );
    previousDepth = depth;
  }
  if (entries.length) {
    contents.push("</li>");
    for (let depth = previousDepth; depth > 0; depth--)
      contents.push("</ol></li>");
    for (let depth = previousDepth; depth >= 0; depth--)
      body.push("</section>");
  }
  contents.push("</ol>");
  return `<!doctype html>\n<html lang="${escape(book.language || "en")}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(book.title)}</title><style>body{max-width:900px;margin:48px auto;padding:0 28px;font:18px/1.7 system-ui,sans-serif;color:#252d28;background:#fff}h1,h2,h3,h4,h5,h6,[role=heading]{line-height:1.25}header{border-bottom:1px solid #ddd;padding-bottom:24px}nav{margin:32px 0}nav ol{padding-left:24px}nav>ol{list-style:none;padding-left:0}nav ol ol{list-style:none}a{color:#2c6853}.outline-section{margin:36px 0}.outline-section>.outline-section{border-left:1px solid #dde4df;padding-left:18px}.progress,.section-progress{font:0.8em/1.5 system-ui,sans-serif;color:#526258}.progress{margin-left:8px}[role=heading]{font-weight:bold;margin:1.2em 0 0.6em}pre{background:#f1f4f2;padding:22px;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #dde4df;border-radius:6px;tab-size:4}code{font:0.85em/1.6 Consolas,monospace}p code{background:#eef2ef;padding:2px 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd5cf;padding:8px;text-align:left}img{max-width:100%}aside,blockquote{border-left:3px solid #62927e;padding:12px 24px;background:#f4f7f3}.hljs-keyword,.hljs-selector-tag{color:#8d4a78}.hljs-string{color:#467148}.hljs-number,.hljs-literal{color:#a3673e}.hljs-title,.hljs-type,.hljs-built_in{color:#326b91}.hljs-comment{color:#7c877a;font-style:italic}@media print{body{margin:0;font-size:11pt}nav{break-after:page}pre{break-inside:avoid}.outline-section>.outline-section{padding-left:12px}}</style></head><body><header><h1>${escape(book.title)}</h1>${book.subtitle ? `<p>${escape(book.subtitle)}</p>` : ""}${book.author ? `<p>${escape(book.author)}</p>` : ""}</header><nav aria-label="Contents"><h2>Contents</h2>${contents.join("")}</nav>${body.join("\n")}</body></html>`;
}
