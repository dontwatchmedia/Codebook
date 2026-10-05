import { expect, test, type Locator, type Page } from "@playwright/test";

const preferenceKey = "codebook.sidebarWidth";

async function createBook(page: Page, title: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "New book", exact: true }).click();
  await page.getByLabel("Book title").fill(title);
  await page.getByRole("button", { name: "Create book", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Chapter manuscript" }),
  ).toBeVisible();
}

async function width(panel: Locator) {
  return (await panel.boundingBox())!.width;
}

async function dragDivider(page: Page, distance: number) {
  const divider = page.getByRole("separator", { name: "Resize left panel" });
  const bounds = (await divider.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + Math.min(bounds.height / 2, 180);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + distance, y, { steps: 12 });
  await page.mouse.up();
}

async function savedNodes(page: Page, title: string) {
  await expect(
    page.getByRole("button", { name: "Saved on this device", exact: true }),
  ).toBeVisible();
  return page.evaluate((wanted) => {
    const books = JSON.parse(
      localStorage.getItem("codebook.library.v1") || "[]",
    );
    // Opening an editor may refresh a node's modification timestamp. Compare
    // its content and hierarchy, which resizing must leave untouched.
    return books
      .find((book: { title: string }) => book.title === wanted)
      ?.nodes.map(
        ({ modified: _modified, ...node }: { modified: string }) => node,
      );
  }, title);
}

async function preferredWidth(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    preferenceKey,
  );
}

test("dragging the left divider widens and narrows the outline and remembers its width without changing chapters", async ({
  page,
}) => {
  const title = "Resizable chapter outline";
  await createBook(page, title);
  await page
    .getByLabel("Chapter title", { exact: true })
    .fill("A longer chapter title that needs room in the outline");
  await page
    .getByRole("textbox", { name: "Chapter manuscript" })
    .fill(
      "Resizing the outline keeps this writing and every chapter in place.",
    );
  await expect
    .poll(async () => JSON.stringify(await savedNodes(page, title)))
    .toContain("keeps this writing");
  const originalNodes = await savedNodes(page, title);
  const panel = page.locator(".structure");
  const initial = await width(panel);
  const titleCell = page.locator(".chapter-row.current .outline-title");
  const initialTitleWidth = (await titleCell.boundingBox())!.width;

  await dragDivider(page, 160);
  await expect.poll(() => width(panel)).toBeCloseTo(initial + 160, 0);
  expect((await titleCell.boundingBox())!.width).toBeGreaterThan(
    initialTitleWidth + 100,
  );
  await dragDivider(page, -80);
  const chosen = initial + 80;
  await expect.poll(() => width(panel)).toBeCloseTo(chosen, 0);
  await expect.poll(() => preferredWidth(page)).toBeCloseTo(chosen, 0);
  expect(await savedNodes(page, title)).toEqual(originalNodes);

  await page.reload();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
  await expect.poll(() => width(panel)).toBeCloseTo(chosen, 0);
  expect(await savedNodes(page, title)).toEqual(originalNodes);
});

test("the divider supports keyboard sizing, width limits, and double-click reset", async ({
  page,
}) => {
  await createBook(page, "Keyboard sidebar sizing");
  const panel = page.locator(".structure");
  const initial = await width(panel);
  const divider = page.getByRole("separator", { name: "Resize left panel" });
  await expect(divider).toHaveAttribute("aria-orientation", "vertical");
  await divider.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => width(panel)).toBeCloseTo(180, 0);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => width(panel)).toBeCloseTo(180, 0);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => width(panel)).toBeCloseTo(190, 0);
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => width(panel)).toBeCloseTo(240, 0);
  await page.keyboard.press("End");
  await expect.poll(() => width(panel)).toBeCloseTo(640, 0);
  await page.keyboard.press("ArrowRight");
  await expect(divider).toHaveAttribute("aria-valuenow", "640");
  await expect.poll(() => preferredWidth(page)).toBe(640);
  for (const cancel of ["Escape", "blur", "pointercapture"]) {
    const bounds = (await divider.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + 180;
    if (cancel === "pointercapture") {
      await divider.evaluate((element) => {
        element.addEventListener(
          "pointerdown",
          (event) => {
            element.setAttribute(
              "data-test-pointer-id",
              String((event as PointerEvent).pointerId),
            );
          },
          { once: true },
        );
      });
    }
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 80, y, { steps: 8 });
    await expect.poll(() => width(panel)).toBeCloseTo(560, 0);
    if (cancel === "Escape") await page.keyboard.press("Escape");
    else if (cancel === "blur")
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else {
      await divider.evaluate((element) => {
        element.releasePointerCapture(
          Number(element.getAttribute("data-test-pointer-id")),
        );
        element.removeAttribute("data-test-pointer-id");
      });
      // A pointer event flushes the pending lost-capture event before mouseup.
      await page.mouse.move(x - 81, y);
    }
    await page.mouse.up();
    await expect.poll(() => width(panel)).toBeCloseTo(640, 0);
    expect(await preferredWidth(page)).toBe(640);
    await expect(page.locator("html")).not.toHaveClass(/resizing-sidebar/);
  }
  await divider.dblclick();
  await expect.poll(() => width(panel)).toBeCloseTo(initial, 0);
  await expect.poll(() => preferredWidth(page)).toBeNull();
});

test("a wide outline adapts to the smallest desktop window and restores the chosen width when room returns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await createBook(page, "Responsive sidebar sizing");
  const panel = page.locator(".structure");
  const divider = page.getByRole("separator", { name: "Resize left panel" });
  await divider.focus();
  await page.keyboard.press("End");
  await expect.poll(() => width(panel)).toBeCloseTo(640, 0);
  await page.setViewportSize({ width: 960, height: 650 });
  await expect.poll(() => width(panel)).toBeLessThan(640);
  const withInspector = await width(panel);
  expect(await width(page.locator(".editor-column"))).toBeGreaterThanOrEqual(
    359,
  );
  expect(await preferredWidth(page)).toBe(640);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await page
    .getByRole("button", { name: "Close inspector", exact: true })
    .click();
  await expect.poll(() => width(panel)).toBeGreaterThan(withInspector + 100);
  expect(await width(page.locator(".editor-column"))).toBeGreaterThanOrEqual(
    359,
  );
  await page
    .getByRole("button", { name: "Toggle inspector", exact: true })
    .click();
  await expect.poll(() => width(panel)).toBeCloseTo(withInspector, 0);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect.poll(() => width(panel)).toBeCloseTo(640, 0);
  expect(await preferredWidth(page)).toBe(640);
});

test("system bibles resize too and focus mode returns to the same outline width and hierarchy", async ({
  page,
}) => {
  const title = "Resizable systems bible";
  await page.goto("/");
  await page
    .getByRole("button", { name: "New system bible", exact: true })
    .click();
  await page.getByLabel("Project title").fill(title);
  await page
    .getByRole("button", { name: "Create system bible", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add child to Overview", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Title", { exact: true })
    .fill("Living world and its systems");
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  const content = page.getByRole("textbox", {
    name: "Section content",
    exact: true,
  });
  await content.fill(
    "A nested subsystem keeps its parent and formatted content.",
  );
  await expect
    .poll(async () => JSON.stringify(await savedNodes(page, title)))
    .toContain("keeps its parent");
  const originalNodes = await savedNodes(page, title);
  const panel = page.locator(".structure");
  const initial = await width(panel);
  await dragDivider(page, 120);
  const chosen = initial + 120;
  await expect.poll(() => width(panel)).toBeCloseTo(chosen, 0);
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("separator", { name: "Resize left panel" }),
  ).toBeHidden();
  await expect(content).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeVisible();
  await expect.poll(() => width(panel)).toBeCloseTo(chosen, 0);
  expect(await savedNodes(page, title)).toEqual(originalNodes);
  await expect(page.locator(".outline-row[data-depth='1']")).toContainText(
    "Living world and its systems",
  );
});
