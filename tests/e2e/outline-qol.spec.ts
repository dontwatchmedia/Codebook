import { expect, test, type Page } from "@playwright/test";

async function openSample(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page
    .locator(".chapter-row")
    .filter({ hasText: "Hello, World!" })
    .click();
}

test("outline titles rename in place with Enter, Escape, blur, and F2", async ({
  page,
}) => {
  await openSample(page);
  const manuscript = await page.locator(".tiptap").textContent();
  await page
    .locator(".outline-title")
    .filter({ hasText: "Hello, World!" })
    .dblclick();
  const input = page.getByRole("textbox", {
    name: "Rename chapter Hello, World!",
    exact: true,
  });
  await expect(input).toBeFocused();
  expect(
    await input.evaluate(
      (element: HTMLInputElement) =>
        element.selectionEnd! - element.selectionStart!,
    ),
  ).toBe("Hello, World!".length);
  expect(
    await input.evaluate((element) =>
      element.closest(".chapter-row")?.getAttribute("draggable"),
    ),
  ).toBeNull();
  await input.fill("  Getting started  ");
  await input.press("Enter");
  await expect(page.getByLabel("Chapter title", { exact: true })).toHaveValue(
    "Getting started",
  );
  const row = page
    .locator(".chapter-row")
    .filter({ hasText: "Getting started" });
  await row.focus();
  await row.press("F2");
  await page
    .getByRole("textbox", {
      name: "Rename chapter Getting started",
      exact: true,
    })
    .fill("Discard this");
  await page.keyboard.press("Escape");
  await expect(row).toBeVisible();
  await expect(page.getByLabel("Chapter title", { exact: true })).toHaveValue(
    "Getting started",
  );
  await row.focus();
  await row.press("F2");
  await page
    .getByRole("textbox", {
      name: "Rename chapter Getting started",
      exact: true,
    })
    .fill("   ");
  await page.keyboard.press("Enter");
  await expect(row).toBeVisible();
  await row.dblclick();
  await page
    .getByRole("textbox", {
      name: "Rename chapter Getting started",
      exact: true,
    })
    .fill("Introduction");
  await page.locator(".tiptap").click();
  await expect(page.getByLabel("Chapter title", { exact: true })).toHaveValue(
    "Introduction",
  );
  await expect(page.locator(".tiptap")).toHaveText(manuscript!);
  await page
    .locator(".part-name")
    .filter({ hasText: "Fundamentals" })
    .dblclick();
  await page
    .getByRole("textbox", { name: "Rename part Fundamentals", exact: true })
    .fill("Foundations");
  await page.keyboard.press("Enter");
  await expect(
    page.locator(".part-name").filter({ hasText: "Foundations" }),
  ).toBeVisible();
  await page.locator(".project-title-button").dblclick();
  await page
    .getByRole("textbox", { name: "Rename project", exact: true })
    .fill("Learning C++ revised");
  await page.keyboard.press("Enter");
  await expect(page.locator(".project-title-button")).toHaveText(
    "Learning C++ revised",
  );
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++ revised", exact: true })
    .click();
  await expect(
    page.locator(".part-name").filter({ hasText: "Foundations" }),
  ).toBeVisible();
  await page
    .locator(".chapter-row")
    .filter({ hasText: "Introduction" })
    .click();
  await expect(page.locator(".tiptap")).toHaveText(manuscript!);
});

test("chapter emoji choices keep the number, support custom emoji, and persist", async ({
  page,
}) => {
  await openSample(page);
  const trigger = page.getByRole("button", {
    name: "Emoji for Hello, World!",
    exact: true,
  });
  await trigger.click();
  await page.getByRole("button", { name: "✅ Complete", exact: true }).click();
  await expect(trigger).toHaveText("✅");
  await expect(
    page
      .locator(".chapter-row")
      .filter({ hasText: "Hello, World!" })
      .locator(".chapter-number"),
  ).toHaveText("01");
  await trigger.click();
  await page
    .getByRole("textbox", { name: "Custom section emoji", exact: true })
    .fill("some text");
  await expect(
    page.getByRole("button", { name: "Use", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Custom section emoji", exact: true })
    .fill("👨‍👩‍👧‍👦");
  await page.getByRole("button", { name: "Use", exact: true }).click();
  await expect(trigger).toHaveText("👨‍👩‍👧‍👦");
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(trigger).toHaveText("👨‍👩‍👧‍👦");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Choose section emoji" }),
  ).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator(".tiptap").click();
  await expect(
    page.getByRole("dialog", { name: "Choose section emoji" }),
  ).toHaveCount(0);
  await trigger.click();
  await page.getByRole("button", { name: "Clear emoji", exact: true }).click();
  await expect(trigger).not.toHaveText("👨‍👩‍👧‍👦");
});

test("system bible sections can rename and pick emoji without changing their tree", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New system bible", exact: true })
    .click();
  await page.getByLabel("Project title").fill("Outline quality of life");
  await page
    .getByRole("button", { name: "Create system bible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add child to Overview", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("World");
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  await page.locator(".outline-title").filter({ hasText: "World" }).dblclick();
  await page
    .getByRole("textbox", { name: "Rename section World", exact: true })
    .fill("Living world");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
    "Living world",
  );
  await page
    .getByRole("button", { name: "Emoji for Living world", exact: true })
    .click();
  await page.getByRole("button", { name: "🌍 World", exact: true }).click();
  await expect(
    page
      .locator('.outline-row[data-depth="1"]')
      .filter({ hasText: "Living world" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse Overview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Emoji for Living world", exact: true }),
  ).toHaveCount(0);
  const overview = page.locator(".chapter-row").filter({ hasText: "Overview" });
  await overview.focus();
  await overview.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Emoji for Living world", exact: true }),
  ).toHaveText("🌍");
  await overview.press("ArrowDown");
  await expect(
    page.locator(".chapter-row").filter({ hasText: "Living world" }),
  ).toBeFocused();
});
