import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => false),
}));
vi.mock("@tauri-apps/api/core", () => mocks);
import {
  DEFAULT_WRITING_ZOOM,
  MAX_WRITING_ZOOM,
  MIN_WRITING_ZOOM,
  isWritingZoom,
  loadZoom,
  readZoom,
  saveZoom,
} from "../../src/zoom";

describe("Writing zoom preferences", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mocks.invoke.mockReset().mockResolvedValue(undefined);
    mocks.isTauri.mockReset().mockReturnValue(false);
  });

  it("defaults to 100 percent and accepts integer percentages from 50 to 200", () => {
    expect(readZoom()).toBe(DEFAULT_WRITING_ZOOM);
    expect(MIN_WRITING_ZOOM).toBe(50);
    expect(MAX_WRITING_ZOOM).toBe(200);
    for (const zoom of [50, 80, 100, 137, 200])
      expect(isWritingZoom(zoom)).toBe(true);
    for (const zoom of [null, undefined, "80", 0, 49, 201, 80.5, NaN, Infinity])
      expect(isWritingZoom(zoom)).toBe(false);
  });

  it("persists a writing percentage without changing the document", async () => {
    for (const zoom of [50, 80, 100, 137, 200]) {
      await saveZoom(zoom);
      expect(readZoom()).toBe(zoom);
      expect(localStorage.getItem("codebook.writingZoom")).toBe(String(zoom));
    }
  });

  it("falls back for corrupt values and rejects invalid writes", async () => {
    await saveZoom(80);
    for (const zoom of [49, 201, 80.5, NaN, Infinity]) {
      await expect(saveZoom(zoom)).rejects.toThrow("Writing zoom must be");
      expect(readZoom()).toBe(80);
    }
    for (const saved of [
      "",
      "unknown",
      "null",
      "49",
      "201",
      "80.5",
      "Infinity",
    ]) {
      localStorage.setItem("codebook.writingZoom", saved);
      expect(readZoom()).toBe(100);
    }
  });

  it("reads native zoom before rendering and restores a safe default for invalid native values", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockResolvedValueOnce(80);
    await loadZoom();
    expect(mocks.invoke).toHaveBeenCalledWith("get_writing_zoom");
    expect(readZoom()).toBe(80);
    for (const saved of [null, undefined, "80", 49, 201, 80.5]) {
      mocks.invoke.mockResolvedValueOnce(saved);
      await loadZoom();
      expect(readZoom()).toBe(100);
    }
  });

  it("serializes rapid native writes and keeps the last requested zoom", async () => {
    mocks.isTauri.mockReturnValue(true);
    await Promise.all([saveZoom(80), saveZoom(125), saveZoom(100)]);
    expect(mocks.invoke.mock.calls).toEqual([
      ["set_writing_zoom", { zoom: 80 }],
      ["set_writing_zoom", { zoom: 125 }],
      ["set_writing_zoom", { zoom: 100 }],
    ]);
    expect(readZoom()).toBe(100);
  });

  it("recovers the native write queue after a failed write", async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.invoke.mockRejectedValueOnce(
      new Error("Preference file unavailable"),
    );
    await expect(saveZoom(80)).rejects.toThrow("Preference file unavailable");
    await expect(saveZoom(90)).resolves.toBeUndefined();
    expect(mocks.invoke.mock.calls).toEqual([
      ["set_writing_zoom", { zoom: 80 }],
      ["set_writing_zoom", { zoom: 90 }],
    ]);
  });

  it("opens safely when browser preference storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(readZoom()).toBe(100);
    mocks.isTauri.mockReturnValue(true);
    await expect(saveZoom(80)).resolves.toBeUndefined();
    expect(mocks.invoke).toHaveBeenCalledWith("set_writing_zoom", { zoom: 80 });
  });
});
