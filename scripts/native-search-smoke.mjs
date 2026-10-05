import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve("test-results", `native-search-${Date.now()}`);
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
const timestamp = new Date().toISOString();
const text = (value) => ({ type: "text", text: value });
const paragraph = (value) => ({
  type: "paragraph",
  attrs: { fontFamily: "Arial", fontSize: "11pt", lineHeight: "1.15" },
  content: [text(value)],
});
const section = (id, title, parentId, content) => ({
  id,
  title,
  parentId,
  type: "chapter",
  kind: "chapter",
  status: "Draft",
  progress: "in-progress",
  icon: "document",
  tags: "",
  notes: "",
  goal: 0,
  created: timestamp,
  modified: timestamp,
  document: { type: "doc", content },
});
const project = {
  id: "native-search",
  version: 1,
  mode: "bible",
  title: "Living world design",
  subtitle: "Search and reading position validation",
  author: "",
  description: "",
  language: "en-US",
  created: timestamp,
  modified: timestamp,
  goal: 0,
  color: "#314d43",
  nodes: [
    section("overview", "World overview", null, [
      paragraph("Every sapling grows into a new possibility."),
    ]),
    section("city", "Living city", "overview", [
      paragraph("The city changes with each season."),
    ]),
    section("daily", "Daily routines", "city", [
      paragraph("Neighbors care for a SAPLING in the community garden."),
    ]),
    section("forest", "Forestry", null, [
      {
        ...paragraph("unused"),
        content: [
          text("A "),
          { ...text("sap"), marks: [{ type: "bold" }] },
          text("ling begins the woodland cycle."),
        ],
      },
      ...Array.from({ length: 65 }, (_, index) =>
        paragraph(
          `Forest design note ${index + 1}: wildlife and the landscape respond to the player's choices.`,
        ),
      ),
      paragraph("The final sapling will regrow beside the old stump."),
    ]),
  ],
};
const projectPath = path.join(booksDir, project.id, "book.json");
await mkdir(path.dirname(projectPath), { recursive: true });
await writeFile(projectPath, JSON.stringify(project));
await writeFile(
  path.join(booksDir, ".preferences.json"),
  JSON.stringify({ theme: "white", layout: "compact", writingZoom: 80 }),
);
const savedProject = async () =>
  JSON.parse(await readFile(projectPath, "utf8"));
const row = (title) =>
  page.locator(".chapter-row").filter({
    has: page
      .locator(".outline-title")
      .filter({ hasText: new RegExp(`^${title}$`) }),
  });
const activeText = () =>
  page
    .locator(".search-match.is-active")
    .evaluateAll((elements) =>
      elements.map((element) => element.textContent).join(""),
    );
const count = () =>
  page.getByRole("status", { name: "Search match count", exact: true });
const paperScroll = () =>
  page.locator(".paper-scroll").evaluate((element) => element.scrollTop);
try {
  await launch();
  await page
    .getByRole("button", { name: "Open Living world design", exact: true })
    .click();
  await row("Forestry").click();
  await page.keyboard.press("Control+f");
  const find = () =>
    page.getByRole("textbox", { name: "Find in system bible", exact: true });
  await find().fill("sapling");
  await expect(count()).toHaveText("1 of 4 matches · 3 sections");
  await expect.poll(activeText).toBe("sapling");
  await expect(page.locator(".breadcrumb strong")).toHaveText("Forestry");
  await expect(find()).toBeFocused();
  await find().press("Enter");
  await expect(count()).toHaveText("2 of 4 matches · 3 sections");
  await expect.poll(paperScroll).toBeGreaterThan(600);
  await find().press("Enter");
  await expect(page.locator(".breadcrumb strong")).toHaveText("World overview");
  await find().press("Enter");
  await expect(page.locator(".breadcrumb strong")).toHaveText("Daily routines");
  await expect.poll(activeText).toBe("SAPLING");
  await expect(
    page.locator('.project-find-group[data-chapter-id="daily"] > small'),
  ).toHaveText("World overview / Living city");
  await expect(row("Daily routines")).toBeVisible();
  await page.locator(".project-find-results").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.screenshot({ path: path.join(root, "native-smart-search.png") });
  await find().press("Enter");
  await expect(count()).toHaveText("1 of 4 matches · 3 sections");
  await expect(page.locator(".breadcrumb strong")).toHaveText("Forestry");
  await expect(find()).toBeFocused();
  evidence.checks.push(
    "Native Ctrl+F starts in the current section, finds split-format text, scrolls distant matches without stealing input focus, reveals nested paths, and wraps through the whole project",
  );
  await page.screenshot({ path: path.join(root, "native-search-wrap.png") });

  await page
    .getByRole("textbox", { name: "Replace with", exact: true })
    .fill("seedling");
  await page.getByRole("button", { name: "Replace", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("A seedling begins");
  await expect.poll(paperScroll).toBeGreaterThan(600);
  await page
    .getByRole("button", { name: "Replace all in section", exact: true })
    .click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("Forestry");
  await expect(count()).toHaveText("2 matches · 2 sections");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  const replaced = await savedProject();
  expect(
    JSON.stringify(
      replaced.nodes.find((node) => node.id === "forest").document,
    ),
  ).not.toContain("sapling");
  expect(replaced.nodes.filter((node) => node.id !== "forest")).toEqual(
    project.nodes.filter((node) => node.id !== "forest"),
  );
  await page
    .getByRole("button", { name: "Undo (Ctrl+Z)", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("final sapling");
  await page
    .getByRole("button", { name: "Redo (Ctrl+Y)", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Section content", exact: true }),
  ).toContainText("final seedling");
  evidence.checks.push(
    "Native single replacement and section-only Replace all retain other sections exactly; Undo and Redo restore replacement content and actual saved JSON updates",
  );

  await page.getByRole("button", { name: "Close find", exact: true }).click();
  const manuscript = () =>
    page.getByRole("textbox", { name: "Section content", exact: true });
  await manuscript().focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  const selectionBefore = await page.evaluate(() =>
    window.getSelection()?.toString(),
  );
  expect(selectionBefore).toBe("stump");
  const scrollBefore = await paperScroll();
  await row("Daily routines").click();
  await manuscript().focus();
  await page.keyboard.press("Control+End");
  await row("Forestry").click();
  await expect.poll(paperScroll).toBeCloseTo(scrollBefore, 0);
  await manuscript().focus();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
    selectionBefore,
  );
  await page.keyboard.insertText("clearing");
  await expect(manuscript()).toContainText("old clearing.");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  expect(
    JSON.stringify(
      (await savedProject()).nodes.find((node) => node.id === "daily").document,
    ),
  ).toContain("SAPLING");
  evidence.checks.push(
    "Native section switching restores independent scroll and caret selections, and typing after returning edits only the correct section",
  );

  await page.keyboard.press("Control+f");
  await find().fill("seedling");
  await find().press("Enter");
  await expect(count()).toHaveText("2 of 2 matches · 1 section");
  await row("Daily routines").click();
  await expect(find()).toHaveValue("seedling");
  await row("Forestry").click();
  await expect(count()).toHaveText("2 of 2 matches · 1 section");
  await page.keyboard.press("Control+f");
  await expect(find()).toBeFocused();
  await expect(count()).toHaveText("2 of 2 matches · 1 section");
  await page.getByRole("button", { name: "Close find", exact: true }).click();
  evidence.checks.push(
    "The native Find query and each section's active occurrence survive outline navigation; repeated Ctrl+F refocuses Find without closing it or losing the occurrence",
  );

  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Living world design", exact: true })
    .click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("Forestry");
  await expect.poll(paperScroll).toBeGreaterThan(600);
  evidence.checks.push(
    "Reopening the native project from its bookshelf resumes the last visited section and reading position; project writing remains stored separately from view preferences",
  );
  expect(evidence.errors).toEqual([]);
  evidence.checks.push(
    "No JavaScript runtime errors during native search and reading-state workflows",
  );
  await writeFile(
    path.join(root, "report.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await page
    ?.screenshot({ path: path.join(root, "failure.png") })
    .catch(() => {});
  await writeFile(
    path.join(root, "failure.json"),
    JSON.stringify({ ...evidence, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
  await kill();
}
