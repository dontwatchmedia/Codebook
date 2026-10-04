import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function addChild(page: Page, parent: string, title: string) {
  await page
    .getByRole("button", { name: `Add child to ${parent}`, exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill(title);
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    title,
  );
}

test("a system bible keeps deep branches, progress, writing, and portable project copies", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "New system bible", exact: true })
    .click();
  await page.getByLabel("Project title").fill("Open Blue Systems");
  await page
    .getByRole("button", { name: "Create system bible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const content = page.getByRole("textbox", {
    name: "Section content",
    exact: true,
  });
  await content.fill(
    "The overview stays useful while features grow beneath it.",
  );
  await addChild(page, "Overview", "Living City");
  await page.getByLabel("Section icon", { exact: true }).selectOption("users");
  await page
    .getByLabel("Section progress", { exact: true })
    .selectOption("complete");
  await content.fill("Living City design and system boundaries.");
  const chain = [
    "Housing",
    "Interiors",
    "Furniture",
    "Storage",
    "Shelf interaction",
    "Placement rules",
  ];
  let parent = "Living City";
  for (const title of chain) {
    await addChild(page, parent, title);
    parent = title;
  }
  await content.fill("A deeply nested feature has its own durable document.");
  await page.getByLabel("Section icon", { exact: true }).selectOption("hammer");
  await page
    .getByLabel("Section progress", { exact: true })
    .selectOption("blocked");
  await page.getByLabel("Section tags").fill("housing, placement");
  await page
    .getByLabel("NOTES TO SELF")
    .fill("Private implementation reminder.");
  await expect(page.locator('.outline-row[data-depth="7"]')).toBeVisible();
  await expect(
    page
      .getByLabel("Parent section")
      .locator("option")
      .filter({ hasText: "Placement rules" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collapse Living City", exact: true })
    .click();
  await expect(
    page
      .locator(".book-tree .chapter-row")
      .filter({ hasText: "Placement rules" }),
  ).toHaveCount(0);
  // Search opens a document and reveals every collapsed ancestor.
  await page.keyboard.press("Control+Shift+f");
  await page
    .getByRole("textbox", { name: "Search book", exact: true })
    .fill("deeply nested feature");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Placement rules/ })
    .click();
  await expect(
    page
      .locator(".book-tree .chapter-row")
      .filter({ hasText: "Placement rules" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close find", exact: true }).click();
  // Create a sibling subsystem and move a whole branch beneath it.
  await addChild(page, "Overview", "Living Land");
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Housing" })
    .click();
  const landId = await page
    .getByLabel("Parent section")
    .locator("option")
    .filter({ hasText: "Overview / Living Land" })
    .getAttribute("value");
  await page.getByLabel("Parent section").selectOption(landId!);
  await expect(
    page
      .getByLabel("Parent section")
      .locator("option")
      .filter({ hasText: "Interiors" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Open Blue Systems", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Placement rules" })
    .click();
  await expect(content).toContainText("own durable document");
  // Converting a bible with no word goal leaves book settings usable.
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByLabel("Project type").selectOption("book");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toContainText("own durable document");
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByLabel("Project type").selectOption("bible");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(
    page.getByLabel("Section progress", { exact: true }),
  ).toHaveValue("blocked");
  await expect(page.getByLabel("Section icon", { exact: true })).toHaveValue(
    "hammer",
  );
  await expect(page.locator(".breadcrumb")).toContainText("Living Land");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: "test-results/system-bible-dark.png" });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await page.screenshot({ path: "test-results/system-bible-light.png" });
  // Deleting a parent promotes child sections instead of deleting their content.
  await page
    .getByRole("button", { name: "Edit section Housing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete section", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Placement rules" })
    .click();
  await expect(content).toContainText("own durable document");
  await expect(page.locator(".breadcrumb")).not.toContainText("Housing");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /CodeBook project/ }).click();
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  const download = await downloading;
  const project = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(project.mode).toBe("bible");
  expect(
    project.nodes.find((n: { title: string }) => n.title === "Placement rules"),
  ).toMatchObject({ progress: "blocked", icon: "hammer" });
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page.locator('.library input[type="file"]').setInputFiles({
    name: "Open Blue.codebook",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    "Overview",
  );
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Placement rules" })
    .click();
  await expect(content).toContainText("own durable document");
  expect(errors).toEqual([]);
});

test("existing books can become system bibles without losing their content", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  const code = await page.locator(".manuscript pre").first().textContent();
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByLabel("Project type").selectOption("bible");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Section content" }),
  ).toBeVisible();
  await expect(page.locator(".manuscript pre").first()).toHaveText(code!);
  await page
    .getByRole("button", { name: "Book settings", exact: true })
    .click();
  await page.getByLabel("Project type").selectOption("book");
  await page.getByRole("button", { name: "Save details", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toBeVisible();
  await expect(page.locator(".manuscript pre").first()).toHaveText(code!);
});
