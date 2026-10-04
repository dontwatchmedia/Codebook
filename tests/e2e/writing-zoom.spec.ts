import { expect, test, type Locator, type Page } from "@playwright/test";

const sourceHTML =
  '<b id="docs-internal-guid-zoom" style="font-weight:normal">' +
  '<h1 style="line-height:1.15"><span style="font-family:Arial;font-size:23pt;font-weight:700">Example Game — System Bible</span></h1>' +
  '<p style="line-height:1.15"><span style="font-family:Arial;font-size:11pt;font-weight:400">Normal source writing remains eleven points.</span></p>' +
  '<h2 style="line-height:1.15"><span style="font-family:Arial;font-size:17pt;font-weight:700">What is Example Game?</span></h2>' +
  '<p style="line-height:1.15"><span style="font-family:Arial;font-size:11pt;font-weight:400">A zoomed manuscript remains editable.</span></p>' +
  "</b>";

async function createAndPaste(page: Page, title: string, html = sourceHTML) {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill(title);
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.focus();
  await page.evaluate((content) => {
    const data = new DataTransfer();
    data.setData("text/html", content);
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, html);
  await expect
    .poll(async () => JSON.stringify(await savedDocument(page, title)))
    .toContain("Example Game");
  return editor;
}

async function savedDocument(page: Page, title: string) {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    );
    const book = books.find(
      (value: { title: string }) => value.title === wanted,
    );
    return book.nodes.find(
      (node: { type: string; kind?: string }) =>
        node.type === "chapter" && node.kind === "chapter",
    ).document;
  }, title);
}

// Computed font sizes stay in CSS pixels under CSS zoom. Measure actual text
// ranges as well, so the test proves that the displayed writing gets smaller.
async function appearance(locator: Locator) {
  return locator.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode()!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, Math.min(8, text.textContent!.length));
    const glyphs = range.getBoundingClientRect();
    const block = element.getBoundingClientRect();
    const style = getComputedStyle(text.parentElement!);
    return {
      glyphWidth: glyphs.width,
      glyphHeight: glyphs.height,
      lineHeight: block.height,
      fontSize: parseFloat(style.fontSize),
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
    };
  });
}

async function expectPaperFits(page: Page) {
  const fit = await page.locator(".paper-scroll").evaluate((panel) => {
    const paper = panel.querySelector(".paper")!.getBoundingClientRect();
    const visible = panel.getBoundingClientRect();
    return {
      overflow: panel.scrollWidth - panel.clientWidth,
      paperLeft: paper.left,
      paperRight: paper.right,
      panelLeft: visible.left,
      panelRight: visible.right,
    };
  });
  expect(fit.overflow).toBeLessThanOrEqual(1);
  expect(fit.paperLeft).toBeGreaterThanOrEqual(fit.panelLeft - 1);
  expect(fit.paperRight).toBeLessThanOrEqual(fit.panelRight + 1);
}

test("writing zoom matches an 80% source view without changing imported font sizes or saved content", async ({
  page,
}) => {
  const title = "Display zoom keeps source sizes";
  const editor = await createAndPaste(page, title);
  const zoom = page.getByLabel("Writing zoom", { exact: true });
  await expect(zoom).toHaveValue("100");
  await expect(zoom.locator("option")).toHaveText([
    "50%",
    "60%",
    "70%",
    "75%",
    "80%",
    "90%",
    "100%",
    "110%",
    "125%",
    "150%",
    "175%",
    "200%",
  ]);
  const blocks = [
    editor.locator("h1"),
    editor.locator(":scope > p").first(),
    editor.locator("h2"),
  ];
  const expectedPoints = [23, 11, 17];
  const at100 = await Promise.all(blocks.map(appearance));
  const footer100 = await page.locator(".editor-footer").boundingBox();
  const document100 = await savedDocument(page, title);
  const serialized100 = JSON.stringify(document100);
  for (const points of expectedPoints)
    expect(serialized100).toContain(`"fontSize":"${points}pt"`);

  await zoom.selectOption("80");
  const at80 = await Promise.all(blocks.map(appearance));
  for (const [index, reduced] of at80.entries()) {
    expect(reduced.fontFamily).toContain("Arial");
    expect(reduced.fontSize).toBeCloseTo((expectedPoints[index] * 4) / 3, 1);
    expect(reduced.fontWeight).toBe(at100[index].fontWeight);
    expect(reduced.glyphWidth / at100[index].glyphWidth).toBeCloseTo(0.8, 2);
    expect(reduced.glyphHeight / at100[index].glyphHeight).toBeCloseTo(0.8, 1);
    expect(reduced.lineHeight / at100[index].lineHeight).toBeCloseTo(0.8, 1);
  }
  expect(await page.locator(".editor-footer").boundingBox()).toEqual(footer100);
  await expectPaperFits(page);
  expect(await savedDocument(page, title)).toEqual(document100);
  expect(
    await page.evaluate(() => localStorage.getItem("codebook.writingZoom")),
  ).toBe("80");
  // Larger zoom must also reflow into the available writing pane.
  await zoom.selectOption("125");
  await expectPaperFits(page);
  await zoom.selectOption("80");
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(zoom).toHaveValue("80");
  expect(await savedDocument(page, title)).toEqual(document100);
  const reopened = await Promise.all(blocks.map(appearance));
  for (const [index, value] of reopened.entries()) {
    expect(value.fontSize).toBeCloseTo((expectedPoints[index] * 4) / 3, 1);
    expect(value.glyphWidth).toBeCloseTo(at80[index].glyphWidth, 1);
  }
  await expectPaperFits(page);
  await page.screenshot({
    path: "test-results/writing-zoom-80.png",
    fullPage: true,
  });
});

async function clickTextAndAppend(page: Page, target: Locator, suffix: string) {
  await target.scrollIntoViewIfNeeded();
  const point = await target.evaluate((element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let last: Node | null = null;
    let current: Node | null;
    while ((current = walker.nextNode())) {
      if (current.textContent?.length) last = current;
    }
    const range = document.createRange();
    range.setStart(last!, last!.textContent!.length - 1);
    range.setEnd(last!, last!.textContent!.length);
    const rect = range.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.75, y: rect.top + rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  expect(
    await target.evaluate((element) =>
      element.contains(window.getSelection()?.anchorNode || null),
    ),
  ).toBe(true);
  await page.keyboard.press("End");
  await page.keyboard.type(suffix);
  await expect(target).toContainText(suffix);
}

test("prose, table cells, and highlighted code remain editable by mouse at 80% writing zoom", async ({
  page,
}) => {
  const title = "Zoomed editing";
  const editor = await createAndPaste(
    page,
    title,
    sourceHTML +
      "<table><tr><th><p>System</p></th><th><p>Status</p></th></tr><tr><td><p>World</p></td><td><p>Ready</p></td></tr></table>" +
      '<pre data-filename="zoom.py"><code class="language-python">print("hello")</code></pre>',
  );
  await page.getByLabel("Writing zoom", { exact: true }).selectOption("80");
  const prose = editor
    .locator(":scope > p")
    .filter({ hasText: "A zoomed manuscript remains editable." });
  await clickTextAndAppend(page, prose, " Added by mouse.");
  const cell = editor.locator("td p").filter({ hasText: "World" });
  await clickTextAndAppend(page, cell, " updated");
  await expect(
    page.getByRole("button", { name: "Add row", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(editor.locator("table tr")).toHaveCount(3);
  const code = editor.locator(".code-body code");
  await clickTextAndAppend(page, code, " # edited");
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "python",
  );
  await expect(page.getByLabel("Code filename", { exact: true })).toHaveValue(
    "zoom.py",
  );
  await expect(editor.locator(".hljs-string")).toHaveText('"hello"');
  await expectPaperFits(page);
  await expect
    .poll(async () => JSON.stringify(await savedDocument(page, title)))
    .toContain("# edited");
  const saved = await savedDocument(page, title);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(page.getByLabel("Writing zoom", { exact: true })).toHaveValue(
    "80",
  );
  await expect(editor).toContainText("Added by mouse.");
  await expect(
    editor.locator("td p").filter({ hasText: "World updated" }),
  ).toBeVisible();
  await expect(editor.locator("table tr")).toHaveCount(3);
  await expect(code).toHaveText('print("hello") # edited');
  expect(await savedDocument(page, title)).toEqual(saved);
});
