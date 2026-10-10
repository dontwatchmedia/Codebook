// Clipboard HTML often describes its appearance through a site's CSS classes.
// Translate only recognizable document structures into our editable schema;
// never retain a site's scripts, interactive controls, or arbitrary layout CSS.
const proseSelector =
  '.markdown, .prose, [data-message-author-role="assistant"]';
const contentBlocks = new Set([
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
  "SECTION",
  "ARTICLE",
]);
const headingSizes = [22, 16, 14, 12, 11, 11];
const languageNames: Record<string, string> = {
  text: "plaintext",
  plaintext: "plaintext",
  "plain text": "plaintext",
  ini: "ini",
  cpp: "cpp",
  "c++": "cpp",
  c: "c",
  "c#": "csharp",
  csharp: "csharp",
  python: "python",
  py: "python",
  javascript: "javascript",
  js: "javascript",
  typescript: "typescript",
  ts: "typescript",
  rust: "rust",
  go: "go",
  java: "java",
  kotlin: "kotlin",
  swift: "swift",
  html: "xml",
  xml: "xml",
  css: "css",
  sql: "sql",
  bash: "bash",
  shell: "bash",
  powershell: "powershell",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  markdown: "markdown",
  md: "markdown",
  toml: "ini",
  diff: "diff",
};

export function wrapClipboardInlineRuns(
  element: HTMLElement,
  parsed: Document,
) {
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
    if (child.nodeType === 1 && contentBlocks.has((child as Element).tagName))
      flush();
    else run.push(child);
  }
  flush();
}

function codeLanguage(element: Element | null): string | undefined {
  return (
    element
      ?.getAttribute("class")
      ?.match(/(?:^|\s)(?:language-|lang-)([\w+#-]+)/)?.[1] ||
    element?.getAttribute("data-language") ||
    undefined
  );
}

function normalizeCode(parsed: Document) {
  for (const pre of parsed.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    let language = codeLanguage(code) || codeLanguage(pre);
    // ChatGPT's language label and Copy/Edit buttons are siblings of <pre>,
    // not part of the code. Find the smallest such wrapper before removing UI.
    let wrapper = pre.parentElement;
    for (
      let depth = 0;
      wrapper && wrapper !== parsed.body && depth < 3;
      depth++, wrapper = wrapper.parentElement
    ) {
      if (wrapper.querySelectorAll("pre").length !== 1) break;
      const controls = Array.from(
        wrapper.querySelectorAll<HTMLElement>('button, [role="button"]'),
      ).filter(
        (control) =>
          !pre.contains(control) &&
          /^(?:copy|edit|run|download|expand)\b/i.test(
            control.getAttribute("aria-label") ||
              control.textContent?.trim() ||
              "",
          ),
      );
      if (!controls.length) continue;
      const headers = new Set<Element>();
      for (const control of controls) {
        let branch: Element = control;
        while (branch.parentElement && branch.parentElement !== wrapper)
          branch = branch.parentElement;
        // A response-level Copy button is not a code header. Never search the
        // response's prose for a word such as "Go", "C", or "Markdown".
        if (branch !== control && !branch.contains(pre)) headers.add(branch);
      }
      for (const header of headers) {
        for (const label of header.querySelectorAll("span, div")) {
          if (label.children.length || label.closest("button, [role=button]"))
            continue;
          const name = label.textContent?.trim().toLowerCase() || "";
          if (Object.hasOwn(languageNames, name)) {
            language ||= languageNames[name];
            label.remove();
            break;
          }
        }
      }
      controls.forEach((control) => control.remove());
      break;
    }
    // Read code text without interpreting Markdown or changing indentation.
    // Use actual line breaks for <br> based clipboard code as well.
    const source = code || pre;
    source
      .querySelectorAll("button, input, select, textarea, [role=button]")
      .forEach((control) => control.remove());
    source
      .querySelectorAll("br")
      .forEach((br) => br.replaceWith(parsed.createTextNode("\n")));
    const fresh = parsed.createElement("code");
    if (language && /^[\w+#-]{1,64}$/.test(language)) {
      fresh.className = `language-${language.toLowerCase()}`;
    }
    fresh.textContent = source.textContent;
    pre.replaceChildren(fresh);
  }
}

function normalizeCitations(parsed: Document) {
  const citationSelector =
    '[data-citation], [data-citation-id], [data-testid*="citation"], [class*="citation"]';
  const citations = new Set<Element>(parsed.querySelectorAll(citationSelector));
  for (const anchor of parsed.querySelectorAll("a[data-state]")) {
    if (
      anchor.querySelector("img, svg") &&
      /^(?:open|closed)$/.test(anchor.getAttribute("data-state") || "")
    )
      citations.add(anchor);
  }
  for (const citation of citations) {
    citation
      .querySelectorAll('img, svg, button, [aria-hidden="true"]')
      .forEach((icon) => icon.remove());
    for (const badge of Array.from(
      citation.querySelectorAll("span, small, sup"),
    )) {
      if (
        !badge.children.length &&
        /^\+\d+$/.test(badge.textContent?.trim() || "")
      )
        badge.remove();
    }
    for (const anchor of citation.matches("a")
      ? [citation]
      : citation.querySelectorAll("a")) {
      if (anchor.textContent?.trim()) continue;
      const label =
        anchor.getAttribute("aria-label") || anchor.getAttribute("title");
      if (label) anchor.textContent = label;
      else {
        try {
          const url = new URL(anchor.getAttribute("href") || "");
          if (/^https?:$/.test(url.protocol)) anchor.textContent = url.hostname;
        } catch {
          /* An unsafe or incomplete link will be stripped later. */
        }
      }
    }
  }
}

function chatGPTImageURL(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "images.openai.com" &&
      !url.username &&
      !url.password &&
      /^\/static-rsc-\d+\/[^/]+/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

// Flattened Copy payloads retain lines and gallery links, but do not describe
// missing table columns or diagram nodes. Keep lines without guessing layout.
export function hasFlattenedCopyLinks(source: string): boolean {
  return (
    /https:\/\/images\.openai\.com\/static-rsc-\d+\//i.test(source) ||
    /https:\/\/(?:www\.)?google\.com\/s2\/favicons\?/i.test(source)
  );
}

function normalizeImageLinks(parsed: Document) {
  for (const anchor of parsed.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = anchor.getAttribute("href") || "";
    if (
      !chatGPTImageURL(href) ||
      anchor.querySelector("img") ||
      anchor.closest("pre, code, figcaption")
    )
      continue;
    const parent = anchor.parentElement;
    if (!parent) continue;
    const children = Array.from(parent.childNodes);
    const standalone = children.every(
      (node) =>
        node === anchor || (node.nodeType === 3 && !node.textContent?.trim()),
    );
    if (!parent.matches("p, div, body")) continue;
    const index = children.indexOf(anchor);
    const before = children.slice(0, index),
      after = children.slice(index + 1);
    const whitespace = (node: ChildNode) =>
      node.nodeType === 3 && !node.textContent?.trim();
    // A copied gallery can be several whole-link lines in a single paragraph.
    // Split only at actual <br> boundaries; a link inside prose stays a link.
    while (before.length && whitespace(before[before.length - 1])) before.pop();
    while (after.length && whitespace(after[0])) after.shift();
    const lineBreak = (node: ChildNode) =>
      node.nodeType === 1 && (node as Element).tagName === "BR";
    const wholeLine =
      parent.tagName === "P" &&
      (!before.length || lineBreak(before[before.length - 1])) &&
      (!after.length || lineBreak(after[0]));
    if (!standalone && !wholeLine) continue;
    if (before.length && lineBreak(before[before.length - 1])) before.pop();
    if (after.length && lineBreak(after[0])) after.shift();
    const previous =
      parent === parsed.body
        ? anchor.previousElementSibling
        : parent.previousElementSibling;
    // A saved image followed by its source caption is already complete.
    if (previous?.matches("img") && previous.getAttribute("src") === href)
      continue;
    const image = parsed.createElement("img");
    image.src = href;
    image.alt = anchor.textContent?.trim() || "Image";
    const caption = parsed.createElement("p");
    if (parent.hasAttribute("style"))
      caption.setAttribute("style", parent.getAttribute("style")!);
    if (parent === parsed.body) {
      anchor.replaceWith(image, caption);
      caption.append(anchor);
    } else {
      const surrounding = (contents: ChildNode[]) => {
        if (!contents.some((node) => !whitespace(node))) return [];
        const paragraph = parent.cloneNode(false) as HTMLElement;
        paragraph.append(...contents);
        return [paragraph];
      };
      const leading = surrounding(before),
        trailing = surrounding(after);
      caption.append(anchor);
      parent.replaceWith(...leading, image, caption, ...trailing);
    }
  }
}

function isCard(element: Element): boolean {
  if (!element.matches("div, section, article") || element.querySelector("pre"))
    return false;
  const classes = Array.from(element.classList);
  return (
    classes.some((name) => /^rounded(?:-|$)/.test(name)) &&
    classes.some((name) => /^border(?:-|$)/.test(name))
  );
}

function gridColumns(element: HTMLElement): number | null {
  const classColumns = Array.from(element.classList)
    .map((name) => name.match(/^(?:[\w-]+:)?grid-cols-([2-4])$/)?.[1])
    .find(Boolean);
  if (
    classColumns &&
    (element.classList.contains("grid") || element.style.display === "grid")
  )
    return Number(classColumns);
  if (element.style.display !== "grid") return null;
  const value = element.style.gridTemplateColumns.trim();
  const repeat = value.match(
    /^repeat\(\s*([2-4])\s*,\s*(?:minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)|1fr)\s*\)$/,
  );
  if (repeat) return Number(repeat[1]);
  const fractions = value.split(/\s+/);
  return fractions.length >= 2 &&
    fractions.length <= 4 &&
    fractions.every((part) => /^\d+(?:\.\d+)?fr$/.test(part))
    ? fractions.length
    : null;
}

function tableFromLayout(
  element: HTMLElement,
  children: Element[],
  columns: number,
  parsed: Document,
  narrowArrowCells = false,
) {
  const table = parsed.createElement("table");
  const body = parsed.createElement("tbody");
  table.append(body);
  for (let start = 0; start < children.length; start += columns) {
    const row = parsed.createElement("tr");
    body.append(row);
    for (let index = 0; index < columns; index++) {
      const cell = parsed.createElement("td");
      row.append(cell);
      const child = children[start + index];
      if (child) {
        if (
          narrowArrowCells &&
          /^[→⇒➜➝⟶←⇐↔⟷]$/.test(child.textContent?.trim() || "")
        )
          cell.setAttribute("colwidth", "32");
        // Keep document formatting, including explicit card background colors.
        if (child.hasAttribute("style"))
          cell.setAttribute("style", child.getAttribute("style")!);
        if (child.matches("div, section, article, span"))
          cell.append(...child.childNodes);
        else cell.append(child);
      }
      wrapClipboardInlineRuns(cell, parsed);
      if (!cell.children.length) cell.append(parsed.createElement("p"));
    }
  }
  element.replaceWith(table);
}

function normalizeLayouts(parsed: Document) {
  const layouts = Array.from(
    parsed.querySelectorAll<HTMLElement>("div, section, article"),
  );
  for (const element of layouts) {
    if (
      !element.isConnected ||
      element.closest("pre, table") ||
      !element.closest(proseSelector)
    )
      continue;
    const children = Array.from(element.children);
    if (children.length < 2 || children.length > 100) continue;
    // Do not drop prose between the layout's elements while interpreting cells.
    if (
      Array.from(element.childNodes).some(
        (node) => node.nodeType === 3 && node.textContent?.trim(),
      )
    )
      continue;
    const columns = gridColumns(element);
    if (
      columns &&
      children.every((child) => child.matches("div, section, article, aside"))
    ) {
      tableFromLayout(element, children, columns, parsed);
      continue;
    }
    const horizontal =
      (element.classList.contains("flex") &&
        !element.classList.contains("flex-col")) ||
      (element.style.display === "flex" &&
        element.style.flexDirection !== "column");
    const arrow = (child: Element) =>
      /^[→⇒➜➝⟶←⇐↔⟷]$/.test(child.textContent?.trim() || "");
    if (
      horizontal &&
      children.length <= 15 &&
      children.filter(isCard).length >= 2 &&
      children.some(arrow) &&
      children.every((child) => isCard(child) || arrow(child))
    ) {
      tableFromLayout(element, children, children.length, parsed, true);
    }
  }
  for (const element of layouts) {
    if (
      !element.isConnected ||
      !element.closest(proseSelector) ||
      element.closest("pre, table") ||
      !isCard(element)
    )
      continue;
    const aside = parsed.createElement("aside");
    aside.setAttribute("data-callout", "note");
    if (element.hasAttribute("style"))
      aside.setAttribute("style", element.getAttribute("style")!);
    aside.append(...element.childNodes);
    wrapClipboardInlineRuns(aside, parsed);
    element.replaceWith(aside);
  }
}

/** Runs on an inert DOM before sanitizing; its output is always sanitized. */
export function normalizeRichClipboard(parsed: Document): boolean {
  const recognizedProse = !!parsed.querySelector(proseSelector);
  normalizeCode(parsed);
  normalizeCitations(parsed);
  normalizeImageLinks(parsed);
  parsed
    .querySelectorAll<HTMLInputElement>('li input[type="checkbox"]')
    .forEach((input) => {
      input.replaceWith(
        parsed.createTextNode(input.hasAttribute("checked") ? "☑ " : "☐ "),
      );
    });
  parsed
    .querySelectorAll("button, input, select, textarea")
    .forEach((control) => control.remove());
  for (const element of parsed.querySelectorAll<HTMLElement>("[class]")) {
    if (!element.closest(proseSelector) || element.closest("pre, code"))
      continue;
    if (
      !element.style.fontWeight &&
      (element.classList.contains("font-bold") ||
        element.classList.contains("font-semibold"))
    )
      element.style.fontWeight = "700";
    if (!element.style.fontStyle && element.classList.contains("italic"))
      element.style.fontStyle = "italic";
  }
  normalizeLayouts(parsed);
  return recognizedProse;
}

/** Add schema paragraphs before propagating explicit cell/list formatting. */
export function prepareClipboardProse(parsed: Document) {
  parsed
    .querySelectorAll<HTMLElement>("li, th, td, aside")
    .forEach((element) => wrapClipboardInlineRuns(element, parsed));
}

/** Fill missing paste styles only after preserving source formatting. */
export function styleClipboardProse(parsed: Document) {
  parsed
    .querySelectorAll<HTMLElement>(
      "p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, th, td, aside",
    )
    .forEach((element) => {
      if (element.closest("pre")) return;
      const level = /^H[1-6]$/.test(element.tagName)
        ? Number(element.tagName[1])
        : 0;
      const fallback = (property: string, value: string) => {
        if (!element.style.getPropertyValue(property))
          element.style.setProperty(property, value);
      };
      fallback("font-family", "Arial");
      // An explicit relative source size on a wrapper must not be overridden by
      // an absolute default on its descendants (or promoted and multiplied).
      let parent = element.parentElement;
      let inheritedSize = false;
      while (parent && parent !== parsed.body) {
        if (
          parent.style.fontSize &&
          !/^\d+(?:\.\d+)?(?:px|pt)$/.test(parent.style.fontSize)
        ) {
          inheritedSize = true;
          break;
        }
        parent = parent.parentElement;
      }
      if (!inheritedSize || element.style.fontSize)
        fallback("font-size", `${level ? headingSizes[level - 1] : 11}pt`);
      fallback("line-height", "1.15");
      fallback("margin-top", level ? (level === 1 ? "16pt" : "12pt") : "0pt");
      fallback(
        "margin-bottom",
        level
          ? level <= 2
            ? "8pt"
            : "6pt"
          : element.closest("li, th, td")
            ? "0pt"
            : "8pt",
      );
      if (level) fallback("font-weight", "700");
      const align = element.getAttribute("align");
      if (align && /^(?:left|center|right)$/.test(align))
        fallback("text-align", align);
    });
}
