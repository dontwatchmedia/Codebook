import { test, expect } from "@playwright/test";

const themes = [
  { id: "light", scheme: "light", background: "rgb(248, 248, 244)" },
  { id: "white", scheme: "light", background: "rgb(248, 250, 253)" },
  { id: "sepia", scheme: "light", background: "rgb(241, 234, 220)" },
  { id: "dark", scheme: "dark", background: "rgb(28, 37, 32)" },
  { id: "midnight", scheme: "dark", background: "rgb(17, 27, 44)" },
  { id: "ocean", scheme: "light", background: "rgb(239, 246, 250)" },
  { id: "rose", scheme: "light", background: "rgb(251, 244, 247)" },
  { id: "lavender", scheme: "light", background: "rgb(245, 243, 251)" },
];

test("all eight color themes apply to the bookshelf and persist into the editor", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", {
    name: "Color theme",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toHaveCount(8);
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

test("White uses pure white paper, neutral panels, and blue controls across saved sessions", async ({
  page,
}) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", {
    name: "Color theme",
    exact: true,
  });
  await picker.selectOption("white");
  await expect(page.locator(".library")).toHaveCSS(
    "background-color",
    "rgb(248, 250, 253)",
  );
  await expect(page.locator(".library-rail")).toHaveCSS(
    "background-color",
    "rgb(241, 243, 244)",
  );
  await expect(page.locator(".rail-item.selected")).toHaveCSS(
    "background-color",
    "rgb(232, 240, 254)",
  );
  await page.reload();
  await expect(picker).toHaveValue("white");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(picker).toHaveValue("white");
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".structure")).toHaveCSS(
    "background-color",
    "rgb(241, 243, 244)",
  );
  await expect(page.locator(".manuscript")).toHaveCSS(
    "color",
    "rgb(32, 33, 36)",
  );
  await expect(page.locator(".outline-row.outline-current")).toHaveCSS(
    "background-color",
    "rgb(232, 240, 254)",
  );
  await expect(page.locator(".chapter-row.current")).toHaveCSS(
    "color",
    "rgb(26, 115, 232)",
  );
  await expect(
    page.getByRole("button", { name: "Export", exact: true }),
  ).toHaveCSS("background-color", "rgb(26, 115, 232)");
  await expect(page.locator(".code-block")).toHaveCSS(
    "background-color",
    "rgb(248, 249, 250)",
  );
  await expect(page.locator(".code-header")).toHaveCSS(
    "background-color",
    "rgb(241, 243, 244)",
  );
  await expect(page.locator(".code-body pre")).toHaveCSS(
    "color",
    "rgb(60, 64, 67)",
  );
  await expect(page.locator(".manuscript aside")).toHaveCSS(
    "background-color",
    "rgb(248, 249, 250)",
  );
  await expect(page.locator(".manuscript aside")).toHaveCSS(
    "color",
    "rgb(32, 33, 36)",
  );
  await expect(page.locator(".notes-section textarea")).toHaveCSS(
    "background-color",
    "rgb(248, 249, 250)",
  );
  await expect(page.locator(".notes-section textarea")).toHaveCSS(
    "color",
    "rgb(32, 33, 36)",
  );
  const selectionStyle = await page
    .locator(".manuscript p")
    .first()
    .evaluate((paragraph) => {
      const style = getComputedStyle(paragraph, "::selection");
      return { background: style.backgroundColor, color: style.color };
    });
  expect(selectionStyle).toEqual({
    background: "rgb(194, 215, 250)",
    color: "rgb(32, 33, 36)",
  });
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: ".cache/theme-colors-results/white-editor.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "White", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sepia", exact: true }).click();
  await page.getByRole("button", { name: "White", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(picker).toHaveValue("white");
  await page.reload();
  await expect(picker).toHaveValue("white");
});
