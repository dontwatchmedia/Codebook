import { expect, test, type Page } from "@playwright/test";
import { makeBook, makeChapter, type Book } from "../../src/model";

function fixture() {
  const book = makeBook("Compact outline workspace", "bible");
  const parent = makeChapter("Overview");
  const child = makeChapter("Nested system", parent.id);
  const grandchild = makeChapter("Deep feature", child.id);
  const other = makeChapter("Other system");
  const otherChild = makeChapter("Other feature", other.id);
  book.nodes = [
    parent,
    child,
    grandchild,
    other,
    otherChild,
    ...Array.from({ length: 36 }, (_, index) =>
      makeChapter(`Extra section ${index + 1}`),
    ),
  ];
  for (const node of book.nodes)
    if (node.type === "chapter") {
      node.emoji = "🌳";
      node.document = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: `${node.title} has useful writing that should remain unchanged while arranging the outline.`,
              },
            ],
          },
        ],
      };
    }
  return { book, parent, child, grandchild };
}

async function openFixture(page: Page, book: Book) {
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("codebook.library.v1", JSON.stringify([book]));
    localStorage.setItem("codebook.theme", "white");
    localStorage.setItem("codebook.writingZoom", "80");
  }, book);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(page.locator(".outline-panel")).toBeVisible();
}

function row(page: Page, title: string) {
  return page
    .locator(".chapter-row")
    .filter({
      has: page
        .locator(".outline-title")
        .filter({ hasText: new RegExp(`^${title}$`) }),
    });
}

test("Ctrl+wheel zooms outline text and emoji independently, ordinary wheel scrolls, and the chosen size survives reopening", async ({
  page,
}) => {
  const { book } = fixture();
  await openFixture(page, book);
  const outlineTitle = page.locator(".outline-title").first();
  const emoji = page.locator(".outline-emoji-trigger").first();
  const font = () =>
    outlineTitle.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    );
  const initial = await font();
  const initialEmoji = await emoji.evaluate((element) =>
    parseFloat(getComputedStyle(element).fontSize),
  );
  const writing = await page
    .locator(".manuscript p")
    .evaluate((element) => getComputedStyle(element).fontSize);
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    ratio: devicePixelRatio,
  }));
  await outlineTitle.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (110%)",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(font).toBeCloseTo(initial * 1.1, 1);
  expect(
    await emoji.evaluate((element) =>
      parseFloat(getComputedStyle(element).fontSize),
    ),
  ).toBeCloseTo(initialEmoji * 1.1, 1);
  expect(
    await page
      .locator(".manuscript p")
      .evaluate((element) => getComputedStyle(element).fontSize),
  ).toBe(writing);
  await expect(page.getByLabel("Writing zoom", { exact: true })).toHaveValue(
    "80",
  );
  expect(
    await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio })),
  ).toEqual(viewport);
  await page.locator(".outline-tree").hover();
  await page.mouse.wheel(0, 650);
  await expect
    .poll(() =>
      page.locator(".outline-tree").evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (110%)",
      exact: true,
    }),
  ).toBeVisible();

  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (110%)",
      exact: true,
    }),
  ).toBeVisible();
  await expect.poll(font).toBeCloseTo(initial * 1.1, 1);
  await page
    .getByRole("button", {
      name: "Reset outline text size (110%)",
      exact: true,
    })
    .click();
  await expect.poll(font).toBeCloseTo(initial, 1);
  for (let index = 0; index < 10; index++)
    await page
      .getByRole("button", { name: "Larger outline text", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Larger outline text", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (200%)",
      exact: true,
    }),
  ).toBeVisible();
  for (let index = 0; index < 12; index++)
    await page
      .getByRole("button", { name: "Smaller outline text", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Smaller outline text", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (80%)",
      exact: true,
    }),
  ).toBeVisible();
});

test("compact header and rows leave more room, while the footer hides its tools but retains word and page totals", async ({
  page,
}) => {
  const { book, parent, child } = fixture();
  await page.setViewportSize({ width: 960, height: 650 });
  await openFixture(page, book);
  const back = (await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .boundingBox())!;
  const title = (await page.locator(".outline-panel-title").boundingBox())!;
  expect(title.x).toBeGreaterThan(back.x + back.width);
  expect(
    Math.abs(title.y + title.height / 2 - (back.y + back.height / 2)),
  ).toBeLessThan(3);
  expect(
    (await page.locator(".outline-row[data-depth='0']").first().boundingBox())!
      .height,
  ).toBeLessThanOrEqual(30);
  expect(
    (await page.locator(".outline-row[data-depth='1']").first().boundingBox())!
      .height,
  ).toBeLessThanOrEqual(30);
  await expect(
    page.getByRole("button", { name: "Add section", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: ".cache/outline-panel-expanded.png" });
  const initialTreeHeight = (await page.locator(".outline-tree").boundingBox())!
    .height;
  await page
    .getByRole("button", { name: "Hide outline tools", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add section", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Import sections", exact: true }),
  ).toBeHidden();
  await expect(page.locator(".outline-footer-stats")).toBeVisible();
  await expect(page.locator(".outline-footer-stats")).toContainText(/words/i);
  await expect(page.locator(".outline-footer-stats")).toContainText(/page/i);
  await page.screenshot({ path: ".cache/outline-panel-collapsed.png" });
  expect(
    (await page.locator(".outline-tree").boundingBox())!.height,
  ).toBeGreaterThan(initialTreeHeight + 100);
  await row(page, child.title).click();
  await expect(row(page, child.title)).toHaveAttribute("aria-current", "page");
  await row(page, parent.title).click();
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show outline tools", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add section", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Show outline tools", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add section", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(960);
});

test("collapse and expand all preserve nested writing, remember branches, and keep individual toggles working", async ({
  page,
}) => {
  const { book, child, grandchild } = fixture();
  await openFixture(page, book);
  await expect(row(page, grandchild.title)).toBeVisible();
  await page
    .getByRole("button", { name: "Collapse all sections", exact: true })
    .click();
  await expect(row(page, child.title)).toBeHidden();
  await expect(row(page, grandchild.title)).toBeHidden();
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(row(page, child.title)).toBeHidden();
  await page
    .getByRole("button", { name: "Expand Overview", exact: true })
    .click();
  await expect(row(page, child.title)).toBeVisible();
  await expect(row(page, grandchild.title)).toBeHidden();
  await page
    .getByRole("button", { name: "Expand all sections", exact: true })
    .click();
  await expect(row(page, grandchild.title)).toBeVisible();
  const saved = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("codebook.library.v1") || "[]").find(
        (book: Book) => book.id === id,
      ),
    book.id,
  );
  expect(saved).toEqual(book);
});
