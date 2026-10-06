import { expect, test, type Locator, type Page } from "@playwright/test";
import type { JSONContent } from "@tiptap/core";
import type { Book, Chapter } from "../../src/model";

const paragraphAttributes = {
  fontFamily: null,
  fontSize: null,
  lineHeight: null,
  textAlign: null,
  color: null,
  backgroundColor: null,
  marginTop: null,
  marginBottom: null,
  marginLeft: null,
  marginRight: null,
  textIndent: null,
  paddingLeft: null,
};

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    attrs: { ...paragraphAttributes },
    content: [{ type: "text", text }],
  };
}

function searchFixture(mode: "book" | "bible" = "book"): Book {
  const timestamp = "2026-01-01T00:00:00.000Z";
  const sections: [string, string, string | null, JSONContent[]][] = [
    [
      "world",
      "World lore",
      null,
      [paragraph("A moon rises over the quiet valley.")],
    ],
    [
      "city",
      "City systems",
      "world",
      [paragraph("City design has its own independent writing.")],
    ],
    [
      "residents",
      "Residents",
      "city",
      [paragraph("Residents watch the MOON from their homes.")],
    ],
    [
      "gameplay",
      "Gameplay",
      null,
      [
        {
          type: "paragraph",
          attrs: { ...paragraphAttributes },
          content: [
            { type: "text", text: "A gentle " },
            { type: "text", text: "mo", marks: [{ type: "bold" }] },
            { type: "text", text: "on follows paths. First Moon appears." },
            { type: "hardBreak" },
            { type: "text", text: "Final MOON nearby." },
          ],
        },
        ...Array.from({ length: 60 }, (_, index) =>
          paragraph(
            `Design paragraph ${index + 1} describes everyday activities and independent player choices.`,
          ),
        ),
        paragraph("A distant moon at the bottom of this chapter."),
      ],
    ],
    [
      "appendix",
      "Appendix",
      null,
      [paragraph("Independent reference writing without the searched phrase.")],
    ],
  ];
  return {
    version: 1,
    ...(mode === "bible" ? { mode } : {}),
    id: `search-${mode}`,
    title:
      mode === "book" ? "Search navigation book" : "Search navigation bible",
    subtitle: "A generic search test workspace",
    author: "Example author",
    description: "",
    language: "en-US",
    created: timestamp,
    modified: timestamp,
    goal: mode === "bible" ? 0 : 50000,
    color: "#314d43",
    nodes: sections.map(([id, title, parentId, content]) => ({
      id,
      title,
      parentId,
      type: "chapter" as const,
      kind: "chapter" as const,
      status: "Draft" as const,
      progress: "in-progress" as const,
      icon: "document" as const,
      goal: mode === "bible" ? 0 : 2000,
      tags: "",
      notes: "",
      document: { type: "doc", content },
      created: timestamp,
      modified: timestamp,
    })),
  };
}

function chapterRow(page: Page, title: string) {
  return page.locator(".chapter-row").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
}

function resultButton(page: Page, title: string, occurrence: number) {
  return page.getByRole("button", {
    name: new RegExp(`^${title}, match ${occurrence}:`),
  });
}

function searchInput(page: Page, mode: "book" | "bible" = "book") {
  return page.getByRole("textbox", {
    name: mode === "book" ? "Find in book" : "Find in system bible",
    exact: true,
  });
}

const activeMatch = (page: Page) => page.locator(".search-match.is-active");
const counter = (page: Page) =>
  page.getByRole("status", { name: "Search match count", exact: true });

async function activeText(page: Page) {
  return activeMatch(page).evaluateAll((elements) =>
    elements.map((element) => element.textContent).join(""),
  );
}

async function expectMatch(page: Page, chapterTitle: string, text: string) {
  await expect(page.locator(".breadcrumb strong")).toHaveText(chapterTitle);
  await expect.poll(() => activeText(page)).toBe(text);
}

async function openFixture(page: Page, mode: "book" | "bible" = "book") {
  const book = searchFixture(mode);
  await page.addInitScript((project) => {
    if (!localStorage.getItem("codebook.library.v1")) {
      localStorage.setItem("codebook.initialized", "true");
      localStorage.setItem("codebook.library.v1", JSON.stringify([project]));
    }
  }, book);
  await page.goto("/");
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await chapterRow(page, "Gameplay").click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("Gameplay");
  return book;
}

async function storedBook(page: Page, title: string): Promise<Book> {
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    ) as Book[];
    return books.find((book) => book.title === wanted)!;
  }, title);
}

function chapterDocument(book: Book, id: string) {
  return (book.nodes.find((node) => node.id === id) as Chapter).document;
}

function plainText(node: JSONContent): string {
  return node.text || node.content?.map(plainText).join("") || "";
}

test("Ctrl+F finds the first current-chapter match, traverses real split-mark and hard-break positions, and wraps without stealing typing focus", async ({
  page,
}) => {
  const book = await openFixture(page);
  await page.keyboard.press("Control+f");
  const find = searchInput(page);
  await expect(find).toBeFocused();
  await find.fill("moon");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expect(counter(page)).toContainText("3 chapters");
  await expectMatch(page, "Gameplay", "moon");
  // The first logical match spans bold and plain text rather than one text node.
  await expect(activeMatch(page)).toHaveCount(2);
  await expect(find).toBeFocused();
  expect(
    await page
      .locator("section[data-chapter-id] .project-find-heading strong")
      .allTextContents(),
  ).toEqual(["Gameplay", "World lore", "Residents"]);
  await find.press("Enter");
  await expect(counter(page)).toContainText("2 of 6 matches");
  await expectMatch(page, "Gameplay", "Moon");
  await expect(find).toBeFocused();
  await find.press("Shift+Enter");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expectMatch(page, "Gameplay", "moon");
  await find.press("Shift+Enter");
  await expect(counter(page)).toContainText("6 of 6 matches");
  await expectMatch(page, "Residents", "MOON");
  await find.press("Enter");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expectMatch(page, "Gameplay", "moon");
  const traversal: [number, string, string][] = [
    [2, "Gameplay", "Moon"],
    [3, "Gameplay", "MOON"],
    [4, "Gameplay", "moon"],
    [5, "World lore", "moon"],
    [6, "Residents", "MOON"],
    [1, "Gameplay", "moon"],
  ];
  for (const [index, title, text] of traversal) {
    await find.press("Enter");
    await expect(counter(page)).toContainText(`${index} of 6 matches`);
    await expectMatch(page, title, text);
    await expect(find).toBeFocused();
  }
  await page.keyboard.press("Control+f");
  await expect(find).toBeFocused();
  await expect(find).toHaveValue("moon");
  expect(
    await find.evaluate((element: HTMLInputElement) => [
      element.selectionStart,
      element.selectionEnd,
    ]),
  ).toEqual([0, 4]);
  expect((await storedBook(page, book.title)).nodes).toEqual(book.nodes);
});

test("rapid query changes cancel stale results and never replace an older query", async ({
  page,
}) => {
  const original = await openFixture(page);
  await page.keyboard.press("Control+f");
  const find = searchInput(page);
  await find.fill("moon");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await find.fill("Design paragraph");
  await find.fill("nothing-matches-this");
  await expect(
    page.getByRole("button", { name: "Replace", exact: true }),
  ).toBeDisabled();
  await expect(counter(page)).toHaveText("No matches");
  await expect(page.locator("[data-search-match]")).toHaveCount(0);
  await find.fill("Design paragraph");
  await expect(counter(page)).toContainText("60 matches");
  await expect(page.locator(".project-find-group button")).toHaveCount(60);
  await find.fill("moon");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expectMatch(page, "Gameplay", "moon");
  await expect(find).toBeFocused();
  expect(await storedBook(page, original.title)).toEqual(original);
});

test("manual chapter navigation during a pending query keeps the new chapter as the search origin", async ({
  page,
}) => {
  await openFixture(page);
  await page.keyboard.press("Control+f");
  await searchInput(page).fill("moon");
  await chapterRow(page, "Residents").click();
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expectMatch(page, "Residents", "MOON");
  await expect(searchInput(page)).toHaveValue("moon");
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await expectMatch(page, "Gameplay", "moon");
});

test("Enter and Shift+Enter typed before search finishes retain every move and cancel them when the query changes", async ({
  page,
}) => {
  await openFixture(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.keyboard.press("Control+f");
  const find = searchInput(page);
  for (let repeat = 0; repeat < 4; repeat++) {
    await chapterRow(page, "Gameplay").click();
    await find.fill("");
    await expect(counter(page)).toContainText("Search this project’s writing");
    await find.fill("moon");
    // Do not wait for results before sending the user's navigation intent.
    await find.press("Enter");
    await find.press("Enter");
    await expect(counter(page)).toContainText("3 of 6 matches");
    await expectMatch(page, "Gameplay", "MOON");
    await expect(find).toBeFocused();

    await find.fill("mo");
    await find.press("Enter");
    await find.fill("moon");
    await expect(counter(page)).toContainText("1 of 6 matches");
    await expectMatch(page, "Gameplay", "moon");

    await find.fill("");
    await expect(counter(page)).toContainText("Search this project’s writing");
    await find.fill("moon");
    await find.press("Shift+Enter");
    await expect(counter(page)).toContainText("6 of 6 matches");
    await expectMatch(page, "Residents", "MOON");
    await expect(find).toBeFocused();
  }
});

test("reopening Find refreshes cached ranges after editing with the panel closed", async ({
  page,
}) => {
  const original = await openFixture(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const writing = page.getByRole("textbox", {
    name: "Chapter manuscript",
    exact: true,
  });
  for (let repeat = 0; repeat < 4; repeat++) {
    await page.keyboard.press("Control+f");
    await searchInput(page).fill("moon");
    await expect(counter(page)).toContainText("1 of 6 matches");
    await page.getByRole("button", { name: "Close find", exact: true }).click();
    await writing.press("Control+Home");
    await page.keyboard.insertText("New introduction. ");
    await expect(writing).toContainText("New introduction. A gentle moon");
    if (repeat < 3) {
      await writing.press("Control+z");
      await expect(writing).not.toContainText("New introduction.");
    }
  }
  await page.keyboard.press("Control+f");
  await expect(searchInput(page)).toHaveValue("moon");
  await expect(counter(page)).toContainText("1 of 6 matches");
  await expectMatch(page, "Gameplay", "moon");
  await page
    .getByRole("textbox", { name: "Replace with", exact: true })
    .fill("sun");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(writing).toContainText(
    "New introduction. A gentle sun follows paths.",
  );
  await expect
    .poll(async () =>
      plainText(
        chapterDocument(await storedBook(page, original.title), "gameplay"),
      ),
    )
    .toContain("New introduction. A gentle sun follows paths.");
});

test("grouped bible results reveal collapsed ancestors and preserve the query and each section's last match during manual navigation", async ({
  page,
}) => {
  await openFixture(page, "bible");
  await page
    .getByRole("button", { name: "Collapse City systems", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse World lore", exact: true })
    .click();
  await expect(chapterRow(page, "Residents")).toHaveCount(0);
  await page.keyboard.press("Control+f");
  const find = searchInput(page, "bible");
  await find.fill("moon");
  const residents = page.locator('section[data-chapter-id="residents"]');
  await expect(residents).toContainText("World lore / City systems");
  await expect(resultButton(page, "Residents", 1)).toContainText("MOON");
  await resultButton(page, "Residents", 1).click();
  await expectMatch(page, "Residents", "MOON");
  await expect(chapterRow(page, "City systems")).toBeVisible();
  await expect(chapterRow(page, "Residents")).toBeVisible();
  await expect(find).toHaveValue("moon");
  await chapterRow(page, "Gameplay").click();
  await expectMatch(page, "Gameplay", "moon");
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await expectMatch(page, "Gameplay", "Moon");
  await chapterRow(page, "World lore").click();
  await expectMatch(page, "World lore", "moon");
  await expect(find).toBeVisible();
  await expect(find).toHaveValue("moon");
  await chapterRow(page, "Gameplay").click();
  await expectMatch(page, "Gameplay", "Moon");
  // The header action opens the same query and leaves writing visible.
  await page
    .locator(".header-actions")
    .getByRole("button", { name: /^Search/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(find).toBeFocused();
  await expect(find).toHaveValue("moon");
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toBeVisible();
  await find.fill("not present anywhere");
  await expect(counter(page)).toContainText("No matches");
  for (const name of [
    "Previous match",
    "Next match",
    "Replace",
    "Replace all in section",
  ])
    await expect(
      page.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await find.fill("");
  await expect(counter(page)).toContainText("Search this project’s writing");
  await expect(activeMatch(page)).toHaveCount(0);
  await page
    .getByRole("button", { name: "Collapse World lore", exact: true })
    .click();
  await page.keyboard.press("Control+Shift+f");
  await page
    .getByRole("textbox", { name: "Search book", exact: true })
    .fill("Residents watch");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Residents/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(find).toHaveValue("Residents watch");
  await expect(counter(page)).toContainText("1 of 1 match");
  await expectMatch(page, "Residents", "Residents watch");
  await expect(chapterRow(page, "Residents")).toBeVisible();
});

test("case-sensitive matching and replacing after hard breaks use the selected occurrence while replace-all stays within the current chapter", async ({
  page,
}) => {
  const original = await openFixture(page);
  await page.keyboard.press("Control+f");
  const find = searchInput(page);
  await find.fill("moon");
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await page.getByRole("button", { name: "Next match", exact: true }).click();
  await expectMatch(page, "Gameplay", "MOON");
  await page
    .getByRole("textbox", { name: "Replace with", exact: true })
    .fill("sun");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect
    .poll(async () =>
      plainText(
        chapterDocument(await storedBook(page, original.title), "gameplay"),
      ),
    )
    .toContain("Final sun nearby.");
  await expect(counter(page)).toContainText("5 matches");
  let saved = await storedBook(page, original.title);
  const firstParagraph = chapterDocument(saved, "gameplay").content![0];
  expect(plainText(firstParagraph)).toBe(
    "A gentle moon follows paths. First Moon appears.Final sun nearby.",
  );
  expect(
    firstParagraph.content!.some((node) => node.type === "hardBreak"),
  ).toBe(true);
  // Matching must change in both result counts and replacement scope.
  await page
    .getByRole("button", { name: "Case sensitive", exact: true })
    .click();
  await expect(counter(page)).toContainText("3 matches");
  const beforeAll = chapterDocument(
    await storedBook(page, original.title),
    "gameplay",
  );
  await page
    .getByRole("button", { name: "Replace all in chapter", exact: true })
    .click();
  await expect
    .poll(async () =>
      plainText(
        chapterDocument(await storedBook(page, original.title), "gameplay"),
      ),
    )
    .toContain(
      "A gentle sun follows paths. First Moon appears.Final sun nearby.",
    );
  saved = await storedBook(page, original.title);
  const document = chapterDocument(saved, "gameplay");
  expect(plainText(document.content![0])).toBe(
    "A gentle sun follows paths. First Moon appears.Final sun nearby.",
  );
  expect(plainText(document.content!.at(-1)!)).toBe(
    "A distant sun at the bottom of this chapter.",
  );
  for (const id of ["world", "city", "residents", "appendix"])
    expect(chapterDocument(saved, id)).toEqual(chapterDocument(original, id));
  await expect(page.locator(".breadcrumb strong")).toHaveText("Gameplay");
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect
    .poll(async () =>
      chapterDocument(await storedBook(page, original.title), "gameplay"),
    )
    .toEqual(beforeAll);
  await page
    .getByRole("button", { name: "Redo (Ctrl+Y)", exact: true })
    .click();
  await expect
    .poll(async () =>
      chapterDocument(await storedBook(page, original.title), "gameplay"),
    )
    .toEqual(document);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${original.title}`, exact: true })
    .click();
  await chapterRow(page, "Gameplay").click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript", exact: true }),
  ).toContainText("Final sun nearby.");
  expect(
    chapterDocument(await storedBook(page, original.title), "gameplay"),
  ).toEqual(document);
});

test("search controls fit a narrow writing pane and a selected result scrolls its actual occurrence into view without losing the query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 650 });
  await openFixture(page);
  const divider = page.getByRole("separator", {
    name: "Resize left panel",
    exact: true,
  });
  await divider.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+f");
  const find = searchInput(page);
  await find.fill("moon");
  const pane = (await page.locator(".editor-column").boundingBox())!;
  const controls: Locator[] = [
    find,
    page.getByRole("textbox", { name: "Replace with", exact: true }),
    page.getByRole("button", { name: "Previous match", exact: true }),
    page.getByRole("button", { name: "Next match", exact: true }),
    page.getByRole("button", { name: "Replace all in chapter", exact: true }),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(pane.x - 1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      pane.x + pane.width + 1,
    );
    expect(bounds.y + bounds.height).toBeLessThan(650);
  }
  await resultButton(page, "Gameplay", 4).click();
  await expect(counter(page)).toContainText("4 of 6 matches");
  await expectMatch(page, "Gameplay", "moon");
  await expect(activeMatch(page)).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      page.locator(".paper-scroll").evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(400);
  await expect(find).toHaveValue("moon");
  await page.screenshot({
    path: test.info().outputPath("narrow-search-jump.png"),
  });
  await chapterRow(page, "World lore").click();
  await chapterRow(page, "Gameplay").click();
  await expect(counter(page)).toContainText("4 of 6 matches");
  await expect(activeMatch(page)).toBeInViewport({ ratio: 1 });
  await page
    .getByRole("button", { name: "Reading preview", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Replace", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Replace all in chapter", exact: true }),
  ).toBeDisabled();
  await expect(find).toHaveValue("moon");
  await find.focus();
  await find.press("Enter");
  await expectMatch(page, "World lore", "moon");
});
