import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Book, Chapter } from "../../src/model";

const code = [
  "#include <iostream>",
  "",
  "int main()",
  "{",
  '    std::cout << "Hello, world!\\n";',
  "}",
].join("\n");

const manuscript = [
  "# Systems overview",
  "",
  "A calm **living world** with *seasonal choices* and `state` notes.",
  "",
  "## Core loops",
  "",
  "- Tend the garden",
  "- Explore the coast",
  "",
  "1. Observe the season",
  "2. Choose a useful task",
  "",
  "> The world continues at its own pace.",
  "",
  "| System | State |",
  "| --- | --- |",
  "| Weather | Ready |",
  "| Farming | In progress |",
  "",
  "---",
  "",
  "### Code contract",
  "",
  "```cpp",
  code,
  "```",
  "",
  "See the [design reference](https://example.com/design).",
].join("\n");

function chapterRow(page: Page, title: string) {
  return page.locator(".chapter-row").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
}

function dropRow(page: Page, title: string) {
  return page.locator(".outline-row[data-outline-drop-row]").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
}

async function savedBook(page: Page, title: string): Promise<Book> {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    ) as Book[];
    return books.find((book) => book.title === wanted)!;
  }, title);
}

function chapterNamed(book: Book, title: string): Chapter {
  const node = book.nodes.find((candidate) => candidate.title === title);
  expect(node?.type).toBe("chapter");
  return node as Chapter;
}

async function createProject(
  page: Page,
  title: string,
  mode: "book" | "bible",
) {
  await page.goto("/");
  await page
    .getByRole("button", {
      name: mode === "book" ? "New book" : "New system bible",
      exact: true,
    })
    .click();
  await page
    .getByLabel(mode === "book" ? "Book title" : "Project title", {
      exact: true,
    })
    .fill(title);
  await page
    .getByRole("button", {
      name: mode === "book" ? "Create book" : "Create system bible",
      exact: true,
    })
    .click();
}

async function dropFiles(
  target: Locator,
  files: { name: string; text: string }[],
  position: "before" | "inside" | "after" = "inside",
) {
  await target.scrollIntoViewIfNeeded();
  await target.evaluate(
    (element, input) => {
      const data = new DataTransfer();
      for (const file of input.files)
        data.items.add(
          new File([file.text], file.name, { type: "text/markdown" }),
        );
      const bounds = element.getBoundingClientRect();
      const clientY =
        input.position === "before"
          ? bounds.top + 2
          : input.position === "after"
            ? bounds.bottom - 2
            : bounds.top + bounds.height / 2;
      for (const type of ["dragover", "drop"]) {
        element.dispatchEvent(
          new DragEvent(type, {
            dataTransfer: data,
            clientX: bounds.left + bounds.width / 2,
            clientY,
            bubbles: true,
            cancelable: true,
          }),
        );
      }
    },
    { files, position },
  );
}

async function moveByPointer(
  page: Page,
  sourceTitle: string,
  targetTitle: string,
  position: "before" | "inside" | "after",
) {
  const target = dropRow(page, targetTitle);
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  await chapterRow(page, sourceTitle).dragTo(target, {
    targetPosition: {
      x: bounds!.width / 2,
      y:
        position === "before"
          ? 2
          : position === "after"
            ? bounds!.height - 2
            : bounds!.height / 2,
    },
  });
}

test("multiple Markdown files become chapters with Google-style fonts and intact rich formatting after reload", async ({
  page,
}) => {
  const title = "Markdown writing workspace";
  await createProject(page, title, "book");
  const input = page.getByLabel("Import chapters", { exact: true });
  await expect(input).toHaveAttribute("multiple", "");
  await input.setInputFiles([
    {
      name: "01-world-design.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(manuscript),
    },
    {
      name: "Climate.markdown",
      mimeType: "text/markdown",
      buffer: Buffer.from(
        "## Seasonal cycle\n\nClimate writing remains an independent chapter.",
      ),
    },
  ]);
  await expect(chapterRow(page, "Systems overview")).toBeVisible();
  await expect(chapterRow(page, "Climate")).toBeVisible();
  await chapterRow(page, "Systems overview").click();
  const editor = page.getByRole("textbox", {
    name: "Chapter manuscript",
    exact: true,
  });
  await expect(editor.locator("h1")).toHaveText("Systems overview");
  await expect(editor.locator("h1")).toHaveCSS("font-size", /29\.33[0-9]*px/);
  await expect(editor.locator("h2")).toHaveCSS("font-size", /21\.33[0-9]*px/);
  const prose = editor.locator("p").filter({ hasText: /^A calm living world/ });
  await expect(prose).toHaveCSS("font-family", /Arial/i);
  await expect(prose).toHaveCSS("font-size", /14\.66[0-9]*px/);
  await expect(prose).toHaveCSS("font-weight", "400");
  await expect(prose.locator("strong")).toHaveText("living world");
  await expect(prose.locator("em")).toHaveText("seasonal choices");
  await expect(prose.locator("code")).toHaveText("state");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await expect(editor.locator("ol li")).toHaveCount(2);
  await expect(editor.locator("blockquote")).toContainText(
    "The world continues",
  );
  await expect(editor.locator("table tr")).toHaveCount(3);
  await expect(editor.locator("table th")).toHaveCount(2);
  await expect(editor.locator("hr")).toHaveCount(1);
  await expect(
    editor.locator('a[href="https://example.com/design"]'),
  ).toHaveText("design reference");
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "cpp",
  );
  const before = await savedBook(page, title);
  const original = chapterNamed(before, "Systems overview");
  const codeNode = original.document.content!.find(
    (node) => node.type === "codeBlock",
  )!;
  expect(codeNode.attrs?.language).toBe("cpp");
  expect(codeNode.content?.map((node) => node.text || "").join("")).toBe(
    `${code}\n`,
  );
  const firstParagraph = original.document.content!.find(
    (node) => node.type === "paragraph",
  )!;
  expect(firstParagraph.attrs).toMatchObject({
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
  });
  expect(
    firstParagraph
      .content!.find((node) => node.text === "A calm ")
      ?.marks?.some((mark) => mark.type === "bold") ?? false,
  ).toBe(false);
  expect(
    firstParagraph.content!.find((node) => node.text === "living world")?.marks,
  ).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: "bold" })]),
  );
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await chapterRow(page, "Systems overview").click();
  expect(
    chapterNamed(await savedBook(page, title), "Systems overview").document,
  ).toEqual(original.document);
  await expect(editor.locator("table tr")).toHaveCount(3);
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "cpp",
  );
  await page.getByLabel("Color theme", { exact: true }).selectOption("white");
  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await page.screenshot({
    path: ".cache/markdown-import-results/markdown-import.png",
  });
  await chapterRow(page, "Climate").click();
  await expect(editor).toContainText(
    "Climate writing remains an independent chapter.",
  );
});

test("dropping Markdown files onto sections creates ordered children and deeper subsystems without merging their writing", async ({
  page,
}) => {
  const title = "Markdown system bible";
  await createProject(page, title, "bible");
  const baselineOverview = chapterNamed(
    await savedBook(page, title),
    "Overview",
  );
  await dropFiles(dropRow(page, "Overview"), [
    {
      name: "land.md",
      text: "# Living land\n\nLand systems have their own document.",
    },
    {
      name: "weather.markdown",
      text: "# Weather model\n\nWeather systems have their own document.",
    },
  ]);
  await expect(dropRow(page, "Living land")).toHaveAttribute("data-depth", "1");
  await expect(dropRow(page, "Weather model")).toHaveAttribute(
    "data-depth",
    "1",
  );
  const first = await savedBook(page, title);
  const overview = chapterNamed(first, "Overview");
  expect(chapterNamed(first, "Living land").parentId).toBe(overview.id);
  expect(chapterNamed(first, "Weather model").parentId).toBe(overview.id);
  expect(first.nodes.map((node) => node.title)).toEqual([
    "Overview",
    "Living land",
    "Weather model",
  ]);
  expect(overview.document).toEqual(baselineOverview.document);
  await dropFiles(dropRow(page, "Weather model"), [
    {
      name: "forecast.md",
      text: "# Daily forecast\n\nA nested forecast keeps **its own rules**.",
    },
  ]);
  await expect(dropRow(page, "Daily forecast")).toHaveAttribute(
    "data-depth",
    "2",
  );
  await dropFiles(
    dropRow(page, "Living land"),
    [
      { name: "coast.md", text: "# Coast systems\n\nTides and shorelines." },
      { name: "forest.md", text: "# Forest systems\n\nWoodland growth." },
    ],
    "before",
  );
  await expect(dropRow(page, "Coast systems")).toHaveAttribute(
    "data-depth",
    "1",
  );
  await dropFiles(page.locator("[data-outline-root-drop]"), [
    {
      name: "research.md",
      text: "# Research appendix\n\nIndependent references remain at the top level.",
    },
  ]);
  await expect(dropRow(page, "Research appendix")).toHaveAttribute(
    "data-depth",
    "0",
  );
  const saved = await savedBook(page, title);
  expect(saved.nodes.map((node) => node.title)).toEqual([
    "Overview",
    "Coast systems",
    "Forest systems",
    "Living land",
    "Weather model",
    "Daily forecast",
    "Research appendix",
  ]);
  expect(chapterNamed(saved, "Daily forecast").parentId).toBe(
    chapterNamed(saved, "Weather model").id,
  );
  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect(dropRow(page, "Daily forecast")).toHaveAttribute(
    "data-depth",
    "2",
  );
  await chapterRow(page, "Daily forecast").click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("A nested forecast keeps its own rules.");
  await expect(page.locator(".tiptap p strong")).toHaveText("its own rules");
  expect(
    chapterNamed(await savedBook(page, title), "Overview").document,
  ).toEqual(overview.document);
});

function dragFixture(mode: "book" | "bible"): Book {
  const time = "2026-01-01T00:00:00.000Z";
  const values: [
    string,
    string | null,
    Chapter["icon"],
    Chapter["progress"],
    string,
  ][] = [
    ["Overview", null, "document", "in-progress", "📚"],
    ["Gameplay", null, "gamepad", "complete", "🎮"],
    ["Weather", "Gameplay", "globe", "blocked", "⛈️"],
    ["Forecast", "Weather", "code", "on-hold", "🧑‍🔬"],
    ["Inventory", null, "layers", "not-started", "📦"],
    ["Reference", null, "lightbulb", "complete", "💡"],
  ];
  return {
    version: 1,
    ...(mode === "bible" ? { mode } : {}),
    id: `drag-${mode}`,
    title: `Drag Markdown ${mode}`,
    subtitle: "A generic imported design workspace",
    author: "Example author",
    description: "",
    language: "en-US",
    created: time,
    modified: time,
    goal: mode === "bible" ? 0 : 50000,
    color: "#314d43",
    nodes: values.map(([title, parent, icon, progress, emoji]) => ({
      id: `drag-${title.toLowerCase()}`,
      type: "chapter" as const,
      title,
      parentId: parent ? `drag-${parent.toLowerCase()}` : null,
      kind: "chapter" as const,
      status: "Revision" as const,
      icon,
      progress,
      emoji,
      tags: `${title.toLowerCase()}, design`,
      notes: `Private design notes for ${title}.`,
      goal: mode === "bible" ? 0 : 2000,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              fontFamily: "Arial",
              fontSize: "11pt",
              lineHeight: "1.15",
              textAlign: null,
              color: null,
              backgroundColor: null,
              marginTop: null,
              marginBottom: null,
              marginLeft: null,
              marginRight: null,
              textIndent: null,
              paddingLeft: null,
            },
            content: [
              {
                type: "text",
                text: `Imported ${title} writing stays attached to the same chapter.`,
              },
            ],
          },
        ],
      },
      created: time,
      modified: time,
    })),
  };
}

function persistentContents(book: Book) {
  return book.nodes
    .map((node) => {
      if (node.type === "part") return node;
      const { parentId: _parent, modified: _modified, ...content } = node;
      return content;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}

for (const mode of ["book", "bible"] as const) {
  test(`${mode} pointer drops nest and promote full chapter trees, preserve content, and reject cycles`, async ({
    page,
  }) => {
    const original = dragFixture(mode);
    await page.addInitScript((book) => {
      if (!localStorage.getItem("codebook.library.v1")) {
        localStorage.setItem("codebook.initialized", "true");
        localStorage.setItem("codebook.library.v1", JSON.stringify([book]));
      }
    }, original);
    await page.goto("/");
    await page
      .getByRole("button", { name: `Open ${original.title}`, exact: true })
      .click();
    await moveByPointer(page, "Weather", "Inventory", "inside");
    await expect(dropRow(page, "Weather")).toHaveAttribute("data-depth", "1");
    await expect(dropRow(page, "Forecast")).toHaveAttribute("data-depth", "2");
    let current = await savedBook(page, original.title);
    expect(chapterNamed(current, "Weather").parentId).toBe("drag-inventory");
    expect(chapterNamed(current, "Forecast").parentId).toBe("drag-weather");
    await moveByPointer(page, "Inventory", "Overview", "inside");
    await expect(dropRow(page, "Forecast")).toHaveAttribute("data-depth", "3");
    await moveByPointer(page, "Gameplay", "Forecast", "inside");
    await expect(dropRow(page, "Gameplay")).toHaveAttribute("data-depth", "4");
    await moveByPointer(page, "Gameplay", "Inventory", "after");
    await expect(dropRow(page, "Gameplay")).toHaveAttribute("data-depth", "1");
    current = await savedBook(page, original.title);
    expect(chapterNamed(current, "Gameplay").parentId).toBe("drag-overview");
    expect(current.nodes.map((node) => node.title)).toEqual([
      "Overview",
      "Inventory",
      "Weather",
      "Forecast",
      "Gameplay",
      "Reference",
    ]);
    await moveByPointer(page, "Gameplay", "Inventory", "before");
    const beforeCycle = await savedBook(page, original.title);
    expect(beforeCycle.nodes.map((node) => node.title)).toEqual([
      "Overview",
      "Gameplay",
      "Inventory",
      "Weather",
      "Forecast",
      "Reference",
    ]);
    await moveByPointer(page, "Overview", "Forecast", "inside");
    expect(await savedBook(page, original.title)).toEqual(beforeCycle);
    const root = page.locator("[data-outline-root-drop]");
    await expect(root).toHaveAccessibleName("Move to top level");
    await chapterRow(page, "Inventory").dragTo(root);
    await expect(dropRow(page, "Inventory")).toHaveAttribute("data-depth", "0");
    await expect(dropRow(page, "Weather")).toHaveAttribute("data-depth", "1");
    await expect(dropRow(page, "Forecast")).toHaveAttribute("data-depth", "2");
    current = await savedBook(page, original.title);
    expect(chapterNamed(current, "Inventory").parentId).toBeNull();
    expect(current.nodes.slice(-3).map((node) => node.title)).toEqual([
      "Inventory",
      "Weather",
      "Forecast",
    ]);
    expect(persistentContents(current)).toEqual(persistentContents(original));
    await page.reload();
    await page
      .getByRole("button", { name: `Open ${original.title}`, exact: true })
      .click();
    await expect(dropRow(page, "Inventory")).toHaveAttribute("data-depth", "0");
    await expect(dropRow(page, "Forecast")).toHaveAttribute("data-depth", "2");
    await chapterRow(page, "Forecast").click();
    await expect(page.locator(".tiptap")).toHaveText(
      "Imported Forecast writing stays attached to the same chapter.",
    );
    await expect(
      page.getByRole("button", { name: "Emoji for Forecast", exact: true }),
    ).toHaveText("🧑‍🔬");
    expect(persistentContents(await savedBook(page, original.title))).toEqual(
      persistentContents(original),
    );
  });
}
