import { expect, test } from "@playwright/test";

test("compact layout fits more writing while original document spacing and source fonts stay intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Compact writing");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  const layout = page.getByLabel("Writing layout", { exact: true });
  await expect(layout).toHaveValue("compact");
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await editor.focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      "text/html",
      '<p style="font-family:Arial;font-size:11pt;line-height:1.15;margin-bottom:8pt">Opening note</p><p><span style="font-family:Arial;font-size:11pt"><br></span></p><p><span style="font-family:Arial;font-size:11pt"><br></span></p><h2 style="font-family:Arial;font-size:16pt;margin-top:96pt;margin-bottom:12pt">System overview</h2><p style="font-family:Arial;font-size:11pt;line-height:1.15">Normal source writing.</p>',
    );
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  const geometry = () =>
    editor.evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      top: el.getBoundingClientRect().top,
    }));
  const compact = await geometry();
  const blankHeights = await editor
    .locator('p[data-blank-line="true"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  expect(blankHeights).toHaveLength(2);
  for (const height of blankHeights) expect(height).toBeLessThanOrEqual(24);
  await expect(editor.locator("h2")).toHaveCSS("margin-top", "16px");
  await expect(editor.locator("h2")).toHaveCSS("font-size", /21\.33[0-9]*px/);
  await expect(editor.locator("p").last()).toHaveCSS(
    "font-size",
    /14\.66[0-9]*px/,
  );
  await expect(page.locator(".chapter-title")).not.toBeVisible();
  await layout.selectOption("original");
  const original = await geometry();
  await expect(editor.locator("h2")).toHaveCSS("margin-top", "128px");
  await expect(page.locator(".chapter-title")).toBeVisible();
  expect(compact.width).toBeGreaterThan(original.width + 150);
  expect(original.height - compact.height).toBeGreaterThan(90);
  expect(original.top - compact.top).toBeGreaterThan(70);
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const saved = await page.evaluate(() =>
    localStorage.getItem("codebook.library.v1"),
  );
  expect(saved).toContain('"marginTop":"96pt"');
  await layout.selectOption("compact");
  await page.reload();
  await page
    .getByRole("button", { name: "Open Compact writing", exact: true })
    .click();
  await expect(layout).toHaveValue("compact");
  await expect(editor.locator("h2")).toHaveCSS("margin-top", "16px");
  await page.screenshot({
    path: "test-results/compact-workspace.png",
    fullPage: true,
  });
});
