import { expect, test, type Locator, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import type { Book, Chapter } from "../../src/model";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1EAAAAASUVORK5CYII=";

const source = [
  "## Gameplay loops",
  "",
  "A **living world** with *seasonal choices* and `state` notes.",
  "",
  "- Tend the garden",
  "- Explore the coast",
  "",
  "1. Observe the season",
  "2. Choose a useful task",
  "",
  "| System | State |",
  "| --- | --- |",
  "| Weather | Ready |",
  "| Farming | In progress |",
  "",
  "```javascript",
  'const title = "**keep literal**";',
  "  // ## stays code",
  "```",
].join("\n");

function escapeHTML(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function literalHTML(text: string) {
  return text
    .split("\n")
    .map(
      (line) =>
        `<p style="font-family:Arial;font-size:11pt;line-height:1.15">${escapeHTML(line)}</p>`,
    )
    .join("");
}

async function createProject(
  page: Page,
  title: string,
  mode: "book" | "bible" = "book",
) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: mode === "book" ? "New book" : "New system bible",
      exact: true,
    })
    .click();
  await page
    .getByLabel(mode === "book" ? "Book title" : "Project title", {
      exact: true,
    })
    .fill(title);
  await page
    .getByRole("button", {
      name: mode === "book" ? "Create book" : "Create system bible",
      exact: true,
    })
    .click();
  return page.getByRole("textbox", {
    name: mode === "book" ? "Chapter manuscript" : "Section content",
    exact: true,
  });
}

async function pasteHTML(editor: Locator, html: string) {
  await editor.focus();
  await editor.press("Control+A");
  await editor.evaluate((element, content) => {
    const data = new DataTransfer();
    data.setData("text/html", content);
    data.setData("text/plain", "Literal Markdown copied as rich text");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, html);
}

async function storedDocument(page: Page, title: string) {
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    ) as Book[];
    const chapter = books
      .find((book) => book.title === wanted)
      ?.nodes.find(
        (node) => node.type === "chapter" && node.kind === "chapter",
      ) as Chapter | undefined;
    return chapter?.document;
  }, title);
}

async function savedDocument(page: Page, title: string): Promise<JSONContent> {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  const document = await storedDocument(page, title);
  expect(document).toBeDefined();
  return document!;
}

function nodeText(node: JSONContent): string {
  return node.text || node.content?.map(nodeText).join("") || "";
}

async function selectText(editor: Locator, text: string) {
  await editor.focus();
  await editor.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const index = node.textContent?.indexOf(wanted) ?? -1;
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + wanted.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return;
    }
    throw new Error(`The editor does not contain ${wanted}`);
  }, text);
}

async function selectParagraphs(
  editor: Locator,
  firstText: string,
  lastText: string,
) {
  await editor.focus();
  await editor.evaluate(
    (element, wanted) => {
      const paragraphs = Array.from(element.querySelectorAll("p"));
      const first = paragraphs.find(
        (paragraph) => paragraph.textContent === wanted.firstText,
      );
      const last = paragraphs.find(
        (paragraph) => paragraph.textContent === wanted.lastText,
      );
      if (!first?.firstChild || !last?.lastChild)
        throw new Error("The selected Markdown paragraphs are missing");
      const range = document.createRange();
      range.setStart(first.firstChild, 0);
      range.setEnd(last.lastChild, last.lastChild.textContent!.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    },
    { firstText, lastText },
  );
}

test("HTML-pasted literal Markdown formats the entire chapter using Google typography and survives one undo, redo, and reload", async ({
  page,
}) => {
  const title = "Format pasted Markdown";
  const editor = await createProject(page, title);
  await pasteHTML(editor, literalHTML(source));
  await expect(editor.locator("h2")).toHaveCount(0);
  await expect(editor).toContainText("## Gameplay loops");
  await expect(editor).toContainText("**living world**");
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .toContain("**living world**");
  const original = await savedDocument(page, title);
  // A collapsed caret means the explicit action should format the chapter.
  await editor.press("Control+End");
  await page
    .getByRole("button", { name: "Format Markdown", exact: true })
    .click();
  await expect(editor.locator("h2")).toHaveText("Gameplay loops");
  await expect(editor.locator("h2")).toHaveCSS("font-family", /Arial/i);
  await expect(editor.locator("h2")).toHaveCSS("font-size", /21\.33[0-9]*px/);
  const prose = editor.locator("p").filter({ hasText: /^A living world/ });
  await expect(prose).toHaveCSS("font-family", /Arial/i);
  await expect(prose).toHaveCSS("font-size", /14\.66[0-9]*px/);
  await expect(prose).toHaveCSS("font-weight", "400");
  await expect(prose.locator("strong")).toHaveText("living world");
  await expect(prose.locator("em")).toHaveText("seasonal choices");
  await expect(prose.locator("code")).toHaveText("state");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ol li")).toHaveCount(2);
  await expect(editor.locator("table tr")).toHaveCount(3);
  await expect(editor.locator("table th")).toHaveCount(2);
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "javascript",
  );
  await expect
    .poll(async () =>
      (await storedDocument(page, title))?.content?.some(
        (node) => node.type === "table",
      ),
    )
    .toBe(true);
  const formatted = await savedDocument(page, title);
  const code = formatted.content!.find((node) => node.type === "codeBlock")!;
  expect(code.attrs?.language).toBe("javascript");
  expect(nodeText(code)).toBe(
    'const title = "**keep literal**";\n  // ## stays code\n',
  );
  const paragraph = formatted.content!.find((node) =>
    nodeText(node).startsWith("A living world"),
  )!;
  expect(paragraph.attrs).toMatchObject({
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
  });
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(original);
  await expect(editor).toContainText("**living world**");
  await expect(editor.locator("table")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Y)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(formatted);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(editor.locator("h2")).toHaveText("Gameplay loops");
  await expect(editor.locator("table tr")).toHaveCount(3);
  expect(await savedDocument(page, title)).toEqual(formatted);
});

test("formatting a mixed chapter leaves its existing rich heading, code, image, and table exactly intact", async ({
  page,
}) => {
  const title = "Format a mixed document";
  const editor = await createProject(page, title);
  await pasteHTML(
    editor,
    '<h2 style="font-family:Georgia;font-size:18pt;color:#193b5f">Existing rich heading</h2>' +
      '<p style="font-family:Georgia;font-size:13pt">Already <strong>polished</strong> with <code>## literal code</code> and a <a href="https://example.com/design">reference</a>.</p>' +
      '<pre><code class="language-js">const raw = "**literal**";\n// ## keep\n</code></pre>' +
      "<table><tr><th>Existing system</th><th>Existing status</th></tr><tr><td>Weather</td><td>Stable</td></tr></table>" +
      `<img src="${pixel}" alt="Embedded diagram">` +
      literalHTML(
        "## New subsystem\n\nA **new feature** follows the diagram.\n\n- First rule\n- Second rule",
      ),
  );
  await expect(editor.locator("img")).toHaveCount(1);
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .toContain("**new feature**");
  const original = await savedDocument(page, title);
  const protectedNodes = original.content!.filter(
    (node) =>
      ["heading", "codeBlock", "image", "table"].includes(node.type || "") ||
      nodeText(node).startsWith("Already polished"),
  );
  await editor.press("Control+End");
  await page
    .getByRole("button", { name: "Format Markdown", exact: true })
    .click();
  await expect(editor.locator("h2")).toHaveText([
    "Existing rich heading",
    "New subsystem",
  ]);
  await expect(editor.locator("p strong")).toHaveText([
    "polished",
    "new feature",
  ]);
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .not.toContain("**new feature**");
  const formatted = await savedDocument(page, title);
  for (const node of protectedNodes)
    expect(formatted.content).toContainEqual(node);
  await expect(editor.locator("img")).toHaveAttribute("src", pixel);
  await expect(editor.locator("h2").first()).toHaveCSS(
    "font-family",
    /Georgia/i,
  );
  await expect(editor.locator("h2").first()).toHaveCSS("font-size", "24px");
  await expect(editor.locator("pre")).toContainText(
    'const raw = "**literal**";',
  );
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(original);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Y)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(formatted);
  await editor.press("Control+End");
  await page
    .getByRole("button", { name: "Format Markdown", exact: true })
    .click();
  await expect(
    page.getByText("No Markdown formatting found in this text.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(await savedDocument(page, title)).toEqual(formatted);
});

test("selected Markdown converts inline text or complete paragraphs while outside content stays unchanged", async ({
  page,
}) => {
  const title = "Format selected Markdown";
  const editor = await createProject(page, title);
  await pasteHTML(
    editor,
    "<h2>Existing introduction</h2><p><em>Keep prefix </em>**bright future**<u> and outside suffix</u></p>" +
      literalHTML("## Selected subsystem\n\n- Rule one\n- Rule two") +
      "<p>Outside **unconverted** after.</p>",
  );
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .toContain("**bright future**");
  const original = await savedDocument(page, title);
  await selectText(editor, "**bright future**");
  await page
    .getByRole("button", { name: "Format Markdown", exact: true })
    .click();
  const prose = editor.locator("p").filter({ hasText: /^Keep prefix/ });
  await expect(prose.locator("strong")).toHaveText("bright future");
  await expect(prose.locator("em")).toHaveText("Keep prefix ");
  await expect(prose.locator("u")).toHaveText(" and outside suffix");
  await expect(editor).toContainText("## Selected subsystem");
  await expect(editor).toContainText("Outside **unconverted** after.");
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .not.toContain("**bright future**");
  const inline = await savedDocument(page, title);
  const originalOutside = original.content!.filter(
    (node) => !nodeText(node).startsWith("Keep prefix"),
  );
  for (const node of originalOutside)
    expect(inline.content).toContainEqual(node);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(original);

  await selectParagraphs(editor, "## Selected subsystem", "- Rule two");
  await page
    .getByRole("button", { name: "Format Markdown", exact: true })
    .click();
  await expect(editor.locator("h2")).toHaveText([
    "Existing introduction",
    "Selected subsystem",
  ]);
  await expect(editor.locator("ul li")).toHaveText(["Rule one", "Rule two"]);
  await expect(editor).toContainText("**bright future**");
  await expect(editor).toContainText("Outside **unconverted** after.");
  await expect
    .poll(async () =>
      (await storedDocument(page, title))?.content?.some(
        (node) => node.type === "bulletList",
      ),
    )
    .toBe(true);
  const selected = await savedDocument(page, title);
  for (const node of original.content!.filter(
    (node) =>
      nodeText(node).startsWith("Keep prefix") ||
      nodeText(node).startsWith("Outside ") ||
      nodeText(node) === "Existing introduction",
  ))
    expect(selected.content).toContainEqual(node);
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(original);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Y)", exact: true })
    .click();
  await expect.poll(() => storedDocument(page, title)).toEqual(selected);
});

test("Format Markdown remains visible beside a wide panel in a small window and is hidden in reading preview", async ({
  page,
}) => {
  const title = "Format a system bible section";
  await page.setViewportSize({ width: 960, height: 650 });
  const editor = await createProject(page, title, "bible");
  await pasteHTML(
    editor,
    literalHTML("## System overview\n\nA **clear plan**."),
  );
  await editor.press("Control+End");
  const divider = page.getByRole("separator", { name: "Resize left panel" });
  await divider.focus();
  await page.keyboard.press("End");
  const button = page.getByRole("button", {
    name: "Format Markdown",
    exact: true,
  });
  await expect(button).toBeVisible();
  const pane = (await page.locator(".editor-column").boundingBox())!;
  const bounds = (await button.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(pane.x);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(pane.x + pane.width + 1);
  expect(bounds.y + bounds.height).toBeLessThan(650);
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .toContain("**clear plan**");
  const original = await savedDocument(page, title);
  await page
    .getByRole("button", { name: "Reading preview", exact: true })
    .click();
  await expect(button).toBeHidden();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  expect(await savedDocument(page, title)).toEqual(original);
  await page
    .getByRole("button", { name: "Reading preview", exact: true })
    .click();
  await editor.press("Control+End");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(editor.locator("h2")).toHaveText("System overview");
  await expect(editor.locator("p strong")).toHaveText("clear plan");
  await expect(editor).toBeFocused();
  await expect
    .poll(async () => JSON.stringify(await storedDocument(page, title)))
    .not.toContain("**clear plan**");
  const formatted = await savedDocument(page, title);
  await page.keyboard.press("Control+z");
  await expect.poll(() => storedDocument(page, title)).toEqual(original);
  await page.keyboard.press("Control+y");
  await expect.poll(() => storedDocument(page, title)).toEqual(formatted);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(editor.locator("h2")).toHaveText("System overview");
  expect(await savedDocument(page, title)).toEqual(formatted);
});
