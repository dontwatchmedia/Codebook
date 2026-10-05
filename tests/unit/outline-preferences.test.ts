import { beforeEach, describe, expect, it, vi } from "vitest";

let preferences: typeof import("../../src/outlinePreferences");
beforeEach(async () => {
  vi.restoreAllMocks();
  vi.resetModules();
  localStorage.clear();
  preferences = await import("../../src/outlinePreferences");
});

describe("outline view preferences", () => {
  it("uses a compact readable default and bounds outline zoom independently of writing", () => {
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 100,
      footerCollapsed: false,
    });
    for (const zoom of [80, 100, 160, 200])
      expect(preferences.isOutlineZoom(zoom)).toBe(true);
    for (const zoom of [79, 201, 100.5, "120", NaN, Infinity])
      expect(preferences.isOutlineZoom(zoom)).toBe(false);
    localStorage.setItem("codebook.writingZoom", "80");
    localStorage.setItem("codebook.theme", "white");
    preferences.saveOutlinePreferences({ zoom: 150, footerCollapsed: true });
    expect(localStorage.getItem("codebook.writingZoom")).toBe("80");
    expect(localStorage.getItem("codebook.theme")).toBe("white");
    expect(
      preferences.saveOutlinePreferences({ zoom: 500, footerCollapsed: false }),
    ).toBe(false);
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 150,
      footerCollapsed: true,
    });
  });

  it("retains zoom and footer choice after reopening and ignores damaged fields", async () => {
    preferences.saveOutlinePreferences({ zoom: 130, footerCollapsed: true });
    vi.resetModules();
    preferences = await import("../../src/outlinePreferences");
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 130,
      footerCollapsed: true,
    });
    localStorage.setItem(
      "codebook.outlinePreferences.v1",
      JSON.stringify({ zoom: -1, footerCollapsed: true }),
    );
    vi.resetModules();
    preferences = await import("../../src/outlinePreferences");
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 100,
      footerCollapsed: true,
    });
    localStorage.setItem("codebook.outlinePreferences.v1", "broken JSON");
    vi.resetModules();
    preferences = await import("../../src/outlinePreferences");
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 100,
      footerCollapsed: false,
    });
  });

  it("keeps a defensive copy of each book's collapsed branches", async () => {
    const ids = ["parent", "child", "parent", "", "x".repeat(101)];
    preferences.saveCollapsedSections("book-a", ids);
    preferences.saveCollapsedSections("book-b", ["other-parent"]);
    ids.push("added-later");
    expect(preferences.readCollapsedSections("book-a")).toEqual([
      "parent",
      "child",
    ]);
    const returned = preferences.readCollapsedSections("book-a");
    returned.length = 0;
    expect(preferences.readCollapsedSections("book-a")).toEqual([
      "parent",
      "child",
    ]);
    vi.resetModules();
    preferences = await import("../../src/outlinePreferences");
    expect(preferences.readCollapsedSections("book-b")).toEqual([
      "other-parent",
    ]);
    preferences.saveCollapsedSections("book-a", []);
    expect(preferences.readCollapsedSections("book-a")).toEqual([]);
    expect(preferences.readCollapsedSections("book-b")).toEqual([
      "other-parent",
    ]);
  });

  it("bounds old projects and section identifiers in the local view history", () => {
    for (let index = 0; index < 110; index++)
      preferences.saveCollapsedSections(`book-${index}`, ["branch"]);
    expect(preferences.readCollapsedSections("book-0")).toEqual([]);
    expect(preferences.readCollapsedSections("book-109")).toEqual(["branch"]);
    const many = Array.from({ length: 6000 }, (_, index) => `id-${index}`);
    preferences.saveCollapsedSections("large-a", many);
    preferences.saveCollapsedSections("large-b", many);
    expect(preferences.readCollapsedSections("large-a")).toHaveLength(5000);
    expect(preferences.readCollapsedSections("large-b")).toHaveLength(5000);
    expect(
      JSON.parse(localStorage.getItem("codebook.outlineCollapsed.v1")!).reduce(
        (sum: number, entry: { ids: string[] }) => sum + entry.ids.length,
        0,
      ),
    ).toBeLessThanOrEqual(10000);
  });

  it("remembers choices during the session if browser storage fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    preferences.saveOutlinePreferences({ zoom: 120, footerCollapsed: true });
    preferences.saveCollapsedSections("book", ["branch"]);
    expect(preferences.readOutlinePreferences()).toEqual({
      zoom: 120,
      footerCollapsed: true,
    });
    expect(preferences.readCollapsedSections("book")).toEqual(["branch"]);
  });
});
