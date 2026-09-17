import { test, expect } from "@playwright/test";
const openSample = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toBeVisible();
};
test("bookshelf, writing surface, and theme render without page errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your bookshelf." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/bookshelf.png", fullPage: true });
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(page.getByLabel("Code language")).toHaveValue("cpp");
  await expect(page.locator(".hljs-keyword").first()).toBeVisible();
  await page.screenshot({ path: "test-results/editor.png", fullPage: true });
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.locator(".structure")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".structure")).toBeVisible();
  expect(errors).toEqual([]);
});
test("native clipboard format retains code metadata and takes priority over HTML", async ({
  page,
}) => {
  await openSample(page);
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.focus();
  await page.keyboard.press("Control+a");
  const clipboard = await page.evaluate(() => {
    const data = new DataTransfer();
    document
      .querySelector(".tiptap")!
      .dispatchEvent(
        new ClipboardEvent("copy", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    return {
      native: data.getData("application/x-codebook"),
      html: data.getData("text/html"),
      plain: data.getData("text/plain"),
    };
  });
  expect(clipboard.native).toContain("hello.cpp");
  expect(clipboard.html).toContain("language-cpp");
  expect(clipboard.plain).toContain("std::cout");
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Native clipboard");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await editor.focus();
  await page.evaluate((data) => {
    const dt = new DataTransfer();
    dt.setData("application/x-codebook", data.native);
    dt.setData("text/html", "<p>Lower priority</p>");
    document
      .querySelector(".tiptap")!
      .dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
  }, clipboard);
  await expect(page.getByLabel("Code filename")).toHaveValue("hello.cpp");
  await expect(
    page.getByRole("button", { name: "Toggle line numbers" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(editor).not.toContainText("Lower priority");
  await page.getByLabel("Code language").selectOption("powershell");
  await expect(page.getByLabel("Code language")).toHaveValue("powershell");
});
test("HTML paste is sanitized and browser image files remain embedded", async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Rich paste");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Chapter manuscript" }).focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      '<h2>Browser content</h2><p><strong>Bold</strong> and <em>italic</em>.</p><pre><code class="language-python"><span>print</span>("hello")</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1EAAAAASUVORK5CYII=" alt="pixel" onerror="window.unsafe=true"><script>window.unsafe=true</script>',
    );
    document
      .querySelector(".tiptap")!
      .dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
  });
  await expect(page.locator(".manuscript h2")).toHaveText("Browser content");
  await expect(page.locator(".manuscript strong")).toHaveText("Bold");
  await expect(page.locator(".manuscript table tr")).toHaveCount(2);
  await expect(page.getByLabel("Code language")).toHaveValue("python");
  await expect(page.locator(".manuscript img")).toHaveAttribute(
    "src",
    /^data:image\/png/,
  );
  expect(await page.evaluate(() => "unsafe" in window)).toBe(false);
});
test("chapter drag ordering and part changes survive reload", async ({
  page,
}) => {
  await openSample(page);
  const variables = page.getByRole("button", { name: /02 Variables & types/ });
  const hello = page.getByRole("button", { name: /01 Hello, World!/ });
  await variables.dragTo(hello);
  await expect(
    page.getByRole("button", { name: /01 Variables & types/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /02 Hello, World!/ }).click();
  const partId = await page
    .getByLabel("Chapter part")
    .locator("option")
    .filter({ hasText: "Thinking in programs" })
    .getAttribute("value");
  await page.getByLabel("Chapter part").selectOption(partId!);
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /01 Variables & types/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Hello, World!/ }).click();
  await expect(page.getByLabel("Chapter part")).toHaveValue(partId!);
});
test("create, edit, move, save, reopen, search, and export a real book", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Practical Testing");
  await page.getByLabel("Author", { exact: true }).fill("An Author");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await page
    .getByLabel("Chapter title", { exact: true })
    .fill("The first test");
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.fill("A manuscript survives a restart.");
  await page.getByLabel("Chapter tags").fill("testing, quality");
  await page.getByLabel("NOTES TO SELF").fill("Private editorial reminder.");
  await page.getByLabel("Chapter status").selectOption("Revision");
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Second chapter");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  await editor.fill("Another useful idea.");
  await page.getByLabel("Chapter part").selectOption("");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Practical Testing", exact: true })
    .click();
  await page.getByRole("button", { name: /01 The first test/ }).click();
  await expect(editor).toContainText("A manuscript survives a restart.");
  await expect(page.getByLabel("Chapter status")).toHaveValue("Revision");
  await expect(page.getByLabel("NOTES TO SELF")).toHaveValue(
    "Private editorial reminder.",
  );
  await page.keyboard.press("Control+Shift+f");
  await page
    .getByRole("textbox", { name: "Search book", exact: true })
    .fill("Another useful");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Second chapter/ })
    .click();
  await expect(editor).toContainText("Another useful idea.");
  await page.getByRole("button", { name: "Close find" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export book", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("Practical Testing.md");
  await file.saveAs("test-results/Practical Testing.md");
});
test("pastes the exact technical acceptance fixture and preserves it after reload", async ({
  page,
}) => {
  await openSample(page);
  await page.getByRole("button", { name: "Add chapter", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Clipboard acceptance");
  await page
    .getByRole("button", { name: "Create chapter", exact: true })
    .click();
  const fixture =
    '## Hello, World!\n\nOur first program prints some text.\n\n```cpp\n#include <iostream>\n\nint main()\n{\n    std::cout << "Hello, World!\\n";\n}\n```\n\nThe `std::cout` object writes to standard output.\n\n### What happened?\n\n1. We included `<iostream>`.\n2. We created `main()`.\n3. We printed text.';
  await page.getByRole("textbox", { name: "Chapter manuscript" }).focus();
  await page.evaluate((text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, fixture);
  await expect(page.locator(".manuscript h2")).toHaveText("Hello, World!");
  await expect(page.getByLabel("Code language")).toHaveValue("cpp");
  await expect(page.locator(".manuscript ol li")).toHaveCount(3);
  await expect(page.locator(".manuscript p code").first()).toContainText(
    "std::cout",
  );
  await page.getByLabel("Code filename").fill("acceptance.cpp");
  await page
    .getByRole("button", { name: "Saved on this device", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Open Learning C++", exact: true })
    .click();
  await page.getByRole("button", { name: /Clipboard acceptance/ }).click();
  await expect(page.getByLabel("Code filename")).toHaveValue("acceptance.cpp");
  await expect(page.locator(".manuscript h3")).toHaveText("What happened?");
});
test("formatting, table edits, replace, and private project export work", async ({
  page,
}) => {
  await openSample(page);
  await page.keyboard.press("Control+f");
  await page.getByRole("textbox", { name: "Find in chapter" }).fill("small");
  await page.getByRole("textbox", { name: "Replace with" }).fill("little");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".manuscript")).toContainText("a little one");
  await page.getByRole("button", { name: "Close find" }).click();
  await page.getByRole("textbox", { name: "Chapter manuscript" }).click();
  await page.keyboard.press("Control+End");
  await page.getByRole("button", { name: "Insert table", exact: true }).click();
  await expect(page.locator(".manuscript table")).toHaveCount(1);
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(page.locator(".manuscript tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: /CodeBook project/ }).click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export project", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("Learning C++.codebook");
});
