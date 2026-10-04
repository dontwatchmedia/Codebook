import { expect, test, type Page } from "@playwright/test";

const sourceHTML =
  '<p style="font-family:Arial;font-size:11pt;line-height:1.38;margin-top:12pt;margin-bottom:12pt"><strong>What could you build here?</strong></p>' +
  '<p style="line-height:1.38;margin-top:0pt;margin-bottom:0pt"></p><hr><p></p>' +
  '<h1 style="font-family:Arial;font-size:23pt;line-height:1.38;margin-top:24pt;margin-bottom:6pt"><strong>The Example Vision</strong></h1>' +
  '<p style="font-family:Arial;font-size:11pt;line-height:1.38">A focused description of the project.</p>';

async function savedDocument(page: Page) {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  return page.evaluate(() => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    );
    const book = books.find(
      (entry: { title: string }) => entry.title === "Divider spacing",
    );
    return book.nodes.find(
      (node: { type: string; kind?: string }) =>
        node.type === "chapter" && node.kind === "chapter",
    ).document;
  });
}

test("compact dividers trim the gaps in existing writing while preserving blank-line editing and source formatting", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Divider spacing");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page.getByLabel("Color theme", { exact: true }).selectOption("white");
  await page.getByLabel("Writing zoom", { exact: true }).selectOption("80");
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.focus();
  await page.evaluate((html) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, sourceHTML);
  await expect
    .poll(async () => JSON.stringify(await savedDocument(page)))
    .toContain("The Example Vision");
  const originalDocument = await savedDocument(page);
  const originalData = JSON.stringify(originalDocument);
  expect(originalData).toContain('"marginTop":"24pt"');
  expect(originalData).toContain('"fontSize":"23pt"');
  await page.reload();
  await page
    .getByRole("button", { name: "Open Divider spacing", exact: true })
    .click();
  await expect(page.getByLabel("Writing zoom", { exact: true })).toHaveValue(
    "80",
  );

  const geometry = () =>
    editor.evaluate((element) => {
      const quote = element.querySelector("p")!.getBoundingClientRect();
      const rule = element.querySelector("hr")!.getBoundingClientRect();
      const heading = element.querySelector("h1")!.getBoundingClientRect();
      return {
        before: rule.top - quote.bottom,
        after: heading.top - rule.bottom,
      };
    });
  await expect(editor.locator("hr")).toHaveCSS("margin-top", "8px");
  await expect(editor.locator("hr")).toHaveCSS("margin-bottom", "8px");
  const compact = await geometry();
  expect(compact.before).toBeLessThanOrEqual(25);
  expect(compact.after).toBeLessThanOrEqual(30);
  await expect(editor.locator('p[data-blank-line="true"]')).toHaveCount(2);
  expect(await savedDocument(page)).toEqual(originalDocument);

  await page
    .getByLabel("Writing layout", { exact: true })
    .selectOption("original");
  await expect(editor.locator("hr")).toHaveCSS("margin-top", "30px");
  await expect(editor.locator("h1")).toHaveCSS("margin-top", "32px");
  const original = await geometry();
  expect(original.before - compact.before).toBeGreaterThan(17);
  expect(original.after - compact.after).toBeGreaterThan(17);
  expect(await savedDocument(page)).toEqual(originalDocument);
  await page
    .getByLabel("Writing layout", { exact: true })
    .selectOption("compact");
  await page.screenshot({
    path: ".cache/divider-results/white-divider-spacing.png",
    fullPage: true,
  });

  // Empty paragraphs are still real editing positions on both sides of the line.
  await editor.locator(":scope > p").nth(1).click();
  await page.keyboard.type("Before the divider.");
  await expect(editor.locator(":scope > p").nth(1)).toHaveText(
    "Before the divider.",
  );
  await editor.locator(":scope > p").nth(2).click();
  await page.keyboard.type("After the divider.");
  await expect(editor.locator(":scope > p").nth(2)).toHaveText(
    "After the divider.",
  );
  await expect(editor.locator('p[data-blank-line="true"]')).toHaveCount(0);
  await expect
    .poll(async () => JSON.stringify(await savedDocument(page)))
    .toContain("After the divider.");
  await page.reload();
  await page
    .getByRole("button", { name: "Open Divider spacing", exact: true })
    .click();
  await expect(editor).toContainText("Before the divider.");
  await expect(editor).toContainText("After the divider.");
  await expect(editor.locator("hr")).toHaveCSS("margin-bottom", "8px");
  await expect(editor.locator("h1")).toHaveCSS("font-size", /30\.66[0-9]*px/);
});
