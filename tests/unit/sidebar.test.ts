import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@tauri-apps/api/core", () => mocks);
import {
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  isSidebarWidth,
  loadSidebarWidth,
  readSidebarWidth,
  saveSidebarWidth,
} from "../../src/sidebar";

describe("Sidebar width preferences", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    mocks.isTauri.mockReset().mockReturnValue(false);
  });

  it("uses the responsive default and accepts integer widths from 180 to 640 or reset", () => {
    expect(readSidebarWidth()).toBeNull();
    expect(MIN_SIDEBAR_WIDTH).toBe(180);
    expect(MAX_SIDEBAR_WIDTH).toBe(640);
    for (const width of [null, 180, 240, 420, 640])
      expect(isSidebarWidth(width)).toBe(true);
    for (const width of [
      undefined,
      "320",
      true,
      0,
      179,
      641,
      320.5,
      NaN,
      Infinity,
    ])
      expect(isSidebarWidth(width)).toBe(false);
  });

  it("persists the chosen width and restores the responsive default on reset", async () => {
    localStorage.setItem("codebook.theme", "white");
    localStorage.setItem("codebook.writingZoom", "80");
    for (const width of [180, 420, 640, null]) {
      await saveSidebarWidth(width);
      expect(readSidebarWidth()).toBe(width);
      expect(localStorage.getItem("codebook.sidebarWidth")).toBe(
        JSON.stringify(width),
      );
    }
    expect(localStorage.getItem("codebook.theme")).toBe("white");
    expect(localStorage.getItem("codebook.writingZoom")).toBe("80");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("ignores corrupt saved widths and rejects invalid writes without replacing the saved width", async () => {
    await saveSidebarWidth(320);
    for (const width of [179, 641, 320.5, NaN, Infinity]) {
      await expect(saveSidebarWidth(width)).rejects.toThrow(
        "Sidebar width must be",
      );
      expect(readSidebarWidth()).toBe(320);
    }
    for (const saved of [
      "",
      "unknown",
      '"320"',
      "true",
      "[]",
      "{}",
      "179",
      "641",
      "320.5",
      "Infinity",
    ]) {
      localStorage.setItem("codebook.sidebarWidth", saved);
      expect(readSidebarWidth()).toBeNull();
      expect(localStorage.getItem("codebook.sidebarWidth")).toBe(saved);
    }
  });

  it("loads the native width before rendering and treats invalid native values as reset", async () => {
    await loadSidebarWidth();
    expect(mocks.invoke).not.toHaveBeenCalled();
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValueOnce(420);
    await loadSidebarWidth();
    expect(mocks.invoke).toHaveBeenCalledWith("get_sidebar_width");
    expect(readSidebarWidth()).toBe(420);
    for (const saved of [null, undefined, "320", 179, 641, 320.5]) {
      mocks.invoke.mockResolvedValueOnce(saved);
      await loadSidebarWidth();
      expect(readSidebarWidth()).toBeNull();
    }
  });

  it("serializes pending native writes so a reset cannot be overwritten by an earlier width", async () => {
    mocks.isTauri.mockReturnValue(true);
    let releaseFirst!: () => void;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    mocks.invoke.mockReturnValueOnce(firstPending);
    const first = saveSidebarWidth(320);
    const second = saveSidebarWidth(500);
    const reset = saveSidebarWidth(null);
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(mocks.invoke.mock.calls[0]).toEqual([
      "set_sidebar_width",
      { width: 320 },
    ]);
    expect(readSidebarWidth()).toBeNull();
    releaseFirst();
    await Promise.all([first, second, reset]);
    expect(mocks.invoke.mock.calls).toEqual([
      ["set_sidebar_width", { width: 320 }],
      ["set_sidebar_width", { width: 500 }],
      ["set_sidebar_width", { width: null }],
    ]);
  });

  it("recovers the native write queue after a failed write", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValueOnce(
      new Error("Preference file unavailable"),
    );
    await expect(saveSidebarWidth(320)).rejects.toThrow(
      "Preference file unavailable",
    );
    await expect(saveSidebarWidth(420)).resolves.toBeUndefined();
    expect(mocks.invoke.mock.calls).toEqual([
      ["set_sidebar_width", { width: 320 }],
      ["set_sidebar_width", { width: 420 }],
    ]);
    expect(readSidebarWidth()).toBe(420);
  });

  it("preserves the cached width when native loading fails", async () => {
    await saveSidebarWidth(320);
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValueOnce(
      new Error("Preference file unavailable"),
    );
    await expect(loadSidebarWidth()).rejects.toThrow(
      "Preference file unavailable",
    );
    expect(readSidebarWidth()).toBe(320);
  });

  it("continues using native preferences when browser storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readSidebarWidth()).toBeNull();
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValueOnce(320);
    await expect(loadSidebarWidth()).resolves.toBeUndefined();
    await expect(saveSidebarWidth(420)).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith("set_sidebar_width", {
      width: 420,
    });
  });
});
