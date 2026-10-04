import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const docsHTML = readFileSync(
  new URL("../fixtures/google-docs.html", import.meta.url),
  "utf8",
).replace(/>\s+</g, "><");

async function pasteHTML(page: Page) {
  await page.getByRole("textbox", { name: "Chapter manuscript" }).focus();
  await page.evaluate((html) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    data.setData("text/plain", "Example Game — System Bible");
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, docsHTML);
}

async function textAppearance(locator: Locator, text: string) {
  return locator.evaluate((element, wanted) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes(wanted)) {
        const css = getComputedStyle(node.parentElement!);
        const decorations: string[] = [];
        let ancestor: HTMLElement | null = node.parentElement;
        while (ancestor && element.contains(ancestor)) {
          decorations.push(getComputedStyle(ancestor).textDecorationLine);
          ancestor = ancestor.parentElement;
        }
        return {
          fontFamily: css.fontFamily,
          fontSize: parseFloat(css.fontSize),
          fontWeight: css.fontWeight,
          lineHeight: parseFloat(css.lineHeight),
          fontStyle: css.fontStyle,
          color: css.color,
          textDecorationLine: decorations.join(" "),
        };
      }
    }
    throw new Error("Could not find formatted text: " + wanted);
  }, text);
}

async function expectDocsFormatting(page: Page) {
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  const title = editor
    .locator("h1")
    .filter({ hasText: "Example Game — System Bible" });
  await expect(title).toHaveCount(1);
  const titleStyle = await textAppearance(title, "Example Game — System Bible");
  expect(titleStyle.fontFamily).toContain("Arial");
  expect(titleStyle.fontSize).toBeCloseTo((22 * 4) / 3, 1);
  expect(titleStyle.fontWeight).toBe("700");

  const opening = editor.locator(":scope > p").filter({
    hasText: /^Example Game is a fictional design document/,
  });
  await expect(opening).toHaveCount(1);
  const normalStyle = await textAppearance(opening, "describe their purpose");
  expect(normalStyle.fontFamily).toContain("Arial");
  expect(normalStyle.fontSize).toBeCloseTo((11 * 4) / 3, 1);
  expect(normalStyle.fontWeight).toBe("400");
  expect(normalStyle.lineHeight).toBeCloseTo(((11 * 4) / 3) * 1.15, 1);
  await expect(opening).toHaveCSS("margin-bottom", /10\.66[0-9]*px/);
  await expect(opening).toHaveCSS("margin-left", /29\.33[0-9]*px/);
  await expect(opening).toHaveCSS("margin-right", "8px");
  await expect(opening).toHaveCSS("text-indent", "0px");

  const summary = editor
    .locator(":scope > p")
    .filter({ hasText: /^Tl;dr Example Game/ });
  expect((await textAppearance(summary, "Tl;dr Example Game")).fontWeight).toBe(
    "400",
  );
  const selective = editor.locator(":scope > p").filter({
    hasText: /^Example Game is a fictional systems overview/,
  });
  expect((await textAppearance(selective, "Example Game")).fontWeight).toBe(
    "700",
  );
  expect((await textAppearance(selective, " is a fictional")).fontWeight).toBe(
    "400",
  );
  const heading = editor
    .locator("h2")
    .filter({ hasText: /^What is Example Game\?$/ });
  expect(
    (await textAppearance(heading, "What is Example Game?")).fontSize,
  ).toBeCloseTo((16 * 4) / 3, 1);
  expect(
    (await textAppearance(heading, "What is Example Game?")).fontWeight,
  ).toBe("700");

  const legend = editor
    .locator(":scope > p")
    .filter({ hasText: "In progress" });
  await expect(legend).toHaveCSS("text-align", "center");
  await expect(
    editor.locator(":scope > ul").first().locator(":scope > li"),
  ).toHaveCount(14);
  await expect(editor.locator("ul ul > li")).toHaveCount(2);
  const firstListItem = editor
    .locator(":scope > ul")
    .first()
    .locator(":scope > li")
    .first();
  const listSpacing = await firstListItem.evaluate((element) => ({
    lineHeight: parseFloat(getComputedStyle(element).lineHeight),
    markerLineHeight: parseFloat(
      getComputedStyle(element, "::marker").lineHeight,
    ),
    height: element.getBoundingClientRect().height,
  }));
  const sourceLineHeight = ((11 * 4) / 3) * 1.15;
  expect(listSpacing.lineHeight).toBeCloseTo(sourceLineHeight, 1);
  expect(listSpacing.markerLineHeight).toBeCloseTo(sourceLineHeight, 1);
  expect(listSpacing.height).toBeCloseTo(sourceLineHeight, 1);
  const farmer = editor.locator("li p").filter({ hasText: /^an overview$/ });
  expect((await textAppearance(farmer, "an overview")).fontWeight).toBe("400");
  expect((await textAppearance(farmer, "an overview")).fontSize).toBeCloseTo(
    (11 * 4) / 3,
    1,
  );
  const conclusion = editor
    .locator(":scope > p")
    .filter({ hasText: /^A useful reference for later\.$/ });
  await expect(conclusion).toHaveCSS("text-align", "right");
  const conclusionStyle = await textAppearance(
    conclusion,
    "A useful reference for later.",
  );
  expect(conclusionStyle.fontStyle).toBe("italic");
  expect(conclusionStyle.textDecorationLine).toContain("underline");
  expect(conclusionStyle.color).toBe("rgb(103, 78, 167)");
}

test("Google Docs paste preserves fonts, selective bold, spacing, and nested lists through saving and native copy", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Google Docs formatting");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page.getByLabel("Chapter title", { exact: true }).fill("Docs source");
  await pasteHTML(page);
  await expectDocsFormatting(page);

  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.focus();
  await page.keyboard.press("Control+a");
  const clipboard = await page.evaluate(() => {
    const data = new DataTransfer();
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return {
      native: data.getData("application/x-codebook"),
      html: data.getData("text/html"),
    };
  });
  expect(clipboard.native).toContain("Example Game");
  expect(clipboard.html).toContain("Arial");

  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Copied overview");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await editor.focus();
  await page.evaluate((copied) => {
    const data = new DataTransfer();
    data.setData("application/x-codebook", copied.native);
    data.setData("text/html", "<p>Lower priority</p>");
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, clipboard);
  await expectDocsFormatting(page);
  await expect(editor).not.toContainText("Lower priority");

  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Google Docs formatting", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Copied overview" })
    .click();
  await expectDocsFormatting(page);
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  const darkOpening = editor.locator(":scope > p").filter({
    hasText: /^Example Game is a fictional design document/,
  });
  const darkStyle = await textAppearance(darkOpening, "describe their purpose");
  const darkInk = await editor.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(darkStyle.color).toBe(darkInk);
  expect(darkStyle.color).not.toBe("rgb(0, 0, 0)");
  expect(darkStyle.fontFamily).toContain("Arial");
  expect(darkStyle.fontSize).toBeCloseTo((11 * 4) / 3, 1);
  expect(darkStyle.fontWeight).toBe("400");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/google-docs-formatting.png",
    fullPage: true,
  });
});
