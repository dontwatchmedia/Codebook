import { expect, test, type Page } from "@playwright/test";
import type { Book, Chapter } from "../../src/model";

function fixture(): Book {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const nodes: Chapter[] = Array.from({ length: 1200 }, (_, index) => ({
    id: `chapter-${index}`,
    type: "chapter",
    title: `Chapter ${index}`,
    parentId: null,
    kind: "chapter",
    status: "Draft",
    progress: "in-progress",
    icon: "document",
    tags: "",
    notes: "",
    goal: 0,
    created: timestamp,
    modified: timestamp,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: `Independent writing for chapter ${index}.` },
          ],
        },
      ],
    },
  }));
  nodes.push(
    {
      ...nodes[0],
      id: "hidden-parent",
      title: "Far system",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "System details." }],
          },
        ],
      },
    },
    {
      ...nodes[0],
      id: "hidden-child",
      title: "Deep target",
      parentId: "hidden-parent",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "farawayunique content appears here." },
            ],
          },
        ],
      },
    },
  );
  return {
    version: 1,
    mode: "bible",
    id: "large-outline",
    title: "Large outline",
    subtitle: "",
    author: "",
    description: "",
    language: "en-US",
    created: timestamp,
    modified: timestamp,
    goal: 0,
    color: "#314d43",
    nodes,
  };
}
async function open(page: Page) {
  await page.addInitScript((book) => {
    localStorage.setItem("codebook.library.v1", JSON.stringify([book]));
    localStorage.removeItem("codebook.recovery.v1");
    localStorage.setItem(
      "codebook.outlineCollapsed.v1",
      JSON.stringify([{ bookId: "large-outline", ids: ["hidden-parent"] }]),
    );
  }, fixture());
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Large outline", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("Independent writing for chapter 0.");
}
function row(page: Page, title: string) {
  return page.locator(".chapter-row").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
}
async function saved(page: Page): Promise<Book> {
  return page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("codebook.library.v1") || "[]",
      )[0] as Book,
  );
}

test("large outline keeps a small mounted window and supports far keyboard navigation, renaming, emoji and independent zoom", async ({
  page,
}) => {
  await open(page);
  const tree = page.getByRole("navigation", {
    name: "System bible structure",
    exact: true,
  });
  await expect(tree.locator(".outline-virtual-list")).toHaveCount(1);
  expect(await tree.locator(".chapter-row").count()).toBeLessThan(80);
  await row(page, "Chapter 0").focus();
  await page.keyboard.press("End");
  await expect(row(page, "Far system")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(row(page, "Chapter 1199")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("Independent writing for chapter 1199.");
  await row(page, "Chapter 1199").focus();
  await page.keyboard.press("F2");
  await page
    .getByRole("textbox", { name: "Rename section Chapter 1199", exact: true })
    .fill("Last chapter renamed");
  await page.keyboard.press("Enter");
  await expect(row(page, "Last chapter renamed")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page
    .getByRole("button", {
      name: "Emoji for Last chapter renamed",
      exact: true,
    })
    .click();
  await page
    .getByRole("searchbox", { name: "Search emojis", exact: true })
    .fill("video game");
  await page.getByRole("button", { name: /^🎮/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Emoji for Last chapter renamed",
      exact: true,
    }),
  ).toHaveText("🎮");
  await expect
    .poll(
      async () =>
        (await saved(page)).nodes.find((node) => node.id === "chapter-1199")
          ?.title,
    )
    .toBe("Last chapter renamed");
  await page
    .getByRole("button", { name: "Larger outline text", exact: true })
    .click();
  const countAfterZoom = await tree.locator(".chapter-row").count();
  expect(countAfterZoom).toBeLessThan(80);
  await expect(row(page, "Last chapter renamed")).toBeInViewport();
  await row(page, "Last chapter renamed").focus();
  await page.keyboard.press("Home");
  await expect(row(page, "Chapter 0")).toBeFocused();
  const manuscript = (await saved(page)).nodes.find(
    (node) => node.id === "chapter-1199",
  ) as Chapter;
  expect(manuscript.document.content?.[0].content?.[0].text).toBe(
    "Independent writing for chapter 1199.",
  );
});

test("Escape stops outline edge scrolling even without a native dragend event", async ({
  page,
}) => {
  await open(page);
  const tree = page.getByRole("navigation", {
    name: "System bible structure",
    exact: true,
  });
  await row(page, "Chapter 0").evaluate((element) => {
    const transfer = new DataTransfer();
    (
      window as unknown as { __outlineTransfer: DataTransfer }
    ).__outlineTransfer = transfer;
    element.dispatchEvent(
      new DragEvent("dragstart", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await tree.evaluate((element) => {
    const transfer = (window as unknown as { __outlineTransfer: DataTransfer })
      .__outlineTransfer;
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(
      new DragEvent("dragover", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + 100,
        clientY: bounds.bottom - 10,
      }),
    );
  });
  await expect.poll(() => tree.evaluate((element) => element.scrollTop)).toBeGreaterThan(40);
  await page.keyboard.press("Escape");
  const stoppedAt = await tree.evaluate((element) => element.scrollTop);
  const afterFrames = await tree.evaluate(async (element) => {
    for (let frame = 0; frame < 8; frame++)
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return element.scrollTop;
  });
  expect(afterFrames).toBe(stoppedAt);
  await expect(tree.locator(".outline-root-drop")).not.toHaveClass(/outline-drag-active/);
  expect((await saved(page)).nodes).toEqual(fixture().nodes);
});

test("search reveals and selects an offscreen nested chapter without losing search focus", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press("Control+f");
  const query = page.getByRole("textbox", {
    name: "Find in system bible",
    exact: true,
  });
  await query.fill("farawayunique");
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("farawayunique content appears here.");
  await expect(row(page, "Deep target")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(row(page, "Deep target")).toBeInViewport();
  await expect(query).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Collapse Far system", exact: true }),
  ).toBeVisible();
  expect(await page.locator(".outline-tree .chapter-row").count()).toBeLessThan(
    80,
  );
});

test("virtualized rows retain the dragged source while scrolling and preserve the document when nesting far away", async ({
  page,
}) => {
  await open(page);
  const tree = page.getByRole("navigation", {
    name: "System bible structure",
    exact: true,
  });
  const initial = await saved(page);
  await row(page, "Chapter 0").evaluate((element) => {
    const transfer = new DataTransfer();
    (
      window as unknown as { __outlineTransfer: DataTransfer }
    ).__outlineTransfer = transfer;
    element.dispatchEvent(
      new DragEvent("dragstart", {
        dataTransfer: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await tree.evaluate((element) => {
    element.scrollTop = 18000;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await expect(row(page, "Chapter 650")).toHaveCount(1);
  expect(await row(page, "Chapter 0").count()).toBe(1);
  const target = page.locator('.outline-row[data-outline-id="chapter-650"]');
  await target.evaluate((element) => {
    const transfer = (window as unknown as { __outlineTransfer: DataTransfer })
      .__outlineTransfer;
    const bounds = element.getBoundingClientRect();
    const options = {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + 50,
      clientY: bounds.top + bounds.height / 2,
    };
    element.dispatchEvent(new DragEvent("dragover", options));
    element.dispatchEvent(new DragEvent("drop", options));
  });
  await expect
    .poll(
      async () =>
        (
          (await saved(page)).nodes.find(
            (node) => node.id === "chapter-0",
          ) as Chapter
        ).parentId,
    )
    .toBe("chapter-650");
  const after = await saved(page);
  expect(after.nodes).toHaveLength(initial.nodes.length);
  for (const node of initial.nodes)
    expect(
      (after.nodes.find((item) => item.id === node.id) as Chapter).document,
    ).toEqual((node as Chapter).document);
  await expect(row(page, "Chapter 0")).toHaveAttribute("aria-current", "page");
  await expect(row(page, "Chapter 0")).toBeInViewport();
});
