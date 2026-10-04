import { expect, test } from "@playwright/test";

test("dark mode keeps source ink readable inside explicit block and inline backgrounds", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill("Imported highlights");
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Chapter manuscript" });
  await editor.focus();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData(
      "text/html",
      `
      <p style="background-color:white"><span style="color:black;font-family:Arial;font-size:11pt">White block writing</span></p>
      <blockquote style="background-color:#fff2cc"><p><span style="color:black;font-family:Arial;font-size:11pt">Yellow block writing</span></p></blockquote>
      <p><span style="color:black;background-color:#fff2cc;font-family:Arial;font-size:11pt">Yellow inline highlight</span></p>
      <p><span style="color:black;font-family:Arial;font-size:11pt">Ordinary dark paper writing</span></p>
      <p style="background-color:rgba(255,255,255,0)"><span style="color:black">Transparent RGBA writing</span></p>
      <p style="background-color:hsla(0,0%,100%,0)"><span style="color:black">Transparent HSLA writing</span></p>
      <p style="background-color:#fff0"><span style="color:black">Transparent short hex writing</span></p>
      <p style="background-color:#ffffff00"><span style="color:black">Transparent long hex writing</span></p>`,
    );
    document.querySelector(".tiptap")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await page
    .getByRole("button", { name: "Switch to dark mode", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const whiteText = editor
    .locator("span")
    .filter({ hasText: /^White block writing$/ });
  const yellowText = editor
    .locator("span")
    .filter({ hasText: /^Yellow block writing$/ });
  const inlineHighlight = editor
    .locator("span")
    .filter({ hasText: /^Yellow inline highlight$/ });
  const ordinary = editor
    .locator("span")
    .filter({ hasText: /^Ordinary dark paper writing$/ });
  await expect(whiteText).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(yellowText).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(inlineHighlight).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(whiteText.locator("..")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await expect(editor.locator("blockquote")).toHaveCSS(
    "background-color",
    "rgb(255, 242, 204)",
  );
  await expect(inlineHighlight).toHaveCSS(
    "background-color",
    "rgb(255, 242, 204)",
  );
  const darkInk = await editor.evaluate(
    (element) => getComputedStyle(element).color,
  );
  await expect(ordinary).toHaveCSS("color", darkInk);
  for (const label of [
    "Transparent RGBA writing",
    "Transparent HSLA writing",
    "Transparent short hex writing",
    "Transparent long hex writing",
  ]) {
    const transparentText = editor.locator("span").filter({ hasText: label });
    await expect(transparentText).toHaveCSS("color", darkInk);
    await expect(transparentText.locator("..")).not.toHaveAttribute(
      "data-document-background",
      "explicit",
    );
  }
  expect(darkInk).not.toBe("rgb(0, 0, 0)");
  const saved = await page.evaluate(() =>
    [
      localStorage.getItem("codebook.library.v1"),
      localStorage.getItem("codebook.recovery.v1"),
    ].join("\n"),
  );
  expect(saved).toMatch(/"color":"(?:black|rgb\(0, 0, 0\))"/);
  expect(saved).not.toContain("data-document-background");
  await page
    .getByRole("button", { name: "Switch to light mode", exact: true })
    .click();
  await expect(ordinary).toHaveCSS("color", "rgb(0, 0, 0)");
});
