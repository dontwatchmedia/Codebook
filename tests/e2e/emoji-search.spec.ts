import { expect, test, type Page } from "@playwright/test";
import type { Book } from "../../src/model";

const pickerName = "Choose section emoji";

async function openSample(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page
    .locator(".chapter-row")
    .filter({ hasText: "Hello, World!" })
    .click();
  return page.getByRole("button", {
    name: "Emoji for Hello, World!",
    exact: true,
  });
}

async function savedBook(page: Page, title: string) {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  return page.evaluate((projectTitle) => {
    const projects = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    ) as Book[];
    return projects.find((project) => project.title === projectTitle)!;
  }, title);
}

function durableContent(book: Book) {
  return book.nodes.map((node) => {
    if (node.type === "part") return node;
    const { emoji: _emoji, modified: _modified, ...content } = node;
    return content;
  });
}

test("emoji search reaches the full catalog by keyword, prefix, multiple words, and glyph", async ({
  page,
}) => {
  const trigger = await openSample(page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: pickerName, exact: true });
  const search = dialog.getByRole("searchbox", {
    name: "Search emojis",
    exact: true,
  });
  const choices = dialog.locator(".emoji-choice");
  const initialCount = await choices.count();
  expect(initialCount).toBeGreaterThan(25);
  expect(initialCount).toBeLessThanOrEqual(100);
  await expect(search).toBeFocused();
  await expect(
    dialog.getByRole("button", { name: "🐉 Dragon", exact: true }),
  ).toHaveCount(0);
  await search.fill("done");
  await expect(choices.first()).toHaveAccessibleName("✅ Complete");
  await search.fill("DRAG");
  await expect(
    dialog.getByRole("button", { name: "🐉 Dragon", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "✅ Complete", exact: true }),
  ).toHaveCount(0);
  await search.fill("polar bear");
  await expect(
    dialog.getByRole("button", { name: "🐻‍❄️ Polar bear", exact: true }),
  ).toBeVisible();
  await search.fill("scientist");
  await expect(
    dialog.getByRole("button", { name: "🧑‍🔬 Scientist", exact: true }),
  ).toBeVisible();
  await search.fill("🇺🇸");
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toHaveAccessibleName("🇺🇸 Flag: United States");
  await search.fill("🐉");
  await expect(choices).toHaveCount(1);
  await choices.first().click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toHaveText("🐉");
  await expect(trigger).toBeFocused();
  await savedBook(page, "Learning C++");
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(trigger).toHaveText("🐉");
  await trigger.click();
  await search.fill("🧑🏽‍🔬");
  await expect(choices).toHaveCount(1);
  await expect(choices.first()).toHaveAccessibleName(
    "🧑🏽‍🔬 Scientist: medium skin tone",
  );
  await search.press("Enter");
  await expect(trigger).toHaveText("🧑🏽‍🔬");
  await expect(trigger).toBeFocused();
  const saved = await savedBook(page, "Learning C++");
  expect(
    saved.nodes.find((node) => node.title === "Hello, World!"),
  ).toMatchObject({
    emoji: "🧑🏽‍🔬",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(trigger).toHaveText("🧑🏽‍🔬");
});

test("emoji categories and paging stay within a small window and searches reset when reopened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 650 });
  const trigger = await openSample(page);
  await page.getByLabel("Color theme", { exact: true }).selectOption("white");
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: pickerName, exact: true });
  const category = dialog.getByRole("combobox", {
    name: "Emoji category",
    exact: true,
  });
  const search = dialog.getByRole("searchbox", {
    name: "Search emojis",
    exact: true,
  });
  const choices = dialog.locator(".emoji-choice");
  const initialCount = await choices.count();
  await dialog
    .getByRole("button", { name: "Show more emojis", exact: true })
    .click();
  expect(await choices.count()).toBeGreaterThan(initialCount);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(960);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(650);
  await category.selectOption("food");
  await expect(
    dialog.getByRole("button", { name: "🍕 Pizza", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "✅ Complete", exact: true }),
  ).toHaveCount(0);
  await search.fill("polar bear");
  await expect(choices).toHaveCount(0);
  await category.selectOption("all");
  await expect(
    dialog.getByRole("button", { name: "🐻‍❄️ Polar bear", exact: true }),
  ).toBeVisible();
  await search.fill("there-is-no-such-emoji-92817");
  await expect(choices).toHaveCount(0);
  await expect(dialog.getByRole("status")).toContainText(/no emoji/i);
  await category.selectOption("people");
  await dialog
    .getByRole("button", { name: "Reset emoji filters", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(category).toHaveValue("all");
  await expect(choices).toHaveCount(initialCount);
  await category.selectOption("animals");
  await search.fill("polar bear");
  await expect(choices).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "Clear emoji search", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await expect(category).toHaveValue("animals");
  await expect(
    dialog.getByRole("button", { name: "Clear emoji search", exact: true }),
  ).toHaveCount(0);
  await expect(choices).toHaveCount(initialCount);
  await category.selectOption("people");
  await search.fill("there-is-no-such-emoji-92817");
  await search.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(search).toHaveValue("");
  await expect(category).toHaveValue("all");
  await expect(choices).toHaveCount(initialCount);
  await page.screenshot({
    path: ".cache/emoji-search-results/emoji-search.png",
  });
});

test("emoji search supports keyboard selection while retaining custom and clear controls", async ({
  page,
}) => {
  const trigger = await openSample(page);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: pickerName, exact: true });
  const search = dialog.getByRole("searchbox", {
    name: "Search emojis",
    exact: true,
  });
  const choices = dialog.locator(".emoji-choice");
  await search.press("ArrowDown");
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(choices.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(choices.nth(7)).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(choices.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(choices.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(choices.first()).toBeFocused();
  await search.focus();
  await search.fill("done");
  await search.press("ArrowDown");
  const complete = dialog.getByRole("button", {
    name: "✅ Complete",
    exact: true,
  });
  await expect(complete).toBeFocused();
  await complete.press("Enter");
  await expect(trigger).toHaveText("✅");
  await expect(trigger).toBeFocused();
  await trigger.click();
  const custom = dialog.getByRole("textbox", {
    name: "Custom section emoji",
    exact: true,
  });
  await custom.fill("two ordinary words");
  await expect(
    dialog.getByRole("button", { name: "Use", exact: true }),
  ).toBeDisabled();
  await custom.fill("👨‍👩‍👧‍👦");
  await custom.press("Enter");
  await expect(trigger).toHaveText("👨‍👩‍👧‍👦");
  await trigger.click();
  await dialog
    .getByRole("button", { name: "Clear emoji", exact: true })
    .click();
  await expect(trigger).not.toHaveText("👨‍👩‍👧‍👦");
  await trigger.click();
  await expect(
    dialog.getByRole("button", { name: "Clear emoji", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Close emoji picker", exact: true })
    .click();
  await expect(trigger).toBeFocused();
});

test("searched emoji persists on a nested section without altering its document or hierarchy", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New system bible", exact: true })
    .click();
  await page.getByLabel("Project title").fill("Emoji workspace");
  await page
    .getByRole("button", { name: "Create system bible", exact: true })
    .click();
  let parent = "Overview";
  for (const title of ["World systems", "Creatures", "Dragon behavior"]) {
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
    parent = title;
  }
  await page
    .getByRole("textbox", { name: "Section content", exact: true })
    .fill("Creature behavior stays attached to its nested system.");
  await page
    .getByLabel("NOTES TO SELF")
    .fill("Keep the original design notes.");
  await page
    .getByLabel("Section tags", { exact: true })
    .fill("creature, behavior");
  await page
    .getByLabel("Section progress", { exact: true })
    .selectOption("in-progress");
  await page
    .getByLabel("Section icon", { exact: true })
    .selectOption("gamepad");
  const before = await savedBook(page, "Emoji workspace");
  const trigger = page.getByRole("button", {
    name: "Emoji for Dragon behavior",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: pickerName, exact: true });
  await dialog
    .getByRole("searchbox", { name: "Search emojis", exact: true })
    .fill("🐉");
  await dialog.getByRole("button", { name: "🐉 Dragon", exact: true }).click();
  const after = await savedBook(page, "Emoji workspace");
  expect(durableContent(after)).toEqual(durableContent(before));
  expect(
    after.nodes.find((node) => node.title === "Dragon behavior"),
  ).toMatchObject({
    emoji: "🐉",
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Open Emoji workspace", exact: true })
    .click();
  await page
    .locator(".chapter-row")
    .filter({ hasText: "Dragon behavior" })
    .click();
  await expect(trigger).toHaveText("🐉");
  await expect(
    page
      .locator('.outline-row[data-depth="3"]')
      .filter({ hasText: "Dragon behavior" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toHaveText("Creature behavior stays attached to its nested system.");
  await expect(page.getByLabel("NOTES TO SELF")).toHaveValue(
    "Keep the original design notes.",
  );
  await expect(
    page.getByLabel("Section progress", { exact: true }),
  ).toHaveValue("in-progress");
  await expect(page.getByLabel("Section icon", { exact: true })).toHaveValue(
    "gamepad",
  );
  expect(durableContent(await savedBook(page, "Emoji workspace"))).toEqual(
    durableContent(before),
  );
});
