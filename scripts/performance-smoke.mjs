import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

// All content is synthetic. Never opens the user's library.
const args = process.argv.slice(2);
const exe = path.resolve(args[0] || "CodeBook.exe");
const scenario = args[1] || "current";
const label = args[2] || "candidate";
const cases = {
  current: { words: 172000, sections: 86 },
  growth: { words: 700000, sections: 350 },
  wide: { words: 700000, sections: 2000 },
  long: { words: 700000, sections: 65, firstWords: 60000 },
};
const config = cases[scenario];
if (!config) throw new Error("Unknown performance scenario");
const root = path.resolve(
  "test-results",
  `performance-${label}-${scenario}-${Date.now()}`,
);
const booksDir = path.join(root, "books");
await mkdir(path.join(booksDir, "performance-project"), { recursive: true });
const timestamp = "2026-01-01T00:00:00.000Z";
const attrs = {
  fontFamily: "Arial",
  fontSize: "11pt",
  color: "#000000",
  backgroundColor: null,
  textAlign: null,
  lineHeight: "1.15",
  marginTop: "0pt",
  marginBottom: "8pt",
  marginLeft: null,
  marginRight: null,
  textIndent: null,
  paddingLeft: null,
};
function document(words, chapter) {
  const content = [];
  let remaining = words;
  while (remaining) {
    const size = Math.min(48, remaining);
    const runs = [];
    for (let i = 0; i < size; i += 4) {
      const count = Math.min(4, size - i);
      const values = Array.from({ length: count }, (_, k) =>
        i === 0 && k === 0 && content.length === 0
          ? `watershed${chapter}`
          : ["season", "forest", "village", "system"][(i + k) % 4],
      );
      runs.push({
        type: "text",
        text: values.join(" ") + (i + count < size ? " " : ""),
        marks: [
          {
            type: "textStyle",
            attrs: {
              fontFamily: "Arial",
              fontSize: "11pt",
              color: "#000000",
              backgroundColor: null,
            },
          },
          ...(i % 12 === 4 ? [{ type: "bold" }] : []),
        ],
      });
    }
    content.push({ type: "paragraph", attrs: { ...attrs }, content: runs });
    remaining -= size;
  }
  return { type: "doc", content };
}
const nodes = [];
let remaining = config.words;
for (let i = 0; i < config.sections; i++) {
  const words =
    i === 0 && config.firstWords
      ? config.firstWords
      : Math.ceil(remaining / (config.sections - i));
  nodes.push({
    id: `section-${i}`,
    type: "chapter",
    title: `Section ${String(i + 1).padStart(4, "0")}`,
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
    document: document(words, i),
  });
  remaining -= words;
}
const book = {
  version: 1,
  mode: "bible",
  id: "performance-project",
  title: "Performance reference",
  subtitle: "Synthetic scale verification",
  author: "",
  description: "",
  language: "en-US",
  created: timestamp,
  modified: timestamp,
  goal: 0,
  color: "#314d43",
  nodes,
};
const encoded = JSON.stringify(book);
await writeFile(path.join(booksDir, book.id, "book.json"), encoded);
await writeFile(
  path.join(booksDir, ".preferences.json"),
  JSON.stringify({ theme: "white", layout: "compact", writingZoom: 80 }),
);
const evidence = {
  label,
  scenario,
  ...config,
  jsonBytes: Buffer.byteLength(encoded),
  node: process.version,
  checks: [],
  errors: [],
  root,
};
let processHandle, browser, page;
const port = 9341;
const start = performance.now();
try {
  processHandle = spawn(exe, [], {
    windowsHide: true,
    env: {
      ...process.env,
      CODEBOOK_DATA_DIR: booksDir,
      WEBVIEW2_USER_DATA_FOLDER: path.join(root, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  for (let i = 0; i < 360; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(120000);
  page.on("pageerror", (error) => evidence.errors.push(error.message));
  await page
    .getByRole("button", { name: "Open Performance reference", exact: true })
    .waitFor();
  evidence.libraryReadyMs = performance.now() - start;
  const openStart = performance.now();
  await page
    .getByRole("button", { name: "Open Performance reference", exact: true })
    .click();
  const manuscript = page.locator(".manuscript");
  await manuscript.waitFor();
  await manuscript.locator("p").first().waitFor();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  evidence.openChapterMs = performance.now() - openStart;
  await page.evaluate(() => {
    window.__perf = {
      keys: [],
      longTasks: [],
      calls: {},
      durations: [],
      payloads: [],
      lastPayload: null,
    };
    new PerformanceObserver((list) => {
      window.__perf.longTasks.push(...list.getEntries().map((x) => x.duration));
    }).observe({ type: "longtask", buffered: false });
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          !(e.target instanceof Element) ||
          !e.target.closest(".manuscript") ||
          e.key.length !== 1
        )
          return;
        const start = performance.now();
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            window.__perf.keys.push(performance.now() - start),
          ),
        );
      },
      true,
    );
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const command = decodeURIComponent(
        new URL(url, location.href).pathname,
      ).slice(1);
      const begin = performance.now();
      window.__perf.calls[command] = (window.__perf.calls[command] || 0) + 1;
      const tracked = /stage|patch|checkpoint|save_book/.test(command);
      if (tracked) {
        window.__perf.lastPayload = {
          command,
          bytes:
            typeof init?.body === "string"
              ? init.body.length
              : init?.body?.byteLength || 0,
        };
        window.__perf.payloads.push(window.__perf.lastPayload);
      }
      return nativeFetch(input, init).finally(() => {
        if (tracked)
          window.__perf.durations.push({
            command,
            ms: performance.now() - begin,
          });
      });
    };
  });
  await manuscript.locator("p").first().click();
  await page.keyboard.press("Control+Home");
  const typed = "PERFVERIFY ";
  await page.keyboard.type(typed, { delay: 35 });
  await expect(manuscript).toContainText(typed.trim());
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  // Older builds could briefly report Saved while another save was still queued.
  await expect
    .poll(
      async () => {
        const saved = JSON.parse(
          await readFile(path.join(booksDir, book.id, "book.json"), "utf8"),
        );
        return JSON.stringify(saved.nodes[0].document).includes(typed.trim());
      },
      {
        timeout: 120000,
        message: "Every typed character reaches the native snapshot",
      },
    )
    .toBe(true);
  await page.waitForTimeout(250);
  evidence.typing = await page.evaluate(() => {
    const x = window.__perf;
    const values = [...x.keys].sort((a, b) => a - b);
    return {
      samples: values.length,
      medianMs: values[Math.floor(values.length * 0.5)],
      p95Ms:
        values[Math.min(values.length - 1, Math.floor(values.length * 0.95))],
      maxMs: values.at(-1),
      longTasks: x.longTasks,
      nativeCalls: x.calls,
      nativeDurations: x.durations,
      payloads: x.payloads,
    };
  });
  evidence.checks.push("Typed text is displayed and completes native autosave");
  evidence.switchesMs = [];
  for (const name of [
    "Section 0002",
    "Section 0001",
    "Section 0003",
    "Section 0001",
  ]) {
    const before = performance.now();
    await page
      .locator(".chapter-row")
      .filter({
        has: page
          .locator(".outline-title")
          .filter({ hasText: new RegExp(`^${name}$`) }),
      })
      .click();
    await expect(page.locator(".breadcrumb strong")).toHaveText(name);
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
    evidence.switchesMs.push(performance.now() - before);
  }
  await expect(manuscript).toContainText(typed.trim());
  evidence.checks.push("Repeated chapter switching retains the new writing");
  const searchStart = performance.now();
  await page.keyboard.press("Control+f");
  await page
    .getByRole("textbox", { name: "Find in system bible", exact: true })
    .fill("watershed");
  await expect(
    page.getByRole("status", { name: "Search match count", exact: true }),
  ).toContainText(`${config.sections} matches`, { timeout: 120000 });
  evidence.searchMs = performance.now() - searchStart;
  evidence.outlineRows = await page.locator(".outline-row").count();
  evidence.totalDOMNodes = await page.locator("*").count();
  const saved = JSON.parse(
    await readFile(path.join(booksDir, book.id, "book.json"), "utf8"),
  );
  expect(saved.nodes.slice(1)).toEqual(book.nodes.slice(1));
  expect(JSON.stringify(saved.nodes[0].document).includes(typed.trim())).toBe(
    true,
  );
  evidence.checks.push(
    "Project-wide search finds each section; untouched sections remain byte-for-byte equivalent JSON",
  );
  // A common word stresses result counting without mounting every occurrence.
  const commonCount = (encoded.match(/\bforest\b/g) || []).length;
  const commonStart = performance.now();
  await page
    .getByRole("textbox", { name: "Find in system bible", exact: true })
    .fill("forest");
  await expect(
    page.getByRole("status", { name: "Search match count", exact: true }),
  ).toContainText(`${commonCount} matches`, { timeout: 120000 });
  evidence.commonSearch = {
    matches: commonCount,
    ms: performance.now() - commonStart,
    mountedResults: await page.locator(".project-find-group > button").count(),
  };
  expect(evidence.commonSearch.mountedResults).toBeLessThanOrEqual(60);
  await page.getByRole("button", { name: "Close find", exact: true }).click();
  // Let the old build's deferred focus settle before comparing typing speed.
  await page.waitForTimeout(50);
  await page.keyboard.press("Control+Home");
  await page.evaluate(() => {
    window.__perf.keys = [];
    window.__perf.longTasks = [];
  });
  await page.keyboard.type("RESUME ", { delay: 35 });
  const resumedText = label === "baseline" ? "RESUME" : "RESUME PERFVERIFY";
  await expect(manuscript.locator("p").first()).toContainText(resumedText);
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await expect
    .poll(
      async () =>
        JSON.stringify(
          JSON.parse(
            await readFile(path.join(booksDir, book.id, "book.json"), "utf8"),
          ).nodes[0].document,
        ).includes(resumedText),
      { timeout: 120000 },
    )
    .toBe(true);
  evidence.typingAfterFind = await page.evaluate(() => {
    const values = [...window.__perf.keys].sort((a, b) => a - b);
    return {
      samples: values.length,
      medianMs: values[Math.floor(values.length * 0.5)],
      maxMs: values.at(-1),
      longTasks: window.__perf.longTasks,
    };
  });
  evidence.checks.push(
    "Common-word search reports every occurrence; writing after closing Find is displayed and persisted",
  );
  expect(evidence.errors).toEqual([]);
  const diagnostics = await page.context().newCDPSession(page);
  await diagnostics.send("Performance.enable");
  const { metrics } = await diagnostics.send("Performance.getMetrics");
  evidence.webview = Object.fromEntries(
    metrics
      .filter((entry) =>
        ["JSHeapUsedSize", "JSHeapTotalSize", "Nodes", "Documents"].includes(
          entry.name,
        ),
      )
      .map((entry) => [entry.name, entry.value]),
  );
  await diagnostics.detach();
  await page.screenshot({ path: path.join(root, "workspace.png") });
  await writeFile(
    path.join(root, "report.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  await writeFile(
    path.join(root, "failure.json"),
    JSON.stringify({ ...evidence, failure: String(error) }, null, 2),
  );
  throw error;
} finally {
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
}
