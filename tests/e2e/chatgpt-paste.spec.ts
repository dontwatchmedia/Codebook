import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { JSONContent } from "@tiptap/core";
import type { Book, Chapter } from "../../src/model";

const richHTML = readFileSync(
  new URL("../fixtures/chatgpt-rich.html", import.meta.url),
  "utf8",
);
const iniSource =
  "[Simulation]\nEnabled=true\n  ; Keep indentation and **literal** syntax\nMaxSteps=12";
const inlineSource = "x^2 + y^2 = r^2";
const blockSource = "P_{stage} = \\frac{W_{stage}}{\\sum_{i=1}^{n} W_i}";

async function createProject(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  return page.getByRole("textbox", { name: "Chapter manuscript", exact: true });
}

async function pasteHTML(editor: Locator, html: string, replace = true) {
  await editor.focus();
  if (replace) await editor.press("Control+A");
  await editor.evaluate((element, content) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", content);
    transfer.setData("text/plain", "ChatGPT technical example");
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, html);
}

async function documentFor(
  page: Page,
  title: string,
): Promise<JSONContent | undefined> {
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    ) as Book[];
    return (
      books
        .find((book) => book.title === wanted)
        ?.nodes.find(
          (node) => node.type === "chapter" && node.kind === "chapter",
        ) as Chapter | undefined
    )?.document;
  }, title);
}

async function savedDocument(page: Page, title: string): Promise<JSONContent> {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  const doc = await documentFor(page, title);
  expect(doc).toBeDefined();
  return doc!;
}

function allNodes(node: JSONContent | undefined): JSONContent[] {
  return node ? [node, ...(node.content || []).flatMap(allNodes)] : [];
}
function text(node: JSONContent | undefined): string {
  return node?.text || node?.content?.map(text).join("") || "";
}

async function appearance(editor: Locator, wanted: string) {
  return editor.evaluate((element, label) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.includes(label)) continue;
      const style = getComputedStyle(node.parentElement!);
      return {
        font: style.fontFamily,
        size: parseFloat(style.fontSize),
        weight: style.fontWeight,
        color: style.color,
      };
    }
    throw new Error(`No text run contains ${label}`);
  }, wanted);
}

async function assertRichPaste(page: Page, editor: Locator, title: string) {
  const heading = editor
    .locator("h2")
    .filter({ hasText: /^A balanced simulation$/ });
  await expect(heading).toHaveCount(1);
  expect((await appearance(heading, "A balanced simulation")).font).toContain(
    "Arial",
  );
  expect((await appearance(heading, "A balanced simulation")).size).toBeCloseTo(
    (16 * 4) / 3,
    1,
  );
  const regular = await appearance(editor, "Each stage keeps its own state");
  expect(regular.font).toContain("Arial");
  expect(regular.size).toBeCloseTo((11 * 4) / 3, 1);
  expect(regular.weight).toBe("400");
  expect((await appearance(editor, "selective emphasis")).weight).toBe("700");
  await expect(
    editor.locator("strong").filter({ hasText: /^selective emphasis$/ }),
  ).toHaveCount(1);

  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "ini",
  );
  const code = editor.locator(".code-body pre code");
  await expect(code).toHaveText(iniSource);
  const cards = editor.locator("table").filter({ hasText: "Inputs" });
  await expect(cards.locator("tr")).toHaveCount(1);
  await expect(cards.locator("td")).toHaveCount(2);
  await expect(cards.locator("td").nth(0)).toContainText("Inputs");
  await expect(cards.locator("td").nth(0)).toContainText("Stage weights");
  await expect(cards.locator("td").nth(1)).toContainText("Outputs");
  await expect(cards.locator("td").nth(1)).toContainText("Selected stage");
  const lifecycle = editor.locator("table").filter({ hasText: "Draft" });
  await expect(lifecycle).toHaveCount(1);
  await expect(lifecycle.locator("td")).toHaveCount(5);
  expect((await lifecycle.innerText()).replace(/\s+/g, " ")).toMatch(
    /Draft.*Review.*Published/,
  );
  await expect(
    editor.locator('[data-codebook-math="inline"] .katex'),
  ).toHaveCount(1);
  await expect(
    editor.locator('[data-codebook-math="block"] .katex'),
  ).toHaveCount(1);
  await expect(editor.locator('[data-codebook-math="inline"]')).toHaveAttribute(
    "data-latex",
    inlineSource,
  );
  const inlineLayout = await editor
    .locator('[data-codebook-math="inline"]')
    .evaluate((equation) => {
      const prefix = equation.previousSibling!;
      const range = document.createRange();
      range.selectNodeContents(prefix);
      const text = range.getBoundingClientRect();
      const math = equation.getBoundingClientRect();
      return {
        text: { top: text.top, bottom: text.bottom, right: text.right },
        math: { top: math.top, bottom: math.bottom, left: math.left },
        prefix: prefix.textContent,
      };
    });
  expect(inlineLayout.prefix).toBe("A circular boundary uses ");
  expect(inlineLayout.math.left).toBeGreaterThanOrEqual(
    inlineLayout.text.right - 1,
  );
  expect(inlineLayout.math.top).toBeLessThan(inlineLayout.text.bottom);
  expect(inlineLayout.math.bottom).toBeGreaterThan(inlineLayout.text.top);
  await expect(editor.locator('[data-codebook-math="block"]')).toHaveAttribute(
    "data-latex",
    blockSource,
  );

  await expect
    .poll(
      async () =>
        allNodes((await documentFor(page, title))!).filter(
          (node) => node.type === "codeBlock",
        ).length,
    )
    .toBe(1);
  const document = await savedDocument(page, title);
  const nodes = allNodes(document);
  const sourceCode = nodes.find((node) => node.type === "codeBlock")!;
  expect(sourceCode.attrs?.language).toBe("ini");
  expect(text(sourceCode)).toBe(iniSource);
  expect(
    nodes
      .filter((node) => node.type === "inlineMath")
      .map((node) => node.attrs?.latex),
  ).toEqual([inlineSource]);
  expect(
    nodes
      .filter((node) => node.type === "blockMath")
      .map((node) => node.attrs?.latex),
  ).toEqual([blockSource]);
  expect(text(document)).not.toMatch(
    /Copy code|Edit response|Thought for 8 seconds/,
  );
  expect(text(document)).not.toContain("PstagePstage");
  expect(nodes.filter((node) => node.type === "table")).toHaveLength(2);
  return document;
}

test("ChatGPT HTML retains selective typography, clean INI, editable cards and equation sources through undo, redo and reload", async ({
  page,
}) => {
  const title = "ChatGPT rich paste";
  const editor = await createProject(page, title);
  await editor.fill("Before rich paste.");
  await expect
    .poll(async () => text((await documentFor(page, title))!))
    .toBe("Before rich paste.");
  const before = await savedDocument(page, title);
  await pasteHTML(editor, richHTML);
  const pasted = await assertRichPaste(page, editor, title);
  await editor.press("Control+Z");
  await expect(editor).toHaveText("Before rich paste.");
  await expect.poll(async () => documentFor(page, title)).toEqual(before);
  await editor.press("Control+Y");
  await assertRichPaste(page, editor, title);
  await expect.poll(async () => documentFor(page, title)).toEqual(pasted);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await assertRichPaste(page, editor, title);
  const firstCell = editor
    .locator("table td")
    .first()
    .locator("p")
    .filter({ hasText: /^Stage weights/ });
  await firstCell.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" stay editable");
  await expect(firstCell).toHaveText("Stage weights stay editable");
  await expect
    .poll(async () => text((await documentFor(page, title))!))
    .toContain("Stage weights stay editable");
});

test("HTML pasted while Bold is active keeps normal source runs and preserves the surrounding bold writing", async ({
  page,
}) => {
  const title = "Source marks beat active Bold";
  const editor = await createProject(page, title);
  await editor.focus();
  await editor.press("Control+B");
  await editor.pressSequentially("Existing bold prefix. ");
  await expect
    .poll(async () => text((await documentFor(page, title))!))
    .toContain("Existing bold prefix.");
  const before = await savedDocument(page, title);
  await pasteHTML(
    editor,
    '<div class="markdown prose"><p>Plain source with <strong>chosen emphasis</strong>.</p></div>',
    false,
  );
  expect((await appearance(editor, "Existing bold prefix.")).weight).toBe(
    "700",
  );
  expect((await appearance(editor, "Plain source with")).weight).toBe("400");
  expect((await appearance(editor, "chosen emphasis")).weight).toBe("700");
  await expect
    .poll(async () => text((await documentFor(page, title))!))
    .toContain("Plain source with chosen emphasis.");
  const runs = allNodes(await savedDocument(page, title)).filter(
    (node) => node.type === "text",
  );
  expect(
    runs
      .find((node) => node.text?.includes("Plain source with"))
      ?.marks?.some((mark) => mark.type === "bold") || false,
  ).toBe(false);
  expect(
    runs
      .find((node) => node.text?.includes("chosen emphasis"))
      ?.marks?.some((mark) => mark.type === "bold"),
  ).toBe(true);
  await editor.press("Control+Z");
  await expect.poll(async () => documentFor(page, title)).toEqual(before);
  await expect(editor).toContainText("Existing bold prefix.");
});

test("ChatGPT math renders offline with dark contrast, editable sources, and fitting two-column cards at the minimum window size", async ({
  page,
}) => {
  const title = "Dark ChatGPT paste";
  const editor = await createProject(page, title);
  await pasteHTML(editor, richHTML);
  await assertRichPaste(page, editor, title);
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  const darkInk = await editor.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(
    (await appearance(editor, "Each stage keeps its own state")).color,
  ).toBe(darkInk);
  const inline = editor.locator('[data-codebook-math="inline"]');
  await expect(inline.locator(".katex")).toHaveCSS("color", darkInk);
  await inline.dblclick();
  await page
    .getByRole("textbox", { name: "Equation source", exact: true })
    .fill("x^2 + y^2 = 25");
  await page
    .getByRole("button", { name: "Save equation", exact: true })
    .click();
  await expect(inline).toHaveAttribute("data-latex", "x^2 + y^2 = 25");
  await editor.focus();
  await editor.press("Control+Z");
  await expect(inline).toHaveAttribute("data-latex", inlineSource);
  await page.setViewportSize({ width: 960, height: 650 });
  const cards = editor.locator("table").filter({ hasText: "Inputs" });
  await cards.scrollIntoViewIfNeeded();
  const bounds = await cards.evaluate((element) => {
    const table = element.getBoundingClientRect();
    const paper = element.closest(".paper-scroll")!.getBoundingClientRect();
    return {
      left: table.left,
      right: table.right,
      paperLeft: paper.left,
      paperRight: paper.right,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(bounds.paperLeft - 1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.paperRight + 1);
  await savedDocument(page, title);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(inline).toHaveAttribute("data-latex", inlineSource);
  await expect(inline.locator(".katex")).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: test.info().outputPath("chatgpt-dark-narrow.png"),
    fullPage: true,
  });
});

test("ChatGPT Copy-button plain Markdown retains headings, selective bold, INI fences and all math delimiters", async ({
  page,
}) => {
  const title = "ChatGPT Copy-button Markdown";
  const editor = await createProject(page, title);
  const displaySum = "S = \\sum_{i=1}^{n} W_i";
  const literalCode =
    "[Simulation]\nEnabled=true\nBudget=$100\n; \\(keep literal\\)";
  const markdown = [
    "## A balanced simulation",
    "",
    "Each stage keeps its own state with **selective emphasis**.",
    "",
    "- Keep state local",
    "- Check the stage transition",
    "",
    "```ini",
    literalCode,
    "```",
    "",
    `A circular boundary uses \\(${inlineSource}\\).`,
    "",
    "\\[",
    blockSource,
    "\\]",
    "",
    "$$",
    displaySum,
    "$$",
    "",
    "| Inputs | Outputs |",
    "| --- | --- |",
    "| Stage weights | Selected stage |",
    "",
    "A literal price $25 stays normal prose.",
  ].join("\n");
  await editor.focus();
  await editor.evaluate((element, source) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", source);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, markdown);
  await expect(editor.locator("h2")).toHaveText("A balanced simulation");
  await expect(editor.locator("ul > li")).toHaveCount(2);
  expect(
    (await appearance(editor, "Each stage keeps its own state")).weight,
  ).toBe("400");
  expect(
    (await appearance(editor, "Each stage keeps its own state")).font,
  ).toContain("Arial");
  expect((await appearance(editor, "selective emphasis")).weight).toBe("700");
  await expect(editor.locator(".code-body pre code")).toHaveText(literalCode);
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "ini",
  );
  await expect(
    editor.locator('[data-codebook-math="inline"] .katex'),
  ).toHaveCount(1);
  await expect(
    editor.locator('[data-codebook-math="block"] .katex'),
  ).toHaveCount(2);
  await expect(
    editor.locator("p").filter({ hasText: "A literal price" }),
  ).toHaveText("A literal price $25 stays normal prose.");
  await expect(editor.locator("table tr")).toHaveCount(2);
  await expect
    .poll(
      async () =>
        allNodes((await documentFor(page, title))!).filter(
          (node) => node.type === "blockMath",
        ).length,
    )
    .toBe(2);
  const pasted = await savedDocument(page, title);
  const nodes = allNodes(pasted);
  expect(
    nodes
      .filter((node) => node.type === "inlineMath")
      .map((node) => node.attrs?.latex),
  ).toEqual([inlineSource]);
  expect(
    nodes
      .filter((node) => node.type === "blockMath")
      .map((node) => node.attrs?.latex),
  ).toEqual([blockSource, displaySum]);
  expect(text(nodes.find((node) => node.type === "codeBlock")!)).toBe(
    `${literalCode}\n`,
  );
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(
    editor.locator('[data-codebook-math="block"] .katex'),
  ).toHaveCount(2);
  await expect.poll(async () => documentFor(page, title)).toEqual(pasted);
});

test("flattened Copy-button text preserves visible lines and ChatGPT image links without inventing missing structures", async ({
  page,
}) => {
  const title = "Flattened ChatGPT Copy text";
  const editor = await createProject(page, title);
  const imageURL =
    "https://images.openai.com/static-rsc-4/synthetic-lifecycle?purpose=fullsize";
  const caption = "A simple lifecycle illustration";
  const secondImageURL =
    "https://images.openai.com/static-rsc-4/synthetic-card-layout?purpose=fullsize";
  const secondCaption = "A second layout illustration";
  const pixel =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1EAAAAASUVORK5CYII=";
  await page.route("https://images.openai.com/static-rsc-4/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(pixel, "base64"),
    }),
  );
  const copiedText = [
    "A synthetic systems note begins here.",
    "Each stage keeps its own state.",
    "Inputs",
    "Stage weights",
    "Outputs",
    "Selected stage",
    `[${caption}](${imageURL})`,
    `[${secondCaption}](${secondImageURL})`,
    "The illustrations retain their surrounding explanation.",
    "See [Reference guide](https://example.org/reference) for the ordinary citation.",
  ].join("\n");
  await editor.focus();
  await editor.evaluate((element, source) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", source);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, copiedText);
  const illustration = editor.locator("img");
  await expect(illustration).toHaveCount(2);
  await expect(illustration.nth(0)).toHaveAttribute("src", imageURL);
  await expect(illustration.nth(0)).toHaveAttribute("alt", caption);
  await expect(illustration.nth(1)).toHaveAttribute("src", secondImageURL);
  await expect(illustration.nth(1)).toHaveAttribute("alt", secondCaption);
  await expect
    .poll(() =>
      illustration.evaluateAll((images) =>
        images.map((image) => (image as HTMLImageElement).naturalWidth),
      ),
    )
    .toEqual([1, 1]);
  await expect(
    editor.locator("a").filter({ hasText: /^Reference guide$/ }),
  ).toHaveAttribute("href", "https://example.org/reference");
  await expect(
    editor.locator("a").filter({ hasText: caption }),
  ).toHaveAttribute("href", imageURL);
  await expect(
    editor.locator("a").filter({ hasText: secondCaption }),
  ).toHaveAttribute("href", secondImageURL);
  expect(await editor.innerText()).toMatch(
    /A synthetic systems note begins here\.\nEach stage keeps its own state\.\nInputs\nStage weights\nOutputs\nSelected stage/,
  );
  const renderedText = await editor.innerText();
  const expectedOrder = [
    "Selected stage",
    caption,
    secondCaption,
    "The illustrations retain their surrounding explanation.",
    "Reference guide",
  ];
  const positions = expectedOrder.map((label) => renderedText.indexOf(label));
  expect(positions.every((position) => position >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  await expect(editor.locator("h1,h2,h3,table")).toHaveCount(0);
  expect(
    (await appearance(editor, "A synthetic systems note begins here.")).weight,
  ).toBe("400");
  expect(
    (await appearance(editor, "A synthetic systems note begins here.")).font,
  ).toContain("Arial");
  await expect
    .poll(
      async () =>
        allNodes((await documentFor(page, title))!).filter(
          (node) => node.type === "image",
        ).length,
    )
    .toBe(2);
  const pasted = await savedDocument(page, title);
  const imageNodes = allNodes(pasted).filter((node) => node.type === "image");
  expect(imageNodes.map((node) => node.attrs?.src)).toEqual([
    imageURL,
    secondImageURL,
  ]);
  expect(imageNodes.map((node) => node.attrs?.alt)).toEqual([
    caption,
    secondCaption,
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(illustration.nth(0)).toHaveAttribute("alt", caption);
  await expect(illustration.nth(1)).toHaveAttribute("alt", secondCaption);
  await expect.poll(async () => documentFor(page, title)).toEqual(pasted);
});
