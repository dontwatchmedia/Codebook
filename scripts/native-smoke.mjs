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
