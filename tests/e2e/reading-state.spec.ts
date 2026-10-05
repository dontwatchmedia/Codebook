import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  makeBook,
  makeChapter,
  type Book,
  type Chapter,
} from "../../src/model";

function longChapter(title: string, parentId: string | null = null): Chapter {
  const chapter = makeChapter(title, parentId);
  chapter.document = {
    type: "doc",
    content: Array.from({ length: 80 }, (_, index) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `${title} paragraph ${index + 1}. Keep this sentence for the remembered reading position and continue the work here.`,
        },
      ],
    })),
  };
  return chapter;
}

function fixture() {
  const book = makeBook("Remembered system reading", "bible");
  const overview = longChapter("Overview");
  const child = longChapter("Nested system", overview.id);
  book.nodes = [overview, child];
  return { book, overview, child };
}

async function seed(page: Page, book: Book) {
  await page.goto("/");
  await page.evaluate((book) => {
    localStorage.setItem("codebook.library.v1", JSON.stringify([book]));
    localStorage.setItem("codebook.layout", "compact");
  }, book);
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section content" }),
  ).toBeVisible();
}

function row(page: Page, title: string) {
  return page.locator(".chapter-row").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
}

async function setPosition(editor: Locator, paragraph: number) {
  await editor.focus();
  await editor.evaluate((element, index) => {
    const target = element.querySelectorAll("p")[index];
    const text = target.firstChild!;
    const start = text.textContent!.indexOf("sentence");
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + "sentence".length);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    target.scrollIntoView({ block: "center", behavior: "instant" });
  }, paragraph);
}

async function scrollTop(page: Page) {
  return page.locator(".paper-scroll").evaluate((element) => element.scrollTop);
}

async function savedPosition(page: Page, bookId: string, chapterId: string) {
  return page.evaluate(
    ({ bookId, chapterId }) => {
      const saved = JSON.parse(
        localStorage.getItem("codebook.readingState.v1") || "null",
      );
      return saved?.positions.find(
        (entry: { bookId: string; chapterId: string }) =>
          entry.bookId === bookId && entry.chapterId === chapterId,
      );
    },
    { bookId, chapterId },
  );
}

async function savedBook(page: Page, bookId: string): Promise<Book> {
  return page.evaluate((id) => {
    return JSON.parse(localStorage.getItem("codebook.library.v1") || "[]").find(
      (book: Book) => book.id === id,
    );
  }, bookId);
}

test("reading, switching sections, and toggling preview never rewrite stored document attributes or modification dates", async ({
  page,
}) => {
  const { book, overview, child } = fixture();
  book.modified = "2026-01-01T12:00:00.000Z";
  overview.modified = book.modified;
  child.modified = book.modified;
  // These valid saved paragraphs intentionally omit optional schema defaults.
  // Merely constructing the editor must not write its normalized JSON to disk.
  overview.document.content![0].attrs = { fontFamily: "Arial" };
  await seed(page, book);
  const editor = page.getByRole("textbox", { name: "Section content" });
  await setPosition(editor, 40);
  await page
    .getByRole("button", { name: "Reading preview", exact: true })
    .click();
  await expect(editor).toHaveAttribute("contenteditable", "false");
  await page
    .getByRole("button", { name: "Reading preview", exact: true })
    .click();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await row(page, child.title).click();
  await setPosition(editor, 20);
  await row(page, overview.title).click();
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await page.keyboard.press("Control+s");
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  expect(await savedBook(page, book.id)).toEqual(book);
});

test("switching between an overview and nested section restores each scroll position and text selection without changing either document", async ({
  page,
}) => {
  const { book, overview, child } = fixture();
  await seed(page, book);
  const editor = page.getByRole("textbox", { name: "Section content" });
  await setPosition(editor, 54);
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(1500);
  const overviewTop = await scrollTop(page);
  await expect
    .poll(
      async () => (await savedPosition(page, book.id, overview.id))?.scrollTop,
    )
    .toBeCloseTo(overviewTop, 0);
  const overviewPosition = await savedPosition(page, book.id, overview.id);
  expect(overviewPosition.head - overviewPosition.anchor).toBe(
    "sentence".length,
  );

  await row(page, child.title).click();
  await expect.poll(() => scrollTop(page)).toBe(0);
  await setPosition(editor, 23);
  const childTop = await scrollTop(page);
  await expect
    .poll(async () => (await savedPosition(page, book.id, child.id))?.scrollTop)
    .toBeCloseTo(childTop, 0);

  await row(page, overview.title).click();
  await expect.poll(() => scrollTop(page)).toBeCloseTo(overviewTop, 0);
  expect(await savedBook(page, book.id)).toMatchObject({
    nodes: [
      { id: overview.id, document: overview.document },
      { id: child.id, document: child.document },
    ],
  });
  await editor.focus();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("sentence");
  await page.keyboard.insertText("passage");
  await expect
    .poll(async () => JSON.stringify((await savedBook(page, book.id)).nodes[0]))
    .toContain("Keep this passage");
  expect((await savedBook(page, book.id)).nodes[1]).toMatchObject({
    document: child.document,
  });

  await row(page, child.title).click();
  await expect.poll(() => scrollTop(page)).toBeCloseTo(childTop, 0);
  await editor.focus();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("sentence");
});

test("reopening a project and reloading the app resumes its last nested section and reading position", async ({
  page,
}) => {
  const { book, child } = fixture();
  await seed(page, book);
  const editor = page.getByRole("textbox", { name: "Section content" });
  await row(page, child.title).click();
  await setPosition(editor, 49);
  const position = await scrollTop(page);
  await expect
    .poll(async () => (await savedPosition(page, book.id, child.id))?.scrollTop)
    .toBeCloseTo(position, 0);
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(row(page, child.title)).toHaveClass(/current/);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(position, 0);

  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  await expect(row(page, child.title)).toHaveClass(/current/);
  await expect.poll(() => scrollTop(page)).toBeCloseTo(position, 0);
  await editor.focus();
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("sentence");
});

test("a remembered caret outside a shortened document is safely clamped", async ({
  page,
}) => {
  const { book, overview } = fixture();
  overview.document = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Shortened section." }],
      },
    ],
  };
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(
    ({ book, chapter }) => {
      localStorage.setItem("codebook.library.v1", JSON.stringify([book]));
      localStorage.setItem(
        "codebook.readingState.v1",
        JSON.stringify({
          version: 1,
          positions: [
            {
              bookId: book.id,
              chapterId: chapter.id,
              anchor: 90000,
              head: 90000,
              scrollTop: 80000,
              scrollLeft: 0,
            },
          ],
          lastChapters: [{ bookId: book.id, chapterId: chapter.id }],
        }),
      );
    },
    { book, chapter: overview },
  );
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${book.title}`, exact: true })
    .click();
  const editor = page.getByRole("textbox", { name: "Section content" });
  await editor.focus();
  await page.keyboard.insertText(" Resumed.");
  await expect(editor).toHaveText("Shortened section. Resumed.");
  expect(errors).toEqual([]);
});
