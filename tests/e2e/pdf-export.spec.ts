import { expect, test, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import type { Book, Chapter } from "../../src/model";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1EAAAAASUVORK5CYII=";
const text = (value: string): JSONContent => ({ type: "text", text: value });
const paragraph = (value: string): JSONContent => ({
  type: "paragraph",
  attrs: {
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
    marginBottom: "8pt",
  },
  content: [text(value)],
});
function fixture(): Book {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const sections: [string, string, string | null, JSONContent[]][] = [
    [
      "overview",
      "System overview",
      null,
      [
        {
          type: "heading",
          attrs: {
            level: 1,
            fontFamily: "Arial",
            fontSize: "22pt",
            marginTop: "0pt",
            marginBottom: "6pt",
          },
          content: [text("System overview")],
        },
        {
          ...paragraph(""),
          content: [
            text("Normal Google-sized text with "),
            { ...text("selective emphasis"), marks: [{ type: "bold" }] },
            text(" and "),
            {
              ...text("a source"),
              marks: [
                { type: "italic" },
                { type: "underline" },
                { type: "link", attrs: { href: "https://example.com/design" } },
              ],
            },
            text("."),
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph("Observe seasons")] },
            { type: "listItem", content: [paragraph("Choose a useful task")] },
          ],
        },
        { type: "horizontalRule" },
        {
          type: "callout",
          attrs: { kind: "note" },
          content: [paragraph("Remember the player’s choices.")],
        },
        {
          type: "image",
          attrs: { src: pixel, alt: "Embedded diagram", width: 120 },
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, colwidth: [120, 180] },
                  content: [paragraph("Systems")],
                },
                {
                  type: "tableHeader",
                  attrs: { colwidth: [100] },
                  content: [paragraph("Status")],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { rowspan: 2 },
                  content: [paragraph("Weather")],
                },
                { type: "tableCell", content: [paragraph("Seasons")] },
                { type: "tableCell", content: [paragraph("Ready")] },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [paragraph("Snow")] },
                { type: "tableCell", content: [paragraph("Planned")] },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: {
            language: "javascript",
            filename: "world.ts",
            caption: "Season transitions",
            showLineNumbers: true,
          },
          content: [
            text(
              'const season = "winter";\n  // Keep indentation\nconst longValue = "' +
                "unbroken".repeat(90) +
                '";',
            ),
          ],
        },
      ],
    ],
    [
      "city",
      "Living City",
      "overview",
      [
        {
          type: "heading",
          attrs: { level: 2, fontFamily: "Arial", fontSize: "16pt" },
          content: [text("Living City")],
        },
        paragraph("City overview content."),
      ],
    ],
    [
      "residents",
      "Residents",
      "city",
      [
        {
          type: "heading",
          attrs: { level: 2, fontFamily: "Arial", fontSize: "16pt" },
          content: [text("Residents")],
        },
        paragraph("Deeply nested resident content."),
      ],
    ],
  ];
  return {
    version: 1,
    mode: "bible",
    id: "pdf-export-fixture",
    title: "Export formatting bible",
    subtitle: "An independent project",
    author: "Example author",
    description: "",
    language: "en-US",
    created: timestamp,
    modified: timestamp,
    goal: 0,
    color: "#314d43",
    nodes: sections.map(([id, title, parentId, content]) => ({
      id,
      title,
      parentId,
      type: "chapter",
      kind: "chapter",
      status: "Draft",
      progress: "in-progress",
      icon: "document",
      goal: 0,
      tags: "private-tags",
      notes: "Private working notes never printed",
      document: { type: "doc", content },
      created: timestamp,
      modified: timestamp,
    })),
  };
}
async function openProject(page: Page, book = fixture()) {
  await page.addInitScript((value) => {
    localStorage.setItem("codebook.library.v1", JSON.stringify([value]));
    localStorage.removeItem("codebook.recovery.v1");
  }, book);
  await page.goto("/");
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toBeVisible();
  return book;
}
async function openPDF(page: Page) {
  await page.locator(".outline-page-count").click();
  await expect(
    page.getByRole("dialog", { name: "Export PDF", exact: true }),
  ).toBeVisible();
  return page.frameLocator('iframe[title="PDF content preview"]');
}
async function storedBooks(page: Page) {
  return page.evaluate(() => localStorage.getItem("codebook.library.v1"));
}

test("PDF preview preserves Google formatting, full nested outline, merged tables and visible code metadata", async ({
  page,
}) => {
  const book = await openProject(page);
  const original = await storedBooks(page);
  await expect(page.locator(".outline-page-count")).toContainText(
    /pages \(est\.\)/,
  );
  const preview = await openPDF(page);
  await expect(preview.locator("header h1")).toHaveText(book.title);
  await expect(preview.locator("section")).toHaveCount(3);
  await expect(preview.locator("section section")).toHaveCount(0);
  await expect(preview.locator("section h1")).toHaveText("System overview");
  await expect(preview.locator("section h2")).toHaveText([
    "Living City",
    "Residents",
  ]);
  await expect(preview.locator("#residents h2")).toHaveCSS(
    "font-size",
    /21\.33[0-9]*px/,
  );
  await expect(preview.locator(".pdf-breadcrumb").last()).toHaveText(
    "System overview / Living City",
  );
  const prose = preview.locator("#overview > p").first();
  await expect(prose).toHaveCSS("font-family", "Arial");
  await expect(prose).toHaveCSS("font-size", /14\.66[0-9]*px/);
  await expect(prose).toHaveCSS("font-weight", "400");
  await expect(prose).toHaveCSS("line-height", /16\.86[0-9]*px/);
  await expect(prose.locator("strong")).toHaveText("selective emphasis");
  await expect(prose.locator("a")).toHaveAttribute(
    "href",
    "https://example.com/design",
  );
  await expect(prose.locator("u em, em u")).toHaveText("a source");
  await expect(preview.locator("ul li")).toHaveText([
    "Observe seasons",
    "Choose a useful task",
  ]);
  await expect(preview.locator("ul li p").first()).toHaveCSS(
    "margin-bottom",
    "0px",
  );
  await expect(preview.locator("hr")).toHaveCount(1);
  await expect(preview.locator("aside")).toContainText(
    "Remember the player’s choices.",
  );
  await expect(preview.locator("img")).toHaveAttribute("src", pixel);
  await expect(preview.locator("table th").first()).toHaveAttribute(
    "colspan",
    "2",
  );
  await expect(preview.locator("table td").first()).toHaveAttribute(
    "rowspan",
    "2",
  );
  await expect(preview.locator("col")).toHaveCount(3);
  await expect(preview.locator(".pdf-code-filename")).toHaveText("world.ts");
  await expect(preview.locator(".pdf-code-caption")).toHaveText(
    "Season transitions",
  );
  await expect(preview.locator(".pdf-line-number")).toHaveText(["1", "2", "3"]);
  await expect(preview.locator(".hljs-keyword").first()).toHaveText("const");
  await expect(preview.locator("body")).not.toContainText(
    "Private working notes",
  );
  await expect(
    page.getByRole("status", { name: "PDF page count" }),
  ).toContainText("estimated");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await storedBooks(page)).toBe(original);
});

test("PDF settings update paper and pagination, persist across reopening, and export from the main menu", async ({
  page,
}) => {
  await openProject(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Let your words travel." })
    .getByRole("button", { name: /^PDF/ })
    .click();
  await page.getByRole("button", { name: "Preview PDF", exact: true }).click();
  const preview = page.frameLocator('iframe[title="PDF content preview"]');
  await page
    .getByRole("combobox", { name: "Paper size", exact: true })
    .selectOption("a4");
  await page.getByLabel("Include project title", { exact: true }).uncheck();
  await page
    .getByLabel("Start each section on a new page", { exact: true })
    .check();
  await page.getByLabel("Page numbers", { exact: true }).uncheck();
  await expect(preview.locator("header")).toHaveCount(0);
  await expect(preview.locator(".pdf-new-page")).toHaveCount(2);
  const style = await preview.locator("style").textContent();
  expect(style).toContain("size:A4;margin:0.55in");
  expect(style).not.toContain("counter(page)");
  await expect(page.getByRole("status", { name: "PDF page count" })).toHaveText(
    "About 3 pages (estimated)",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".outline-page-count")).toHaveText(
    "~3 pages (est.)",
  );
  await openPDF(page);
  await expect(
    page.getByRole("combobox", { name: "Paper size", exact: true }),
  ).toHaveValue("a4");
  await expect(
    page.getByLabel("Include project title", { exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Start each section on a new page", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Page numbers", { exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Export formatting bible", exact: true })
    .click();
  await openPDF(page);
  await expect(
    page.getByRole("combobox", { name: "Paper size", exact: true }),
  ).toHaveValue("a4");
});

test("PDF preview and print action fit a small window while an expanded outline stays unchanged", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 960, height: 650 });
  await openProject(page);
  const divider = page.getByRole("separator", {
    name: "Resize left panel",
    exact: true,
  });
  await divider.focus();
  await page.keyboard.press("End");
  const chosenWidth = await page
    .locator(".structure")
    .evaluate((element) => element.getBoundingClientRect().width);
  const preview = await openPDF(page);
  await expect(preview.locator(".pdf-code-filename")).toHaveText("world.ts");
  const dialog = page.getByRole("dialog", { name: "Export PDF", exact: true });
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.width).toBeGreaterThan(800);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(961);
  const print = page.getByRole("button", {
    name: "Print / Save as PDF",
    exact: true,
  });
  const buttonBounds = (await print.boundingBox())!;
  expect(buttonBounds.y + buttonBounds.height).toBeLessThanOrEqual(650);
  const frame = page.locator('iframe[title="PDF content preview"]');
  await expect
    .poll(() =>
      frame.evaluate((element) => {
        const previewWindow = (element as HTMLIFrameElement).contentWindow!;
        const doc = previewWindow.document;
        return doc.documentElement.scrollWidth - previewWindow.innerWidth;
      }),
    )
    .toBeLessThanOrEqual(1);
  // The fallback invokes the browser print window; it never fabricates PDF bytes.
  await frame.evaluate((element) => {
    const previewWindow = (element as HTMLIFrameElement).contentWindow!;
    (
      previewWindow as unknown as { print: () => void; __printCalls: number }
    ).__printCalls = 0;
    previewWindow.print = () => {
      (previewWindow as unknown as { __printCalls: number }).__printCalls++;
    };
  });
  await print.click();
  expect(
    await frame.evaluate(
      (element) =>
        (
          (element as HTMLIFrameElement).contentWindow as unknown as {
            __printCalls: number;
          }
        ).__printCalls,
    ),
  ).toBe(1);
  await expect(
    page.getByRole("status", { name: "PDF page count" }),
  ).toContainText("estimated");
  await page.screenshot({
    path: testInfo.outputPath("narrow-pdf-preview.png"),
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(
    await page
      .locator(".structure")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(chosenWidth);
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("Normal Google-sized text");
});

test("compact PDF spacing removes imported gaps while original spacing and blank lines remain available", async ({
  page,
}) => {
  const book = fixture();
  (book.nodes[0] as Chapter).document = {
    type: "doc",
    content: [
      {
        ...paragraph("What kind of life do you want to build here?"),
        attrs: {
          fontFamily: "Arial",
          fontSize: "11pt",
          marginTop: "48pt",
          marginBottom: "48pt",
        },
      },
      {
        type: "paragraph",
        attrs: {
          fontFamily: "Arial",
          fontSize: "11pt",
          marginTop: "60pt",
          marginBottom: "60pt",
        },
      },
      { type: "horizontalRule" },
      {
        type: "heading",
        attrs: {
          level: 2,
          fontFamily: "Arial",
          fontSize: "16pt",
          marginTop: "72pt",
          marginBottom: "36pt",
        },
        content: [text("The Core Fantasy")],
      },
      paragraph("The central fantasy of Open Blue is a life of your own."),
    ],
  };
  await openProject(page, book);
  const original = await storedBooks(page);
  const preview = await openPDF(page);
  await expect(
    page.getByLabel("Compact spacing", { exact: true }),
  ).toBeChecked();
  const question = preview.locator("#overview > p").first();
  const heading = preview.getByRole("heading", {
    name: "The Core Fantasy",
    exact: true,
  });
  await expect(question).toHaveCSS("font-size", /14\.66[0-9]*px/);
  await expect(question).toHaveCSS("margin-top", "16px");
  await expect(question).toHaveCSS("margin-bottom", "10px");
  expect(
    await preview
      .locator(".pdf-empty-paragraph")
      .evaluate((element) => parseFloat(getComputedStyle(element).height)),
  ).toBeCloseTo(12, 1);
  await expect(preview.locator(".pdf-empty-paragraph")).toHaveCSS(
    "margin-bottom",
    "0px",
  );
  await expect(preview.locator("hr")).toHaveCSS("margin-top", "8px");
  await expect(heading).toHaveCSS("margin-top", "16px");
  await page.getByLabel("Compact spacing", { exact: true }).uncheck();
  await expect(question).toHaveCSS("margin-top", "64px");
  await expect(question).toHaveCSS("margin-bottom", "64px");
  await expect(heading).toHaveCSS("margin-top", "96px");
  await expect(heading).toHaveCSS("font-size", /21\.33[0-9]*px/);
  await expect(preview.locator(".pdf-empty-paragraph")).toHaveCSS(
    "margin-bottom",
    "80px",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await storedBooks(page)).toBe(original);
  await openPDF(page);
  await expect(
    page.getByLabel("Compact spacing", { exact: true }),
  ).not.toBeChecked();
});
