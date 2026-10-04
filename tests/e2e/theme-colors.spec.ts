import { test, expect } from "@playwright/test";

const themes = [
  { id: "light", scheme: "light", background: "rgb(248, 248, 244)" },
  { id: "sepia", scheme: "light", background: "rgb(241, 234, 220)" },
  { id: "dark", scheme: "dark", background: "rgb(28, 37, 32)" },
  { id: "midnight", scheme: "dark", background: "rgb(17, 27, 44)" },
  { id: "ocean", scheme: "light", background: "rgb(239, 246, 250)" },
  { id: "rose", scheme: "light", background: "rgb(251, 244, 247)" },
  { id: "lavender", scheme: "light", background: "rgb(245, 243, 251)" },
];

test("all seven color themes apply to the bookshelf and persist into the editor", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", {
    name: "Color theme",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(7);
  for (const theme of themes) {
    await picker.selectOption(theme.id);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.id);
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-scheme",
      theme.scheme,
    );
    await expect(page.locator("html")).toHaveCSS("color-scheme", theme.scheme);
    await expect(page.locator(".library")).toHaveCSS(
      "background-color",
      theme.background,
    );
    expect(
      await page.evaluate(() => localStorage.getItem("codebook.theme")),
    ).toBe(theme.id);
  }
  await picker.selectOption("midnight");
  await page.reload();
  await expect(picker).toHaveValue("midnight");
  await expect(
    page.getByRole("button", { name: "Switch to light mode", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(picker).toHaveValue("midnight");
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(24, 37, 59)",
  );
  await expect(page.locator(".code-block")).toHaveCSS(
    "background-color",
    "rgb(27, 43, 67)",
  );
  await expect(page.locator(".code-header")).toHaveCSS(
    "background-color",
    "rgb(34, 54, 82)",
  );
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toHaveCSS("background-color", "rgb(54, 93, 149)");
  await expect(page.locator(".brand")).toHaveCSS("color", "rgb(166, 200, 250)");
  await page.screenshot({
    path: ".cache/theme-colors-results/midnight-editor.png",
    fullPage: true,
  });
  await picker.selectOption("rose");
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(255, 251, 253)",
  );
  await expect(page.locator(".code-block")).toHaveCSS(
    "background-color",
    "rgb(246, 234, 240)",
  );
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toHaveCSS("background-color", "rgb(138, 62, 96)");
  await expect(page.locator(".brand")).toHaveCSS("color", "rgb(141, 66, 101)");
  await page.screenshot({
    path: ".cache/theme-colors-results/rose-editor.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Ocean", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocean");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(picker).toHaveValue("ocean");
  await page.reload();
  await expect(picker).toHaveValue("ocean");
});
