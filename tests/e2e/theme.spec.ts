import { test, expect } from "@playwright/test";

test("dark mode covers the writing workspace and persists across reloads", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await page.screenshot({
    path: "test-results/dark-bookshelf.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await expect(page.getByLabel("Code language")).toHaveValue("cpp");
  await page.screenshot({
    path: "test-results/dark-editor.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.screenshot({
    path: "test-results/dark-dialog.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  expect(errors).toEqual([]);
});
