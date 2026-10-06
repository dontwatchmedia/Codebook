import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Only synthetic data and this process tree are used. The user's library is untouched.
const root = path.resolve(
  "test-results",
  `native-delta-recovery-${Date.now()}`,
);
const booksDir = path.join(root, "books");
const exe = path.resolve(
  process.argv[2] || "src-tauri/target/release/codebook.exe",
);
const port = 9343;
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
const paragraph = (value) => ({
  type: "paragraph",
  attrs: { ...attrs },
  content: [
    {
      type: "text",
      text: value,
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
      ],
    },
  ],
});
const project = {
  version: 1,
  id: "incremental-recovery",
  mode: "bible",
  title: "Incremental recovery reference",
  subtitle: "Synthetic native durability verification",
  author: "",
  description: "",
  language: "en-US",
  created: timestamp,
  modified: timestamp,
  goal: 0,
  color: "#314d43",
  nodes: Array.from({ length: 200 }, (_, chapter) => ({
    id: `section-${chapter}`,
    type: "chapter",
    title: `Section ${String(chapter + 1).padStart(4, "0")}`,
    parentId: chapter === 1 ? "section-0" : null,
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
      content: Array.from({ length: chapter === 0 ? 500 : 20 }, (_, index) =>
        paragraph(
          `Section ${chapter}, paragraph ${index}. ${"Season forest village system ".repeat(10)}`,
        ),
      ),
    },
  })),
};
const projectPath = path.join(booksDir, project.id, "book.json");
const journalDir = path.join(booksDir, "recovery", project.id);
await mkdir(path.dirname(projectPath), { recursive: true });
await writeFile(projectPath, JSON.stringify(project));
await writeFile(
  path.join(booksDir, ".preferences.json"),
  JSON.stringify({ theme: "white", layout: "compact", writingZoom: 80 }),
);
let processHandle, browser, page;
const evidence = {
  root,
  bytes: Buffer.byteLength(JSON.stringify(project)),
  checks: [],
  errors: [],
};
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
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => evidence.errors.push(error.message));
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
  await new Promise((resolve) => setTimeout(resolve, 600));
}
const saved = async () => JSON.parse(await readFile(projectPath, "utf8"));
const manuscript = () =>
  page.getByRole("textbox", { name: "Section content", exact: true });
const readySaved = () =>
  page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
const open = () =>
  page
    .getByRole("button", { name: `Open ${project.title}`, exact: true })
    .click();
async function observeNative(holdCheckpoint = false) {
  await page.evaluate((hold) => {
    window.__delta = { calls: [], held: 0, release: null, hold };
    const fetchNative = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const command = decodeURIComponent(
        new URL(url, location.href).pathname,
      ).slice(1);
      if (/stage_book|checkpoint_book|save_book/.test(command))
        window.__delta.calls.push({
          command,
          bytes:
            typeof init?.body === "string"
              ? init.body.length
              : init?.body?.byteLength || 0,
        });
      if (command === "checkpoint_book" && window.__delta.hold) {
        window.__delta.held++;
        return new Promise((resolve, reject) => {
          window.__delta.release = () => {
            window.__delta.hold = false;
            fetchNative(input, init).then(resolve, reject);
          };
        });
      }
      return fetchNative(input, init);
    };
  }, holdCheckpoint);
}
async function typeAtStart(value) {
  await manuscript().locator("p").first().click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type(value, { delay: 10 });
}
try {
  await launch();
  await open();
  await observeNative(true);
  await typeAtStart("DURABLE-DELTA ");
  await expect.poll(() => page.evaluate(() => window.__delta.held)).toBe(1);
  const files = await readdir(journalDir);
  const patchFiles = files.filter((name) => name.startsWith("patch-"));
  expect(patchFiles.length).toBeGreaterThan(5);
  expect(files).not.toContain("base.json");
  const patchSizes = await Promise.all(
    patchFiles.map(
      async (name) => (await readFile(path.join(journalDir, name))).length,
    ),
  );
  evidence.typing = await page.evaluate(() => window.__delta.calls);
  evidence.recoveryPatchSizes = patchSizes;
  expect(Math.max(...patchSizes)).toBeLessThan(3000);
  expect(
    evidence.typing.filter((call) => call.command === "stage_book"),
  ).toHaveLength(0);
  expect(
    evidence.typing
      .filter((call) => call.command === "stage_book_patch")
      .every((call) => call.bytes < 3000),
  ).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("codebook.recovery.v1")),
  ).toBeNull();
  expect(await saved()).toEqual(project);
  await page.screenshot({
    path: path.join(root, "native-pending-recovery.png"),
  });
  evidence.checks.push(
    "Actual typing in a 200-section project sends sub-3KB leaf patches, durably journals them, and writes no full-book native localStorage copy; checkpoint was deliberately held before dispatch",
  );
  await kill();
  await launch();
  const recovery = page.getByRole("button", {
    name: "Restore changes",
    exact: true,
  });
  await recovery.waitFor();
  await recovery.click();
  await open();
  await readySaved();
  await expect(manuscript()).toContainText("DURABLE-DELTA");
  const recovered = await saved();
  expect(recovered.nodes.slice(1)).toEqual(project.nodes.slice(1));
  expect(recovered.nodes[0].document.content.slice(1)).toEqual(
    project.nodes[0].document.content.slice(1),
  );
  expect(recovered.nodes[0].document.content[0].content[0].marks).toEqual(
    project.nodes[0].document.content[0].content[0].marks,
  );
  expect(await readdir(path.join(booksDir, "recovery"))).toEqual([]);
  evidence.checks.push(
    "Hard process termination before checkpoint replays the native patch chain; Restore changes saves all typed text, preserves unrelated chapters and font marks, and clears recovery only after a successful checkpoint",
  );

  await observeNative(true);
  await typeAtStart("CHECKPOINT-A ");
  await expect.poll(() => page.evaluate(() => window.__delta.held)).toBe(1);
  // Keep the first checkpoint in flight while another edit and autosave arrive.
  await typeAtStart("CHECKPOINT-B ");
  await page.waitForTimeout(800);
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.__delta.release());
  await readySaved();
  await expect
    .poll(async () =>
      JSON.stringify((await saved()).nodes[0].document).includes(
        "CHECKPOINT-B CHECKPOINT-A DURABLE-DELTA",
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("codebook.recovery.v1")),
  ).toBeNull();
  let final = await saved();
  evidence.concurrentCalls = await page.evaluate(() => window.__delta.calls);
  expect(
    evidence.concurrentCalls.filter(
      (call) => call.command === "checkpoint_book",
    ).length,
  ).toBeGreaterThanOrEqual(2);
  expect(final.nodes.slice(1)).toEqual(project.nodes.slice(1));
  evidence.checks.push(
    "A newer typing/autosave batch queued behind an in-flight checkpoint remains unsaved in the UI until both revisions finish and preserves every character without a stale overwrite",
  );

  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__saveFailure = {
      held: false,
      fail: false,
      rejected: [],
      release: null,
    };
    const failure = (command) => {
      window.__saveFailure.rejected.push(command);
      // This is the native command's error response, not a transport error
      // (which Tauri could transparently retry over another IPC transport).
      return new Response(JSON.stringify("Controlled recovery/save failure"), {
        headers: {
          "Content-Type": "application/json",
          "Tauri-Response": "error",
        },
      });
    };
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const command = decodeURIComponent(
        new URL(url, location.href).pathname,
      ).slice(1);
      if (command === "checkpoint_book" && !window.__saveFailure.held) {
        window.__saveFailure.held = true;
        return new Promise((resolve) => {
          window.__saveFailure.release = () => resolve(failure(command));
        });
      }
      if (
        window.__saveFailure.fail &&
        ["stage_book_patch", "stage_book", "checkpoint_book"].includes(command)
      )
        return Promise.resolve(failure(command));
      return nativeFetch(input, init);
    };
  });
  await typeAtStart("FAILED-A ");
  await expect
    .poll(() => page.evaluate(() => window.__saveFailure.held))
    .toBe(true);
  await page.evaluate(() => {
    window.__saveFailure.fail = true;
  });
  await typeAtStart("FAILED-B ");
  // Let the second autosave take its newer snapshot out of dirty while the
  // first checkpoint is still held. Both save batches will then fail.
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__saveFailure.release());
  await expect
    .poll(() => page.evaluate(() => window.__saveFailure.rejected.length))
    .toBeGreaterThanOrEqual(11);
  await expect(
    page.getByRole("button", { name: "Save failed — retry", exact: true }),
  ).toBeVisible();
  await expect(manuscript()).toContainText(
    "FAILED-B FAILED-A CHECKPOINT-B CHECKPOINT-A DURABLE-DELTA",
  );
  expect(JSON.stringify((await saved()).nodes[0].document)).not.toContain(
    "FAILED-B",
  );
  evidence.controlledFailures = await page.evaluate(
    () => window.__saveFailure.rejected,
  );
  await page.evaluate(() => {
    window.__saveFailure.fail = false;
  });
  await page
    .getByRole("button", { name: "Save failed — retry", exact: true })
    .click();
  await readySaved();
  await expect
    .poll(async () =>
      JSON.stringify((await saved()).nodes[0].document).includes(
        "FAILED-B FAILED-A CHECKPOINT-B CHECKPOINT-A DURABLE-DELTA",
      ),
    )
    .toBe(true);
  final = await saved();
  expect(final.nodes.slice(1)).toEqual(project.nodes.slice(1));
  expect(
    await page.evaluate(() => localStorage.getItem("codebook.recovery.v1")),
  ).toBeNull();
  evidence.checks.push(
    "Two overlapping save batches plus newer recovery writes fail under controlled IPC errors; Retry persists the latest visible text rather than the stale failed batch and only then reports Saved",
  );

  await kill();
  await launch();
  await open();
  await expect(manuscript()).toContainText(
    "FAILED-B FAILED-A CHECKPOINT-B CHECKPOINT-A DURABLE-DELTA",
  );
  expect(await saved()).toEqual(final);
  await expect(
    page.getByRole("button", { name: "Restore changes", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: path.join(root, "native-recovered-checkpoint.png"),
  });
  expect(evidence.errors).toEqual([]);
  evidence.checks.push(
    "Final checkpoint reopens after a second native restart with no redundant recovery prompt or JavaScript errors",
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
