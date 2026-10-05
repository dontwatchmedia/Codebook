import { chromium, expect } from "@playwright/test";
import { PDFDocument, PDFName } from "pdf-lib";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
import path from "node:path";

const root = path.resolve("test-results", `native-outline-pdf-${Date.now()}`);
const booksDir = path.join(root, "books");
const exe = path.resolve(
  process.argv[2] || "src-tauri/target/release/codebook.exe",
);
const port = 9339;
const evidence = { checks: [], errors: [], pdfs: [], root };
let processHandle, browser, page;
await mkdir(root, { recursive: true });
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
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page =
    browser.contexts()[0].pages()[0] ||
    (await browser.contexts()[0].waitForEvent("page"));
  page.on("pageerror", (error) => evidence.errors.push(error.message));
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
  await new Promise((resolve) => setTimeout(resolve, 600));
}
// A small deterministic PNG fixture, embedded so offline rendering is exercised.
function diagramPNG() {
  const crc = (bytes) => {
    let value = 0xffffffff;
    for (const byte of bytes) {
      value ^= byte;
      for (let i = 0; i < 8; i++)
        value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const name = Buffer.from(type);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(Buffer.concat([name, data])));
    return Buffer.concat([size, name, data, check]);
  };
  const width = 320,
    height = 140,
    header = Buffer.alloc(13),
    pixels = Buffer.alloc((width * 3 + 1) * height);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const index = y * (width * 3 + 1) + x * 3 + 1;
      pixels[index] = 25 + Math.round((x / width) * 80);
      pixels[index + 1] = 110 + Math.round((y / height) * 100);
      pixels[index + 2] = 180;
    }
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
}
const timestamp = new Date().toISOString();
const text = (value, marks) => ({
  type: "text",
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (value) => ({
  type: "paragraph",
  attrs: {
    fontFamily: "Arial",
    fontSize: "11pt",
    lineHeight: "1.15",
    marginTop: "0pt",
    marginBottom: "8pt",
  },
  content: [text(value)],
});
const chapter = (id, title, parentId, content) => ({
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
const cell = (value, attrs = {}, type = "tableCell") => ({
  type,
  attrs,
  content: [paragraph(value)],
});
const project = {
  id: "native-outline-pdf",
  version: 1,
  mode: "bible",
  title: "Living world reference",
  subtitle: "Print and outline validation",
  author: "CodeBook",
  description: "",
  language: "en-US",
  created: timestamp,
  modified: timestamp,
  goal: 0,
  color: "#314d43",
  nodes: [
    chapter("overview", "World overview", null, [
      {
        type: "heading",
        attrs: {
          level: 1,
          fontFamily: "Arial",
          fontSize: "22pt",
          textAlign: "left",
          marginTop: "0pt",
          marginBottom: "8pt",
        },
        content: [text("World overview")],
      },
      {
        ...paragraph("unused"),
        content: [
          text("A selectable reference with "),
          text("bold ideas", [{ type: "bold" }]),
          text(", "),
          text("italic details", [{ type: "italic" }]),
          text(" and "),
          text("blue text", [
            {
              type: "textStyle",
              attrs: {
                color: "#176bd8",
                fontFamily: "Arial",
                fontSize: "11pt",
              },
            },
          ]),
          text(". "),
          text("Reference link", [
            { type: "link", attrs: { href: "https://example.com/reference" } },
          ]),
        ],
      },
      {
        type: "image",
        attrs: { src: diagramPNG(), alt: "Blue and green world diagram" },
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              cell("System", { colwidth: [180] }, "tableHeader"),
              cell("Status", { colwidth: [160] }, "tableHeader"),
              cell("Area", { colwidth: [140] }, "tableHeader"),
            ],
          },
          {
            type: "tableRow",
            content: [
              cell("Shared growth systems", {
                colspan: 2,
                colwidth: [180, 160],
              }),
              cell("Forest", { rowspan: 2, colwidth: [140] }),
            ],
          },
          { type: "tableRow", content: [cell("Saplings"), cell("Complete")] },
        ],
      },
      {
        type: "codeBlock",
        attrs: {
          language: "javascript",
          filename: "growth.js",
          showLineNumbers: true,
          caption: "A deterministic growth example",
        },
        content: [
          text(
            'function grow(tree) {\n    const state = "**literal**";\n\n    return tree.age + 1;\n}',
          ),
        ],
      },
      {
        type: "callout",
        attrs: { kind: "note" },
        content: [
          paragraph(
            "Design note: these systems continue while the player explores.",
          ),
        ],
      },
      ...Array.from({ length: 55 }, (_, i) =>
        paragraph(
          `World design paragraph ${i + 1}. The terrain, weather, and everyday routines respond to changing seasons. Each system keeps its own state, follows clear rules, and remains readable in a long technical reference. This paragraph provides enough prose to validate real page breaks and selectable body text.`,
        ),
      ),
    ]),
    chapter("city", "Living city", "overview", [
      paragraph("The city brings together housing and community systems."),
    ]),
    chapter("daily", "Daily routines", "city", [
      paragraph("Neighbors gather at dawn and return home at sunset."),
    ]),
    chapter("forest", "Forestry", null, [
      paragraph("Forest systems remain independent from city routines."),
    ]),
    chapter("saplings", "Saplings", "forest", [
      paragraph("Saplings regrow after trees are felled."),
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
const row = (id) => page.locator(`.chapter-row[data-outline-id="${id}"]`);
const manuscript = () =>
  page.getByRole("textbox", { name: "Section content", exact: true });
const dialog = () =>
  page.getByRole("dialog", { name: "Export PDF", exact: true });
const readyPDF = () =>
  expect(
    dialog().getByRole("status", { name: "PDF page count", exact: true }),
  ).toHaveText(/^\d+ pages? in this PDF$/, { timeout: 120000 });
const generationCount = () => page.evaluate(() => window.__pdfGenerations || 0);
async function savePDF(name, expectedWidth, expectedHeight) {
  const destination = path.join(root, name);
  await page.evaluate((value) => {
    window.__pdfDestination = value;
  }, destination);
  await dialog().getByRole("button", { name: "Save PDF", exact: true }).click();
  await expect
    .poll(
      async () => {
        try {
          return (await readFile(destination)).subarray(0, 5).toString();
        } catch {
          return "";
        }
      },
      { timeout: 45000 },
    )
    .toBe("%PDF-");
  const bytes = await readFile(destination),
    pdf = await PDFDocument.load(bytes);
  const count = pdf.getPageCount();
  expect(count).toBeGreaterThan(2);
  for (const sheet of pdf.getPages()) {
    expect(sheet.getWidth()).toBeCloseTo(expectedWidth, 0);
    expect(sheet.getHeight()).toBeCloseTo(expectedHeight, 0);
  }
  expect(pdf.getTitle()).toBe(project.title);
  expect(
    pdf
      .getPages()
      .some((sheet) => sheet.node.Resources()?.lookup(PDFName.of("Font"))),
  ).toBe(true);
  await expect(
    dialog().getByRole("status", { name: "PDF page count", exact: true }),
  ).toHaveText(`${count} pages in this PDF`);
  evidence.pdfs.push({
    path: destination,
    bytes: bytes.length,
    pages: count,
    width: pdf.getPages()[0].getWidth(),
    height: pdf.getPages()[0].getHeight(),
    title: pdf.getTitle(),
  });
  return count;
}

try {
  await launch();
  await page
    .getByRole("button", { name: `Open ${project.title}`, exact: true })
    .click();
  // Intercept only the native file chooser. PDF generation and atomic writing
  // continue through the actual Rust commands and WebView2 print engine.
  await page.evaluate(() => {
    const nativeFetch = window.fetch.bind(window);
    window.__pdfGenerations = 0;
    window.fetch = (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      const command = decodeURIComponent(
        new URL(url, location.href).pathname,
      ).slice(1);
      if (command === "plugin:dialog|save")
        return Promise.resolve(
          new Response(JSON.stringify(window.__pdfDestination), {
            headers: {
              "Content-Type": "application/json",
              "Tauri-Response": "ok",
            },
          }),
        );
      if (command === "generate_native_pdf") window.__pdfGenerations++;
      return nativeFetch(input, init);
    };
  });
  const baseline = await page.evaluate(() => ({
    ratio: devicePixelRatio,
    width: innerWidth,
    font: getComputedStyle(document.querySelector(".manuscript p")).fontSize,
    rowFont: getComputedStyle(document.querySelector(".outline-title"))
      .fontSize,
  }));
  const bounds = await page.locator(".outline-tree").boundingBox();
  await page.mouse.move(bounds.x + 80, bounds.y + 40);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (110%)",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Larger outline text", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Larger outline text", exact: true })
    .click();
  const resized = await page.evaluate(() => ({
    ratio: devicePixelRatio,
    width: innerWidth,
    font: getComputedStyle(document.querySelector(".manuscript p")).fontSize,
    rowFont: getComputedStyle(document.querySelector(".outline-title"))
      .fontSize,
  }));
  expect(resized.ratio).toBe(baseline.ratio);
  expect(resized.width).toBe(baseline.width);
  expect(resized.font).toBe(baseline.font);
  expect(parseFloat(resized.rowFont)).toBeGreaterThan(
    parseFloat(baseline.rowFont),
  );
  await expect(
    page.getByRole("combobox", { name: "Writing zoom", exact: true }),
  ).toHaveValue("80");
  evidence.checks.push(
    "Native Ctrl+wheel and outline controls change only outline text, leaving writing font, writing zoom, and native WebView zoom unchanged",
  );
  await page
    .getByRole("button", { name: "Hide outline tools", exact: true })
    .click();
  await expect(page.locator(".outline-footer-content")).toBeHidden();
  await expect(page.locator(".outline-page-count")).toHaveText(
    /pages \(est\.\)/,
  );
  await page
    .getByRole("button", { name: "Collapse all sections", exact: true })
    .click();
  await expect(row("city")).toHaveCount(0);
  await expect(row("saplings")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expand all sections", exact: true })
    .click();
  await row("daily").click();
  await page
    .getByRole("button", { name: "Collapse World overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collapse Forestry", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Your bookshelf", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Open ${project.title}`, exact: true })
    .click();
  await expect(page.locator(".breadcrumb strong")).toHaveText("Daily routines");
  await expect(row("daily")).toBeVisible();
  await expect(row("saplings")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Reset outline text size (130%)",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".outline-footer-content")).toBeHidden();
  expect(await savedProject()).toEqual(project);
  await page.screenshot({
    path: path.join(root, "native-outline-controls.png"),
  });
  evidence.checks.push(
    "Collapsed tools and outline sizing persist across reopening; expand/collapse all work; reopening reveals active ancestors while preserving unrelated collapsed branches and original project JSON",
  );

  await page.locator(".outline-page-count").click();
  await readyPDF();
  const preview = page.frameLocator('iframe[title="PDF content preview"]');
  await expect(preview.locator('td[colspan="2"]')).toContainText(
    "Shared growth systems",
  );
  await expect(preview.locator(".pdf-code-filename")).toHaveText("growth.js");
  await expect(preview.locator(".pdf-code-caption")).toHaveText(
    "A deterministic growth example",
  );
  expect(await generationCount()).toBe(1);
  const letterPages = await savePDF("reference-letter.pdf", 612, 792);
  await page.screenshot({ path: path.join(root, "native-pdf-letter.png") });
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator(".outline-page-count")).toHaveText(
    `${letterPages} PDF pages`,
  );
  await page.locator(".outline-page-count").click();
  await readyPDF();
  expect(await generationCount()).toBe(1);
  evidence.checks.push(
    "Native Letter PDF is generated offline with font resources, exact page dimensions, original title metadata and real page count; Save PDF uses actual atomic native write; reopening reuses cached bytes",
  );
  await dialog()
    .getByRole("combobox", { name: "Paper size", exact: true })
    .selectOption("a4");
  await readyPDF();
  expect(await generationCount()).toBe(2);
  const a4Pages = await savePDF(
    "reference-a4.pdf",
    (210 * 72) / 25.4,
    (297 * 72) / 25.4,
  );
  expect(await savedProject()).toEqual(project);
  await page.screenshot({ path: path.join(root, "native-pdf-a4.png") });
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  evidence.checks.push(
    "A4 regenerates real PDF bytes with exact A4 dimensions and displayed page count; rich preview preserves merged table cells, code filename/caption and image; export leaves saved writing unchanged",
  );

  await manuscript().focus();
  await page.keyboard.press("Control+End");
  await manuscript().evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      "text/html",
      Array.from(
        { length: 70 },
        (_, index) =>
          `<p>Additional print validation paragraph ${index + 1}. This new section has enough written content to require more physical pages. The reference keeps its earlier chapters and expands only this section, so its updated PDF count must come from newly generated bytes.</p>`,
      ).join(""),
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await expect(page.locator(".outline-page-count")).toHaveText(
    /pages \(est\.\)/,
  );
  await page.locator(".outline-page-count").click();
  await readyPDF();
  expect(await generationCount()).toBe(3);
  const editedPages = await savePDF(
    "reference-a4-edited.pdf",
    (210 * 72) / 25.4,
    (297 * 72) / 25.4,
  );
  expect(editedPages).toBeGreaterThan(a4Pages);
  const edited = await savedProject();
  expect(edited.nodes.filter((node) => node.id !== "daily")).toEqual(
    project.nodes.filter((node) => node.id !== "daily"),
  );
  await dialog().getByRole("button", { name: "Close", exact: true }).click();
  evidence.checks.push(
    "Editing resets the cached exact count to an honest estimate; the next export regenerates bytes and confirms a larger PDF page count while other chapters remain unchanged",
  );

  const failure = await page.evaluate(async () => {
    try {
      await window.__TAURI_INTERNALS__.invoke("generate_native_pdf", {
        html: '<html><head><title>Broken image</title></head><body><img src="data:image/png;base64,invalid"></body></html>',
        paperSize: "letter",
        marginInches: 0.55,
      });
      return "unexpected success";
    } catch (error) {
      return String(error);
    }
  });
  expect(failure).toContain("image or font could not finish loading");
  const retryBytes = await page.evaluate(async () =>
    Array.from(
      new Uint8Array(
        await window.__TAURI_INTERNALS__.invoke("generate_native_pdf", {
          html: "<html><head><title>Retry verification</title></head><body><h1>Selectable retry text</h1><p>The failed print job has been cleaned up.</p></body></html>",
          paperSize: "letter",
          marginInches: 0.55,
        }),
      ),
    ),
  );
  const retry = await PDFDocument.load(Uint8Array.from(retryBytes));
  expect(retry.getPageCount()).toBe(1);
  expect(retry.getTitle()).toBe("Retry verification");
  await writeFile(
    path.join(root, "retry-after-missing-image.pdf"),
    Uint8Array.from(retryBytes),
  );
  await expect
    .poll(
      () =>
        browser
          .contexts()[0]
          .pages()
          .filter((candidate) => candidate.url().includes("codebook-print"))
          .length,
    )
    .toBe(0);
  evidence.checks.push(
    "Missing image generation reports an error, cleans up its hidden renderer, and allows a successful subsequent PDF; no print windows remain",
  );
  expect(evidence.errors).toEqual([]);
  evidence.checks.push(
    "No JavaScript runtime errors in the native outline and PDF workflows",
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
