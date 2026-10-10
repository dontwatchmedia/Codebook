import { chromium, expect } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("test-results", `native-paste-${Date.now()}`);
const booksDir = path.join(root, "books");
const exe = path.resolve(
  process.argv[2] || "src-tauri/target/release/codebook.exe",
);
const port = 9345;
const html = await readFile("tests/fixtures/chatgpt-rich.html", "utf8");
const evidence = { root, checks: [], errors: [], externalRequests: [] };
const timestamp = new Date().toISOString();
const section = (id, title, content = [{ type: "paragraph" }]) => ({
  id,
  type: "chapter",
  title,
  parentId: null,
  kind: "chapter",
  status: "Draft",
  tags: "",
  notes: "",
  goal: 2000,
  created: timestamp,
  modified: timestamp,
  document: { type: "doc", content },
});
const project = {
  version: 1,
  id: "paste-regression",
  title: "Paste regression",
  subtitle: "",
  author: "",
  description: "",
  language: "en-US",
  goal: 50000,
  color: "#314d43",
  created: timestamp,
  modified: timestamp,
  nodes: [
    section("rich", "Rich response"),
    section("markdown", "Markdown response"),
    section("reference", "Untouched reference", [
      {
        type: "paragraph",
        attrs: { fontFamily: "Arial", fontSize: "11pt" },
        content: [{ type: "text", text: "Keep this reference exactly." }],
      },
    ]),
  ],
};
const projectPath = path.join(booksDir, project.id, "book.json");
await mkdir(path.dirname(projectPath), { recursive: true });
await writeFile(projectPath, JSON.stringify(project));
await writeFile(
  path.join(booksDir, ".preferences.json"),
  JSON.stringify({ theme: "white", layout: "compact", writingZoom: 100 }),
);
let owned, browser, page;
async function launch() {
  owned = spawn(exe, [], {
    windowsHide: true,
    env: {
      ...process.env,
      CODEBOOK_DATA_DIR: booksDir,
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.errors.push(message.text());
  });
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      !/^https?:\/\/(?:tauri|ipc|asset)\.localhost/.test(request.url())
    )
      evidence.externalRequests.push(request.url());
  });
  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("button", { name: "Open Paste regression", exact: true })
    .click();
}
async function stop() {
  if (owned && owned.exitCode === null) {
    try {
      execFileSync("taskkill", ["/PID", String(owned.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } catch {}
  }
  await browser?.close().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const editor = () =>
  page.getByRole("textbox", { name: "Chapter manuscript", exact: true });
const saved = async () => JSON.parse(await readFile(projectPath, "utf8"));
const nodes = (node, type) => [
  ...(node.type === type ? [node] : []),
  ...(node.content || []).flatMap((child) => nodes(child, type)),
];
async function paste(formats) {
  await editor().focus();
  await page.evaluate((formats) => {
    const clipboardData = new DataTransfer();
    for (const [type, value] of Object.entries(formats))
      clipboardData.setData(type, value);
    document.querySelector(".tiptap").dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, formats);
}
async function storedRich() {
  await expect
    .poll(
      async () => nodes((await saved()).nodes[0].document, "blockMath").length,
      { timeout: 15000 },
    )
    .toBe(1);
  const book = await saved();
  expect(book.nodes[2]).toEqual(project.nodes[2]);
  return book.nodes[0].document;
}
try {
  await launch();
  await paste({ "text/html": html, "text/plain": "A balanced simulation" });
  await expect(
    editor().getByText("Each stage keeps its own state", { exact: false }),
  ).toBeVisible();
  const body = await editor()
    .locator("p")
    .filter({ hasText: "Each stage keeps its own state" })
    .evaluate((element) => {
      const css = getComputedStyle(element);
      return {
        family: css.fontFamily,
        size: parseFloat(css.fontSize),
        weight: css.fontWeight,
      };
    });
  expect(body.family).toContain("Arial");
  expect(body.size).toBeCloseTo(44 / 3, 1);
  expect(body.weight).toBe("400");
  const inlineSharesLine = await editor()
    .locator("p")
    .filter({ hasText: "A circular boundary uses" })
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph.firstChild);
      range.setEnd(
        paragraph.firstChild,
        paragraph.firstChild.textContent.trimEnd().length,
      );
      const text = range.getBoundingClientRect();
      const equation = paragraph
        .querySelector(".math-inline")
        .getBoundingClientRect();
      return equation.top < text.bottom && equation.bottom > text.top;
    });
  expect(inlineSharesLine).toBe(true);
  await expect(editor().locator(".katex")).toHaveCount(2);
  await expect(page.getByLabel("Code language", { exact: true })).toHaveValue(
    "ini",
  );
  const pasted = await storedRich();
  expect(nodes(pasted, "codeBlock")[0]).toMatchObject({
    attrs: { language: "ini" },
    content: [
      {
        type: "text",
        text: "[Simulation]\nEnabled=true\n  ; Keep indentation and **literal** syntax\nMaxSteps=12",
      },
    ],
  });
  expect(nodes(pasted, "inlineMath")[0].attrs.latex).toBe("x^2 + y^2 = r^2");
  expect(nodes(pasted, "blockMath")[0].attrs.latex).toContain("\\frac");
  expect(nodes(pasted, "table").length).toBe(2);
  expect(nodes(pasted, "blockquote")).toHaveLength(1);
  evidence.checks.push(
    "Native rich paste retains Arial typography, selective formatting, INI whitespace/language, editable cards/columns, and rendered inline/display equations; actual saved JSON retains untouched sections",
  );

  await editor().focus();
  await page.keyboard.press("Control+z");
  await expect(editor().locator(".katex")).toHaveCount(0);
  await page.keyboard.press("Control+y");
  await expect(editor().locator(".katex")).toHaveCount(2);
  expect(await storedRich()).toEqual(pasted);
  evidence.checks.push(
    "The entire paste is undoable and redo restores all rich structures and equations",
  );

  await editor().focus();
  await page.keyboard.press("Control+a");
  const copied = await page.evaluate(() => {
    const data = new DataTransfer();
    document.querySelector(".tiptap").dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return {
      html: data.getData("text/html"),
      plain: data.getData("text/plain"),
      native: data.getData("application/x-codebook"),
    };
  });
  expect(copied.plain).toContain("\\(x^2 + y^2 = r^2\\)");
  expect(copied.plain).toContain("\\frac");
  expect(copied.native).toContain("blockMath");
  expect(copied.html).toContain("data-latex");
  await paste({ "text/html": copied.html, "text/plain": copied.plain });
  await expect(editor().locator(".katex")).toHaveCount(2);
  expect(nodes(await storedRich(), "blockMath")).toEqual(
    nodes(pasted, "blockMath"),
  );
  evidence.checks.push(
    "Copy exposes mathematical source in plain text/native data and preserves equations through HTML re-paste",
  );

  await page.locator('button[data-outline-id="markdown"]').click();
  await paste({
    "text/plain":
      "## Copy-button example\n\nNormal **emphasis** and \\(x^2\\).\n\n\\[\na = \\frac{b}{c}\n\\]\n\n```ini\n[Copy]\nEnabled=true\n```",
  });
  await expect(editor().locator(".katex")).toHaveCount(2);
  await expect
    .poll(
      async () => nodes((await saved()).nodes[1].document, "blockMath").length,
      { timeout: 15000 },
    )
    .toBe(1);
  const beforeRestart = await saved();
  await stop();
  await launch();
  await page.locator('button[data-outline-id="rich"]').click();
  await expect(editor().locator(".katex")).toHaveCount(2);
  expect((await saved()).nodes).toEqual(beforeRestart.nodes);
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => document.fonts.check("16px KaTeX_Main")),
  ).toBe(true);
  await page.screenshot({
    path: path.join(root, "rich-paste.png"),
    fullPage: true,
  });
  evidence.checks.push(
    "Copy-button Markdown and raw equation delimiters render correctly; native restart retains all documents and loads bundled equation fonts",
  );

  const pdfPath = path.join(root, "pasted-formatting.pdf");
  await page.evaluate((destination) => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        decodeURIComponent(new URL(url, location.href).pathname).slice(1) ===
        "plugin:dialog|save"
      )
        return Promise.resolve(
          new Response(JSON.stringify(destination), {
            headers: {
              "Content-Type": "application/json",
              "Tauri-Response": "ok",
            },
          }),
        );
      return nativeFetch(input, init);
    };
  }, pdfPath);
  await page.locator(".outline-page-count").click();
  const pdfDialog = page.getByRole("dialog", {
    name: "Export PDF",
    exact: true,
  });
  await expect(
    pdfDialog.getByRole("status", { name: "PDF page count", exact: true }),
  ).toHaveText(/^\d+ pages? in this PDF$/, { timeout: 120000 });
  await pdfDialog
    .getByRole("button", { name: "Save PDF", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        try {
          return (await readFile(pdfPath)).subarray(0, 5).toString();
        } catch {
          return "";
        }
      },
      { timeout: 45000 },
    )
    .toBe("%PDF-");
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  evidence.pdf = { path: pdfPath, pages: pdf.getPageCount() };
  evidence.checks.push(
    "Actual native PDF generation and atomic saving succeed for rich pasted content and equations using bundled offline assets",
  );
  expect(evidence.errors).toEqual([]);
  expect(evidence.externalRequests).toEqual([]);
  evidence.checks.push(
    "No runtime errors or external asset requests during the native workflow",
  );
} catch (error) {
  evidence.failure = String(error.stack || error);
  await page
    ?.screenshot({ path: path.join(root, "failure.png"), fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await writeFile(
    path.join(root, "report.json"),
    JSON.stringify(evidence, null, 2),
  );
  await stop();
  console.log(JSON.stringify(evidence, null, 2));
}
