import { invoke, isTauri } from "@tauri-apps/api/core";

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 640;
export type SidebarWidth = number | null;
const preferenceKey = "codebook.sidebarWidth";

export const isSidebarWidth = (value: unknown): value is SidebarWidth =>
  value === null ||
  (typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_SIDEBAR_WIDTH &&
    value <= MAX_SIDEBAR_WIDTH);

export function readSidebarWidth(): SidebarWidth {
  try {
    const saved = localStorage.getItem(preferenceKey);
    const value: unknown = saved === null ? null : JSON.parse(saved);
    if (isSidebarWidth(value)) return value;
  } catch {
    /* The panel keeps its responsive default when storage is unavailable. */
  }
  return null;
}

export async function loadSidebarWidth() {
  if (!isTauri()) return;
  const saved = await invoke<unknown>("get_sidebar_width");
  const width = isSidebarWidth(saved) ? saved : null;
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(width));
  } catch {
    /* Native preferences remain available. */
  }
}

let sidebarWrite = Promise.resolve();
export function saveSidebarWidth(width: SidebarWidth) {
  if (!isSidebarWidth(width))
    return Promise.reject(
      new Error("Sidebar width must be an integer from 180 to 640, or null"),
    );
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(width));
  } catch {
    /* Native preferences still persist. */
  }
  if (isTauri())
    sidebarWrite = sidebarWrite
      .catch(() => {})
      .then(() => invoke<void>("set_sidebar_width", { width }));
  return sidebarWrite;
}
