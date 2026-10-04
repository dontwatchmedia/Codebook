import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@tauri-apps/api/core", () => mocks);
import {
  applyTheme,
  isDarkTheme,
  isTheme,
  loadTheme,
  readTheme,
  saveTheme,
  themeIds,
  themeOptions,
} from "../../src/theme";

describe("Color theme preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    mocks.isTauri.mockReset().mockReturnValue(false);
    applyTheme("light");
  });
  it("offers eight distinct themes and recognizes both dark palettes", () => {
    expect(themeIds).toEqual([
      "light",
      "white",
      "sepia",
      "dark",
      "midnight",
      "ocean",
      "rose",
      "lavender",
    ]);
    expect(new Set(themeOptions.map((option) => option.swatch)).size).toBe(8);
    for (const theme of themeIds) expect(isTheme(theme)).toBe(true);
    expect(isTheme("unknown")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("midnight")).toBe(true);
    for (const theme of [
      "light",
      "white",
      "sepia",
      "ocean",
      "rose",
      "lavender",
    ])
      expect(isDarkTheme(theme)).toBe(false);
  });
  it("persists and reapplies each palette with the correct native color scheme", async () => {
    for (const theme of themeIds) {
      await saveTheme(theme);
      expect(readTheme()).toBe(theme);
      applyTheme(readTheme());
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(document.documentElement.dataset.colorScheme).toBe(
        isDarkTheme(theme) ? "dark" : "light",
      );
    }
  });
  it("falls back safely for invalid values and preserves the current preference", async () => {
    await saveTheme("rose");
    await expect(saveTheme("unknown")).rejects.toThrow("Unknown color theme");
    expect(readTheme()).toBe("rose");
    localStorage.setItem("codebook.theme", "unknown");
    expect(readTheme()).toBe("light");
    applyTheme("unknown");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("loads a new theme from native preferences before displaying the workspace", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue("midnight");
    await loadTheme();
    expect(mocks.invoke).toHaveBeenCalledWith("get_theme_preference");
    expect(readTheme()).toBe("midnight");
    expect(document.documentElement.dataset.colorScheme).toBe("dark");
  });
  it("loads the White palette from native preferences with a light color scheme", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValue("white");
    await loadTheme();
    expect(readTheme()).toBe("white");
    expect(document.documentElement.dataset.theme).toBe("white");
    expect(document.documentElement.dataset.colorScheme).toBe("light");
    await saveTheme("white");
    expect(mocks.invoke).toHaveBeenLastCalledWith("set_theme_preference", {
      theme: "white",
    });
  });
  it("writes rapid native theme changes in their requested order", async () => {
    mocks.isTauri.mockReturnValue(true);
    await Promise.all([saveTheme("ocean"), saveTheme("lavender")]);
    expect(mocks.invoke.mock.calls).toEqual([
      ["set_theme_preference", { theme: "ocean" }],
      ["set_theme_preference", { theme: "lavender" }],
    ]);
    expect(readTheme()).toBe("lavender");
  });
});
