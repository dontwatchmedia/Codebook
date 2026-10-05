import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("test-results", `native-${Date.now()}`);
const booksDir = path.join(root, "books");
await mkdir(root, { recursive: true });
const exe = path.resolve(
  process.argv[2] || "src-tauri/target/release/codebook.exe",
);
const port = 9339;
let processHandle, browser, page;
const evidence = { checks: [], errors: [], root };
async function launch() {
  processHandle = spawn(exe, [], {
    windowsHide: true,
    env: {
      ...process.env,
      CODEBOOK_DATA_DIR: booksDir,
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  page = context.pages()[0] || (await context.waitForEvent("page"));
  page.on("pageerror", (e) => evidence.errors.push(e.message));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.errors.push(message.text());
  });
  await page.waitForLoadState("domcontentloaded");
}
async function kill() {
  if (processHandle && processHandle.exitCode === null) {
    try {
      execFileSync(
        "taskkill",
        ["/PID", String(processHandle.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
    } catch {}
  }
  await browser?.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
}
async function projectByTitle(title) {
  const dirs = (await readdir(booksDir, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name !== "trash" &&
        entry.name !== "recovery",
    )
    .map((entry) => entry.name);
  for (const dir of dirs) {
    const projectPath = path.join(booksDir, dir, "book.json");
    const project = JSON.parse(await readFile(projectPath, "utf8"));
    if (project.title === title) return { project, projectPath, dir };
  }
  throw new Error(`Native project file not found: ${title}`);
}
function assertBible(project, content) {
  expect(project.mode).toBe("bible");
  const titles = [
    "Overview",
    "Living City",
    "Housing",
    "Interiors",
    "Placement rules",
  ];
  let parentId = null;
  for (const title of titles) {
    const section = project.nodes.find((node) => node.title === title);
    expect(section, `Native section ${title} exists`).toBeDefined();
    expect(section.type).toBe("chapter");
    expect(section.parentId).toBe(parentId);
    parentId = section.id;
  }
  const placement = project.nodes.find(
    (node) => node.title === "Placement rules",
  );
  expect(placement.progress).toBe("blocked");
  expect(placement.icon).toBe("hammer");
  expect(JSON.stringify(placement.document)).toContain(content);
}
async function assertNativeDocsFormatting() {
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await expect(editor).toContainText("Example Game — System Bible");
  const styles = await editor.evaluate((element) => {
    const textStyle = (wanted) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent?.includes(wanted)) {
          const css = getComputedStyle(node.parentElement);
          return {
            fontFamily: css.fontFamily,
            fontSize: parseFloat(css.fontSize),
            fontWeight: css.fontWeight,
          };
        }
      }
      throw new Error("Native pasted text not found: " + wanted);
    };
    const opening = [...element.querySelectorAll("p")].find((paragraph) =>
      paragraph.textContent.startsWith(
        "Example Game is a fictional design document",
      ),
    );
    return {
      body: textStyle("describe their purpose"),
      title: textStyle("Example Game — System Bible"),
      selectiveNormal: textStyle(" is a fictional systems overview"),
      marginBottom: parseFloat(getComputedStyle(opening).marginBottom),
      marginLeft: parseFloat(getComputedStyle(opening).marginLeft),
    };
  });
  expect(styles.body.fontFamily).toContain("Arial");
  expect(styles.body.fontSize).toBeCloseTo((11 * 4) / 3, 1);
  expect(styles.body.fontWeight).toBe("400");
  expect(styles.title.fontFamily).toContain("Arial");
  expect(styles.title.fontSize).toBeCloseTo((22 * 4) / 3, 1);
  expect(styles.title.fontWeight).toBe("700");
  expect(styles.selectiveNormal.fontWeight).toBe("400");
  expect(styles.marginBottom).toBeCloseTo((8 * 4) / 3, 1);
  expect(styles.marginLeft).toBeCloseTo((22 * 4) / 3, 1);
  const selective = editor.locator(":scope > p").filter({
    hasText: /^Example Game is a fictional systems overview/,
  });
  const boldStyle = await selective.evaluate((paragraph) => {
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.textContent?.includes("Example Game"))
        return getComputedStyle(node.parentElement).fontWeight;
    }
    throw new Error("Selective bold text not found in native manuscript");
  });
  expect(boldStyle).toBe("700");
}
function assertSavedDocsFormatting(
  project,
  chapterTitle = "Native Docs overview",
) {
  const chapter = project.nodes.find((node) => node.title === chapterTitle);
  expect(chapter, "Native imported chapter exists").toBeDefined();
  const opening = chapter.document.content.find(
    (node) =>
      node.type === "paragraph" &&
      JSON.stringify(node).includes("describe their purpose"),
  );
  expect(opening.attrs).toMatchObject({
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
    marginBottom: "8pt",
    marginLeft: "22pt",
    marginRight: "6pt",
    textIndent: "0pt",
  });
  const body = opening.content.find(
    (node) =>
      node.type === "text" && node.text.includes("describe their purpose"),
  );
  expect(body.marks.some((mark) => mark.type === "bold")).toBe(false);
  expect(
    body.marks.find((mark) => mark.type === "textStyle")?.attrs,
  ).toMatchObject({
    fontFamily: "Arial",
    fontSize: "11pt",
  });
  const selective = chapter.document.content.find(
    (node) =>
      node.type === "paragraph" &&
      JSON.stringify(node).includes("is a fictional systems overview"),
  );
  expect(
    selective.content.find((node) => node.text === "Example Game").marks,
  ).toContainEqual({ type: "bold" });
}
try {
  await launch();
  await expect(
    page.getByRole("heading", { name: "Your bookshelf." }),
  ).toBeVisible();
  await expect(
    page.getByText("LOCAL WORKSPACE", { exact: true }),
  ).toBeVisible();
  evidence.checks.push(
    "Production Tauri/WebView2 app launched with bundled offline assets",
  );
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(page.getByLabel("Code language")).toHaveValue("cpp");
  await page.screenshot({ path: path.join(root, "native-editor.png") });
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Native persistence check");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("These words are saved atomically to a real project file.");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const dirs = (await readdir(booksDir, { withFileTypes: true }))
    .filter(
      (n) => n.isDirectory() && n.name !== "trash" && n.name !== "recovery",
    )
    .map((n) => n.name);
  const projectPath = path.join(booksDir, dirs[0], "book.json");
  const saved = JSON.parse(await readFile(projectPath, "utf8"));
  expect(JSON.stringify(saved)).toContain("These words are saved atomically");
  const backupFiles = await readdir(path.join(booksDir, dirs[0], "backups"));
  expect(backupFiles.length).toBeGreaterThan(0);
  evidence.checks.push(
    "Native autosave wrote valid structured book.json and a backup snapshot",
  );
  await kill();
  await launch();
  await expect(
    page.getByRole("button", { name: "Switch to light mode" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  evidence.checks.push(
    "Dark mode switch and preference survived native app restart",
  );
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Native persistence check" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toContainText("These words are saved atomically");
  evidence.checks.push(
    "Written chapter survived process termination and a native restart",
  );
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill("A last unsaved idea should come back after a crash.");
  await kill();
  await launch();
  await expect(
    page.getByRole("dialog", { name: "Your words are still here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Native persistence check" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toContainText("A last unsaved idea should come back after a crash.");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  evidence.checks.push(
    "Unsaved edit recovered from journal after forced termination before autosave",
  );
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "New system bible", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Project title")
    .fill("Native system bible");
  await page
    .getByRole("button", { name: "Create system bible", exact: true })
    .click();
  for (const [parentTitle, title] of [
    ["Overview", "Living City"],
    ["Living City", "Housing"],
    ["Housing", "Interiors"],
    ["Interiors", "Placement rules"],
  ]) {
    await page
      .locator(".book-tree")
      .getByRole("button", { name: `Add child to ${parentTitle}`, exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Title", { exact: true })
      .fill(title);
    await page
      .getByRole("button", { name: "Create section", exact: true })
      .click();
    await expect(page.getByLabel("Section title", { exact: true })).toHaveValue(
      title,
    );
  }
  const sectionEditor = () =>
    page.getByRole("textbox", { name: "Section content", exact: true });
  const savedBibleText =
    "Furniture placement rules live four layers below the overview.";
  await sectionEditor().fill(savedBibleText);
  await page
    .getByLabel("Section progress", { exact: true })
    .selectOption("blocked");
  await page.getByLabel("Section icon", { exact: true }).selectOption("hammer");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const savedBible = await projectByTitle("Native system bible");
  assertBible(savedBible.project, savedBibleText);
  evidence.checks.push(
    "Native system bible autosave preserved five nested sections, parent relationships, progress and icons in book.json",
  );
  await kill();
  await launch();
  await page
    .getByRole("button", { name: "Open Native system bible", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Placement rules" })
    .click();
  await expect(sectionEditor()).toContainText(savedBibleText);
  await expect(
    page.getByLabel("Section progress", { exact: true }),
  ).toHaveValue("blocked");
  await expect(page.getByLabel("Section icon", { exact: true })).toHaveValue(
    "hammer",
  );
  await expect(
    page.locator(".outline-row").filter({ hasText: "Placement rules" }),
  ).toHaveAttribute("data-depth", "4");
  await page.screenshot({ path: path.join(root, "native-system-bible.png") });
  evidence.checks.push(
    "Deep system-bible content, tree depth, progress and section icon survived native restart",
  );
  const recoveredBibleText =
    "A last unsaved placement rule survives a crash inside a nested system.";
  await sectionEditor().fill(recoveredBibleText);
  await kill();
  await launch();
  await expect(
    page.getByRole("dialog", { name: "Your words are still here." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restore changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Native system bible", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Placement rules" })
    .click();
  await expect(sectionEditor()).toContainText(recoveredBibleText);
  await expect(
    page.getByLabel("Section progress", { exact: true }),
  ).toHaveValue("blocked");
  await expect(page.getByLabel("Section icon", { exact: true })).toHaveValue(
    "hammer",
  );
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const recoveredBible = await projectByTitle("Native system bible");
  assertBible(recoveredBible.project, recoveredBibleText);
  evidence.checks.push(
    "Nested system-bible edit recovered from a crash journal and saved with its complete hierarchy and metadata",
  );
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Native Docs paste");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page
    .getByLabel("Writing layout", { exact: true })
    .selectOption("original");
  await page
    .getByLabel("Chapter title", { exact: true })
    .fill("Native Docs overview");
  const lightSwitch = page.getByRole("button", {
    name: "Switch to light mode",
    exact: true,
  });
  if (await lightSwitch.isVisible()) await lightSwitch.click();
  const docsHTML = (
    await readFile(
      new URL("../tests/fixtures/google-docs.html", import.meta.url),
      "utf8",
    )
  )
    .replace(/>\s+</g, "><")
    .replace(
      "<h2",
      '<p style="line-height:1.15;margin-bottom:0pt"><span style="font-family:Arial;font-size:11pt"><br></span></p><p style="line-height:1.15;margin-bottom:0pt"><span style="font-family:Arial;font-size:11pt"><br></span></p><h2',
    )
    .replace(
      "<hr>",
      '<p style="line-height:1.38;margin-top:0pt;margin-bottom:0pt"></p><hr><p></p>',
    );
  await page.getByRole("textbox", { name: "Chapter manuscript" }).focus();
  await page.evaluate((html) => {
    const data = new DataTransfer();
    data.setData("text/html", html);
    document.querySelector(".tiptap").dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, docsHTML);
  await assertNativeDocsFormatting();
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const savedDocs = await projectByTitle("Native Docs paste");
  assertSavedDocsFormatting(savedDocs.project);
  await page.screenshot({ path: path.join(root, "native-google-docs.png") });
  evidence.checks.push(
    "Native Google Docs paste preserved Arial fonts, point sizes, selective bold and paragraph spacing in the WebView2 editor and real book.json",
  );
  await kill();
  await launch();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page
    .getByRole("button", { name: "Open Native Docs paste", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Native Docs overview" })
    .click();
  await assertNativeDocsFormatting();
  assertSavedDocsFormatting(
    (await projectByTitle("Native Docs paste")).project,
  );
  evidence.checks.push(
    "Imported Google Docs formatting and normal-weight body text survived a native process restart",
  );
  await page
    .getByLabel("Writing layout", { exact: true })
    .selectOption("compact");
  await expect(page.locator(".chapter-title")).not.toBeVisible();
  const nativeBlankHeights = await page
    .locator('.manuscript p[data-blank-line="true"]')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().height),
    );
  expect(nativeBlankHeights.length).toBeGreaterThanOrEqual(2);
  for (const height of nativeBlankHeights)
    expect(height).toBeLessThanOrEqual(24);
  await expect(page.locator(".manuscript h2").first()).toHaveCSS(
    "margin-top",
    "16px",
  );
  const renderedTextHeight = () =>
    page.locator(".manuscript").evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes("describe their purpose")) {
          const range = document.createRange();
          range.selectNodeContents(node);
          return range.getClientRects()[0].height;
        }
      }
      throw new Error("Native imported body not found");
    });
  const originalTextHeight = await renderedTextHeight();
  await page.getByLabel("Writing zoom", { exact: true }).selectOption("80");
  await expect(page.locator(".paper")).toHaveCSS("zoom", "0.8");
  const smallerTextHeight = await renderedTextHeight();
  expect(smallerTextHeight / originalTextHeight).toBeCloseTo(0.8, 1);
  const assertDividerSpacing = async () => {
    const divider = page.locator(".manuscript hr").first();
    await expect(divider).toHaveCSS("margin-top", "8px");
    await expect(divider).toHaveCSS("margin-bottom", "8px");
    const gap = await divider.evaluate((element) => {
      const heading = element.nextElementSibling?.nextElementSibling;
      if (!heading || heading.tagName !== "H2")
        throw new Error(
          "Expected editable blank paragraph before next heading",
        );
      return (
        heading.getBoundingClientRect().top -
        element.getBoundingClientRect().bottom
      );
    });
    expect(gap).toBeLessThanOrEqual(30);
  };
  await assertDividerSpacing();
  evidence.checks.push(
    "Compact divider margins and measured heading gaps stayed tight at 80% with neighboring blank paragraphs retained",
  );
  await page
    .getByLabel("Color theme", { exact: true })
    .selectOption("midnight");
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-scheme",
    "dark",
  );
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(24, 37, 59)",
  );
  await page.locator(".structure-book .project-title-button").dblclick();
  await page
    .getByLabel("Rename project", { exact: true })
    .fill("Native compact workspace");
  await page.getByLabel("Rename project", { exact: true }).press("Enter");
  await page
    .locator(".outline-title")
    .filter({ hasText: /^Native Docs overview$/ })
    .dblclick();
  await page
    .getByLabel("Rename chapter Native Docs overview", { exact: true })
    .fill("Compact overview");
  await page
    .getByLabel("Rename chapter Native Docs overview", { exact: true })
    .press("Enter");
  await page
    .getByRole("button", { name: "Emoji for Compact overview", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search emojis", exact: true })
    .fill("done");
  await page.getByRole("button", { name: "✅ Complete", exact: true }).click();
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const compactBook = (await projectByTitle("Native compact workspace"))
    .project;
  expect(
    compactBook.nodes.find((node) => node.title === "Compact overview").emoji,
  ).toBe("✅");
  assertSavedDocsFormatting(compactBook, "Compact overview");
  evidence.checks.push(
    "Offline emoji keyword search found the familiar Complete marker and saved the selection in the native project file",
  );
  await expect
    .poll(async () =>
      JSON.parse(
        await readFile(path.join(booksDir, ".preferences.json"), "utf8"),
      ),
    )
    .toMatchObject({ theme: "midnight", layout: "compact", writingZoom: 80 });
  await page.screenshot({
    path: path.join(root, "native-compact-midnight.png"),
  });
  evidence.checks.push(
    "Compact writing, Midnight colors, inline project and chapter renaming, and section emoji worked in the real native app and saved to disk",
  );
  await kill();
  await launch();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(page.locator("html")).toHaveAttribute("data-layout", "compact");
  await page
    .getByRole("button", { name: "Open Native compact workspace", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Compact overview" })
    .click();
  await expect(page.getByLabel("Writing zoom", { exact: true })).toHaveValue(
    "80",
  );
  await expect(page.locator(".paper")).toHaveCSS("zoom", "0.8");
  expect((await renderedTextHeight()) / originalTextHeight).toBeCloseTo(0.8, 1);
  evidence.checks.push(
    "Writing zoom scaled imported text to 80%, persisted in merged native preferences, and survived restart with original point sizes unchanged",
  );
  await expect(
    page.getByRole("button", {
      name: "Emoji for Compact overview",
      exact: true,
    }),
  ).toHaveText("✅");
  await expect(page.getByLabel("Writing layout", { exact: true })).toHaveValue(
    "compact",
  );
  await expect(page.locator(".chapter-title")).not.toBeVisible();
  expect(
    (await projectByTitle("Native compact workspace")).project.nodes.find(
      (node) => node.title === "Compact overview",
    ).emoji,
  ).toBe("✅");
  assertSavedDocsFormatting(
    (await projectByTitle("Native compact workspace")).project,
    "Compact overview",
  );
  evidence.checks.push(
    "Renamed titles, emoji, Midnight theme, and Compact preference all survived termination and native restart without losing document typography",
  );
  await page.getByLabel("Color theme", { exact: true }).selectOption("white");
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".structure")).toHaveCSS(
    "background-color",
    "rgb(241, 243, 244)",
  );
  await assertDividerSpacing();
  await expect
    .poll(async () =>
      JSON.parse(
        await readFile(path.join(booksDir, ".preferences.json"), "utf8"),
      ),
    )
    .toMatchObject({ theme: "white", layout: "compact", writingZoom: 80 });
  await page
    .getByRole("button", { name: "Emoji for Compact overview", exact: true })
    .click();
  const emojiDialog = page.getByRole("dialog", {
    name: "Choose section emoji",
    exact: true,
  });
  const initialEmojiCount = await emojiDialog.locator(".emoji-choice").count();
  expect(initialEmojiCount).toBeGreaterThan(25);
  expect(initialEmojiCount).toBeLessThanOrEqual(100);
  await emojiDialog
    .getByRole("searchbox", { name: "Search emojis", exact: true })
    .fill("DRAG");
  await expect(
    emojiDialog.getByRole("button", { name: "🐉 Dragon", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(root, "native-emoji-search.png") });
  await emojiDialog
    .getByRole("button", { name: "🐉 Dragon", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await expect
    .poll(async () => readdir(path.join(booksDir, "recovery")))
    .toEqual([]);
  await page.screenshot({ path: path.join(root, "native-white-divider.png") });
  await kill();
  await launch();
  await expect(page.getByLabel("Color theme", { exact: true })).toHaveValue(
    "white",
  );
  await page
    .getByRole("button", { name: "Open Native compact workspace", exact: true })
    .click();
  await page
    .locator(".book-tree .chapter-row")
    .filter({ hasText: "Compact overview" })
    .click();
  await expect(page.getByLabel("Writing zoom", { exact: true })).toHaveValue(
    "80",
  );
  await expect(page.locator(".editor-column")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await assertDividerSpacing();
  await expect(
    page.getByRole("button", {
      name: "Emoji for Compact overview",
      exact: true,
    }),
  ).toHaveText("🐉");
  expect(
    (await projectByTitle("Native compact workspace")).project.nodes.find(
      (node) => node.title === "Compact overview",
    ).emoji,
  ).toBe("🐉");
  evidence.checks.push(
    "The expanded offline emoji catalog used bounded initial results, found Dragon by uppercase prefix, and retained the choice after native restart",
  );
  assertSavedDocsFormatting(
    (await projectByTitle("Native compact workspace")).project,
    "Compact overview",
  );
  evidence.checks.push(
    "White paper, neutral panels, compact divider spacing, and 80% zoom persisted across native restart with original document formatting retained",
  );
  const importDirectory = path.join(root, "markdown-inputs");
  await mkdir(importDirectory);
  const nativeMarkdown = [
    "# Imported systems",
    "",
    "Normal text with **selective bold** and `state`.",
    "",
    "## Rules",
    "",
    "- [x] Finished rule",
    "- [ ] Pending rule",
    "",
    "| System | State |",
    "| --- | --- |",
    "| Weather | Ready |",
    "",
    "```cpp",
    "int main() {",
    "    return 0;",
    "}",
    "```",
  ].join("\n");
  const importedPaths = ["systems.md", "mechanics.markdown", "behavior.md"].map(
    (name) => path.join(importDirectory, name),
  );
  await writeFile(importedPaths[0], nativeMarkdown);
  await writeFile(
    importedPaths[1],
    "# Mechanics\n\nMechanics retain their own writing.",
  );
  await writeFile(
    importedPaths[2],
    "# Behavior\n\nBehavior retains its own writing.",
  );
  await page
    .getByLabel("Import chapters", { exact: true })
    .setInputFiles(importedPaths);
  const importedTitles = ["Imported systems", "Mechanics", "Behavior"];
  const importRow = (title) =>
    page.locator(".chapter-row").filter({
      has: page
        .locator(".outline-title")
        .filter({ hasText: new RegExp(`^${title}$`) }),
    });
  await expect(importRow("Behavior")).toBeVisible();
  await importRow("Imported systems").click();
  const importedEditor = page.getByRole("textbox", {
    name: "Chapter manuscript",
    exact: true,
  });
  await expect(importedEditor.locator("h1")).toHaveText("Imported systems");
  await expect(importedEditor.locator("h2")).toHaveText("Rules");
  await expect(importedEditor).toContainText("☑ Finished rule");
  await expect(importedEditor).toContainText("☐ Pending rule");
  const importedStyles = await importedEditor.evaluate((element) => {
    const paragraph = element.querySelector("p");
    return {
      body: parseFloat(getComputedStyle(paragraph).fontSize),
      font: getComputedStyle(paragraph).fontFamily,
      weight: getComputedStyle(paragraph).fontWeight,
      title: parseFloat(getComputedStyle(element.querySelector("h1")).fontSize),
      heading: parseFloat(
        getComputedStyle(element.querySelector("h2")).fontSize,
      ),
      bold: getComputedStyle(paragraph.querySelector("strong")).fontWeight,
    };
  });
  expect(importedStyles.body).toBeCloseTo((11 * 4) / 3, 2);
  expect(importedStyles.font).toContain("Arial");
  expect(Number(importedStyles.weight)).toBeLessThan(600);
  expect(Number(importedStyles.bold)).toBeGreaterThanOrEqual(600);
  expect(importedStyles.title).toBeCloseTo((22 * 4) / 3, 2);
  expect(importedStyles.heading).toBeCloseTo((16 * 4) / 3, 2);
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const beforeImportMoves = (await projectByTitle("Native compact workspace"))
    .project;
  const importedSystem = beforeImportMoves.nodes.find(
    (node) => node.title === "Imported systems",
  );
  expect(
    importedSystem.document.content.find((node) => node.type === "paragraph")
      .attrs,
  ).toMatchObject({
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
  });
  const importedCode = importedSystem.document.content.find(
    (node) => node.type === "codeBlock",
  );
  expect(importedCode.attrs.language).toBe("cpp");
  expect(importedCode.content.map((node) => node.text || "").join("")).toBe(
    "int main() {\n    return 0;\n}\n",
  );
  evidence.checks.push(
    "Multiple real Markdown files imported as editable native chapters with Google-style Arial point sizes, selective bold, tables, task states and exact C++ code preserved on disk",
  );
  await importRow("Mechanics").dragTo(importRow("Imported systems"));
  await importRow("Behavior").dragTo(importRow("Mechanics"));
  await importRow("Imported systems").dragTo(importRow("Compact overview"));
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const afterImportMoves = (await projectByTitle("Native compact workspace"))
    .project;
  const namedImportedNode = (project, title) =>
    project.nodes.find((node) => node.title === title);
  expect(namedImportedNode(afterImportMoves, "Imported systems").parentId).toBe(
    namedImportedNode(afterImportMoves, "Compact overview").id,
  );
  expect(namedImportedNode(afterImportMoves, "Mechanics").parentId).toBe(
    namedImportedNode(afterImportMoves, "Imported systems").id,
  );
  expect(namedImportedNode(afterImportMoves, "Behavior").parentId).toBe(
    namedImportedNode(afterImportMoves, "Mechanics").id,
  );
  for (const title of importedTitles) {
    expect(namedImportedNode(afterImportMoves, title).document).toEqual(
      namedImportedNode(beforeImportMoves, title).document,
    );
  }
  evidence.checks.push(
    "Real pointer dragging nested imported chapters and moved a complete three-section branch into another chapter in the Windows app without altering its documents",
  );
  const droppedPath = path.join(importDirectory, "dropped.md");
  await writeFile(
    droppedPath,
    "# Dropped feature\n\nA file dropped into a subchapter keeps **its formatting**.",
  );
  const fileDropRow = page
    .locator(".outline-row[data-outline-drop-row]")
    .filter({
      has: page.locator(".outline-title").filter({ hasText: /^Mechanics$/ }),
    });
  await fileDropRow.scrollIntoViewIfNeeded();
  const fileDropBounds = await fileDropRow.boundingBox();
  const fileDropSession = await page.context().newCDPSession(page);
  const dragData = { items: [], files: [droppedPath], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver", "drop"]) {
    await fileDropSession.send("Input.dispatchDragEvent", {
      type,
      x: fileDropBounds.x + fileDropBounds.width / 2,
      y: fileDropBounds.y + fileDropBounds.height / 2,
      data: dragData,
    });
  }
  await fileDropSession.detach();
  await expect(importRow("Dropped feature")).toBeVisible();
  await importRow("Dropped feature").click();
  await expect(importedEditor).toContainText(
    "A file dropped into a subchapter keeps",
  );
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const afterNativeDrop = (await projectByTitle("Native compact workspace"))
    .project;
  expect(namedImportedNode(afterNativeDrop, "Dropped feature").parentId).toBe(
    namedImportedNode(afterNativeDrop, "Mechanics").id,
  );
  await page.screenshot({
    path: path.join(root, "native-markdown-import.png"),
  });
  evidence.checks.push(
    "A file-path drag event through the compiled WebView read a real local Markdown file and imported it directly beneath a subchapter with formatting retained",
  );
  await expect
    .poll(async () => readdir(path.join(booksDir, "recovery")))
    .toEqual([]);
  await kill();
  await launch();
  await page
    .getByRole("button", { name: "Open Native compact workspace", exact: true })
    .click();
  await importRow("Dropped feature").click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript", exact: true }),
  ).toContainText("A file dropped into a subchapter keeps");
  const reopenedImports = (await projectByTitle("Native compact workspace"))
    .project;
  for (const title of [...importedTitles, "Dropped feature"]) {
    expect(namedImportedNode(reopenedImports, title)).toEqual(
      namedImportedNode(afterNativeDrop, title),
    );
  }
  evidence.checks.push(
    "Imported Markdown, native file-drop content and the complete reparented chapter hierarchy survived native process termination and restart",
  );
  const leftPanel = () => page.locator(".structure");
  const resizeDivider = () =>
    page.getByRole("separator", { name: "Resize left panel", exact: true });
  const panelWidth = async () =>
    Math.round((await leftPanel().boundingBox()).width);
  const readNativePreferences = async () =>
    JSON.parse(
      await readFile(path.join(booksDir, ".preferences.json"), "utf8"),
    );
  const initialPanelWidth = await panelWidth();
  const dividerBounds = await resizeDivider().boundingBox();
  await page.mouse.move(
    dividerBounds.x + dividerBounds.width / 2,
    dividerBounds.y + dividerBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dividerBounds.x + dividerBounds.width / 2 + 140,
    dividerBounds.y + dividerBounds.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect.poll(panelWidth).toBe(initialPanelWidth + 140);
  const expandedPanelWidth = await panelWidth();
  await page.mouse.move(expandedPanelWidth + 80, 200);
  await page.screenshot({
    path: path.join(root, "native-resizable-outline.png"),
  });
  await resizeDivider().focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(panelWidth).toBe(expandedPanelWidth - 10);
  const chosenPanelWidth = await panelWidth();
  await expect
    .poll(async () => (await readNativePreferences()).sidebarWidth)
    .toBe(chosenPanelWidth);
  expect(await readNativePreferences()).toMatchObject({
    theme: "white",
    layout: "compact",
    writingZoom: 80,
  });
  const chapterContents = (project) =>
    project.nodes.map(({ modified, ...node }) => node);
  expect(
    chapterContents((await projectByTitle("Native compact workspace")).project),
  ).toEqual(chapterContents(reopenedImports));
  evidence.checks.push(
    "Real pointer dragging widened the native left panel, keyboard input narrowed it, and atomic native preferences retained width, theme, layout and zoom without changing chapter writing or hierarchy",
  );
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await expect
    .poll(async () => readdir(path.join(booksDir, "recovery")))
    .toEqual([]);
  await kill();
  await launch();
  await page
    .getByRole("button", { name: "Open Native compact workspace", exact: true })
    .click();
  await expect.poll(panelWidth).toBe(chosenPanelWidth);
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(leftPanel()).toBeHidden();
  await expect(resizeDivider()).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(resizeDivider()).toBeVisible();
  await expect.poll(panelWidth).toBe(chosenPanelWidth);
  evidence.checks.push(
    "The chosen left-panel width survived native process restart, and Focus mode hid and restored both the panel and its divider",
  );
  await resizeDivider().dblclick();
  await expect.poll(panelWidth).toBe(initialPanelWidth);
  await expect
    .poll(async () => (await readNativePreferences()).sidebarWidth)
    .toBeNull();
  expect(await readNativePreferences()).toMatchObject({
    theme: "white",
    layout: "compact",
    writingZoom: 80,
  });
  evidence.checks.push(
    "Double-clicking the native divider restored the responsive default and persisted the reset without discarding other preferences",
  );
  expect(evidence.errors).toEqual([]);
  evidence.checks.push("No JavaScript runtime errors during native workflow");
  await writeFile(
    path.join(root, "report.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await kill();
}
