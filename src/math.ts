import katex from "katex";

export const MAX_MATH_SOURCE = 8192;
export function validMathSource(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= MAX_MATH_SOURCE
  );
}
export function mathSource(node: {
  type?: string;
  attrs?: Record<string, unknown>;
}): string {
  const source = typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
  return node.type === "blockMath" ? `$$\n${source}\n$$` : `\\(${source}\\)`;
}
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const rendered = new Map<string, string>();
/** Store source, never supplied HTML; only this trusted renderer creates math markup. */
export function renderMath(latex: string, display: boolean): string {
  const key = `${display ? "1" : "0"}:${latex}`;
  const previous = rendered.get(key);
  if (previous !== undefined) return previous;
  let html: string;
  try {
    if (!validMathSource(latex)) throw new Error("Invalid equation length");
    html = katex.renderToString(latex, {
      displayMode: display,
      output: "htmlAndMathml",
      throwOnError: true,
      trust: false,
      strict: "ignore",
      maxExpand: 500,
      maxSize: 20,
    });
    if (html.length > 262144) throw new Error("Equation rendering too large");
  } catch {
    html = `<span class="math-fallback" title="Equation source; edit to correct unsupported notation">${escape(latex)}</span>`;
  }
  // Each entry is bounded above, and documents often repeat the same equation.
  if (rendered.size >= 32) rendered.delete(rendered.keys().next().value!);
  rendered.set(key, html);
  return html;
}
export function mathHTML(
  latex: string,
  display: boolean,
  rendered = true,
): string {
  const tag = display ? "div" : "span";
  return `<${tag} data-codebook-math="${display ? "block" : "inline"}" data-latex="${escape(latex)}" class="${display ? "math-block" : "math-inline"}">${rendered ? renderMath(latex, display) : ""}</${tag}>`;
}
interface MathRange {
  from: number;
  to: number;
  latex: string;
  display: boolean;
}
const escapedAt = (text: string, index: number) => {
  let slashes = 0;
  while (index > 0 && text[--index] === "\\") slashes++;
  return slashes % 2 === 1;
};
function mathAt(text: string, index: number): MathRange | null {
  if (escapedAt(text, index)) return null;
  const opener = text.startsWith("\\[", index)
    ? "\\["
    : text.startsWith("\\(", index)
      ? "\\("
      : text.startsWith("$$", index)
        ? "$$"
        : text[index] === "$"
          ? "$"
          : "";
  if (!opener) return null;
  const closer = opener === "\\[" ? "\\]" : opener === "\\(" ? "\\)" : opener;
  const start = index + opener.length;
  const limit = Math.min(text.length, start + MAX_MATH_SOURCE + closer.length);
  const tail = text.slice(start, limit);
  const findClosing = (from: number) => {
    const found = tail.indexOf(closer, from - start);
    return found < 0 ? -1 : start + found;
  };
  let end = findClosing(start);
  while (end >= 0 && end - start <= MAX_MATH_SOURCE && escapedAt(text, end))
    end = findClosing(end + closer.length);
  if (end < 0 || end - start > MAX_MATH_SOURCE) return null;
  const latex = text.slice(start, end);
  if (!validMathSource(latex)) return null;
  if (
    opener === "$" &&
    (/^\s|\s$|\n|[`$]/.test(latex) ||
      /^\d[\d,.]*(?:\s|[;:]|$)/.test(latex) ||
      !/[A-Za-z\\=^_+*/<>]/.test(latex) ||
      /\d/.test(text[end + 1] || "") ||
      text[index - 1] === "$" ||
      text[end + 1] === "$")
  )
    return null;
  return {
    from: index,
    to: end + closer.length,
    latex,
    display: opener === "\\[" || opener === "$$",
  };
}
function ranges(text: string): MathRange[] {
  const found: MathRange[] = [];
  for (let index = 0; index < text.length; index++) {
    const range = mathAt(text, index);
    if (range) {
      found.push(range);
      index = range.to - 1;
    }
  }
  return found;
}
/** Protect delimiters/backslashes from Markdown parsing without interpreting code. */
export function protectMarkdownMath(source: string): {
  source: string;
  restore: (html: string) => string;
} {
  let prefix = "CODEBOOKMATHPLACEHOLDER";
  while (source.includes(prefix)) prefix += "X";
  const values: string[] = [];
  let output = "";
  for (let index = 0; index < source.length;) {
    const rest = source.slice(index);
    if (
      (index === 0 || source[index - 1] === "\n") &&
      /^(?: {4}|\t)/.test(rest)
    ) {
      const end = rest.indexOf("\n");
      const length = end < 0 ? rest.length : end + 1;
      output += rest.slice(0, length);
      index += length;
      continue;
    }
    const fence =
      (index === 0 || source[index - 1] === "\n") &&
      rest.match(/^(?: {0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/);
    if (fence) {
      const closing = new RegExp(
        `^ {0,3}${fence[1][0]}{${fence[1].length},}[^\\S\\n]*(?:\\n|$)`,
        "m",
      ).exec(rest.slice(fence[0].length));
      const length = closing
        ? fence[0].length + closing.index + closing[0].length
        : rest.length;
      output += rest.slice(0, length);
      index += length;
      continue;
    }
    const htmlCode = rest.match(/^<(pre|code)\b[^>]*>/i);
    if (htmlCode) {
      const end = new RegExp(`</${htmlCode[1]}\\s*>`, "i").exec(rest);
      const length = end ? end.index + end[0].length : rest.length;
      output += rest.slice(0, length);
      index += length;
      continue;
    }
    if (source[index] === "`" && !escapedAt(source, index)) {
      const ticks = rest.match(/^`+/)![0];
      const end = source.indexOf(ticks, index + ticks.length);
      if (end >= 0) {
        output += source.slice(index, end + ticks.length);
        index = end + ticks.length;
        continue;
      }
    }
    // Markdown removes escapes before the HTML normalizer runs. Protect these
    // literal delimiters so an explicitly escaped dollar/backslash stays text.
    if (source[index] === "\\" && /[$\\]/.test(source[index + 1] || "")) {
      const token = `${prefix}${values.length}END`;
      values.push(
        `<span data-codebook-math-literal="true">${escape(source[index + 1])}</span>`,
      );
      output += token;
      index += 2;
      continue;
    }
    const math = mathAt(source, index);
    if (math) {
      const token = `${prefix}${values.length}END`;
      // Marked strips quote markers outside opaque math but cannot see the
      // markers inside a protected multiline equation. Remove only the same
      // quote depth as its opening line, keeping LaTeX comparison operators.
      const lineStart = source.lastIndexOf("\n", index - 1) + 1;
      const quotePrefix = source
        .slice(lineStart, index)
        .match(/^ {0,3}(?:>[ \t]*)+/)?.[0];
      const depth = quotePrefix?.match(/>/g)?.length || 0;
      const quote = new RegExp(`^ {0,3}(?:>[ \\t]?){${depth}}`);
      const latex =
        depth && math.display
          ? math.latex
              .split("\n")
              .map((line, position) =>
                position ? line.replace(quote, "") : line,
              )
              .join("\n")
          : math.latex;
      // An inline placeholder is valid even inside a list/quote paragraph.
      // normalizeMathHTML later lifts the display node without losing those
      // containers or adding blank paragraphs around it.
      const html = mathHTML(latex, math.display, false);
      values.push(
        math.display
          ? html.replace(/^<div/, "<span").replace(/<\/div>$/, "</span>")
          : html,
      );
      output += token;
      index = math.to;
    } else output += source[index++];
  }
  return {
    source: output,
    restore: (html) =>
      html
        .replace(
          new RegExp(`<p>(${prefix}\\d+END)</p>`, "g"),
          (paragraph, token: string) => {
            const index = Number(token.slice(prefix.length, -3));
            return values[index]?.startsWith("<div")
              ? values[index]
              : paragraph;
          },
        )
        .replace(
          new RegExp(`${prefix}(\\d+)END`, "g"),
          (token, index: string) => values[Number(index)] ?? token,
        ),
  };
}
const excluded =
  "pre,code,script,style,button,textarea,input,select,[data-codebook-math],[data-codebook-math-literal]";
function marker(doc: Document, source: string, display: boolean): HTMLElement {
  const element = doc.createElement(display ? "div" : "span");
  element.dataset.codebookMath = display ? "block" : "inline";
  element.dataset.latex = source;
  return element;
}
/** Recover source before sanitizing ChatGPT/KaTeX HTML; never trust its renderer DOM. */
export function normalizeMathHTML(parsed: Document): void {
  const candidates = parsed.querySelectorAll<HTMLElement>(
    "[data-math],.katex,math",
  );
  for (const candidate of candidates) {
    if (!parsed.body.contains(candidate) || candidate.closest(excluded))
      continue;
    const annotation = candidate.querySelector(
      'annotation[encoding="application/x-tex"]',
    );
    const source =
      candidate.getAttribute("data-math") || annotation?.textContent;
    const outer = candidate.closest<HTMLElement>(".katex-display") || candidate;
    const display =
      outer.classList.contains("katex-display") ||
      candidate.getAttribute("display") === "block" ||
      candidate.getAttribute("data-math-display") === "true" ||
      outer.tagName === "DIV";
    if (typeof source === "string" && source.length > MAX_MATH_SOURCE) {
      const literal = parsed.createElement("span");
      literal.dataset.codebookMathLiteral = "true";
      literal.textContent = display ? `\\[${source}\\]` : `\\(${source}\\)`;
      outer.replaceWith(literal);
      continue;
    }
    if (!validMathSource(source)) continue;
    outer.replaceWith(marker(parsed, source, display));
  }
  // Adjacent styled runs still form one equation. Never join across a block,
  // code span, existing equation, image, or explicit line break.
  const groups: Text[][] = [];
  let current: Text[] = [],
    parent: Element | null = null;
  const walk = (element: Element) => {
    if (element.matches(excluded)) {
      current = [];
      parent = null;
      return;
    }
    for (const child of element.childNodes) {
      if (child.nodeType === 3) {
        const block =
          element.closest("p,h1,h2,h3,h4,h5,h6,li,div,td,th,blockquote") ||
          parsed.body;
        if (parent !== block || !current.length) {
          current = [];
          groups.push(current);
          parent = block;
        }
        current.push(child as Text);
      } else if (child.nodeType === 1) {
        if (["BR", "IMG", "HR"].includes((child as Element).tagName)) {
          current = [];
          parent = null;
        } else walk(child as Element);
      }
    }
  };
  walk(parsed.body);
  for (const nodes of groups) {
    const text = nodes.map((node) => node.data).join("");
    const locate = (offset: number, end: boolean): [Text, number] => {
      for (const node of nodes) {
        if (offset < node.length || (end && offset === node.length))
          return [node, offset];
        offset -= node.length;
      }
      return [nodes[nodes.length - 1], nodes[nodes.length - 1].length];
    };
    for (const math of ranges(text).reverse()) {
      const [start, from] = locate(math.from, false),
        [end, to] = locate(math.to, true);
      const range = parsed.createRange();
      range.setStart(start, from);
      range.setEnd(end, to);
      range.deleteContents();
      range.insertNode(marker(parsed, math.latex, math.display));
    }
  }
  // Display math is a real block; split a surrounding paragraph rather than
  // allowing the HTML parser to discard text around an invalid nested div.
  for (const math of parsed.querySelectorAll<HTMLElement>(
    '[data-codebook-math="block"]',
  )) {
    const paragraph = math.closest("p,h1,h2,h3,h4,h5,h6");
    if (!paragraph) {
      if (math.tagName !== "DIV")
        math.replaceWith(marker(parsed, math.dataset.latex || "", true));
      continue;
    }
    const range = parsed.createRange();
    range.setStartAfter(math);
    range.setEnd(paragraph, paragraph.childNodes.length);
    const tail = paragraph.cloneNode(false) as Element;
    tail.append(range.extractContents());
    math.remove();
    const meaningful = (element: Element) =>
      !!element.textContent?.trim() ||
      !!element.querySelector("img,[data-codebook-math]");
    const replacement: Node[] = [
      marker(parsed, math.dataset.latex || "", true),
    ];
    if (meaningful(paragraph)) replacement.unshift(paragraph.cloneNode(true));
    if (meaningful(tail)) replacement.push(tail);
    paragraph.replaceWith(...replacement);
  }
}
