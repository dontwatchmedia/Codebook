import { invoke, isTauri } from "@tauri-apps/api/core";

export const MIN_WRITING_ZOOM = 50;
export const MAX_WRITING_ZOOM = 200;
export const DEFAULT_WRITING_ZOOM = 100;
const preferenceKey = "codebook.writingZoom";

export const isWritingZoom = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= MIN_WRITING_ZOOM &&
  value <= MAX_WRITING_ZOOM;

export function readZoom(): number {
  try {
    const saved = localStorage.getItem(preferenceKey);
    const value = saved === null ? null : Number(saved);
    if (isWritingZoom(value)) return value;
  } catch {
    /* The editor can still open when storage is unavailable. */
  }
  return DEFAULT_WRITING_ZOOM;
}

export async function loadZoom() {
  if (!isTauri()) return;
  const saved = await invoke<unknown>("get_writing_zoom");
  const zoom = isWritingZoom(saved) ? saved : DEFAULT_WRITING_ZOOM;
  try {
    localStorage.setItem(preferenceKey, String(zoom));
  } catch {
    /* Native preferences remain available. */
  }
}

let zoomWrite = Promise.resolve();
export function saveZoom(zoom: number) {
  if (!isWritingZoom(zoom))
    return Promise.reject(
      new Error("Writing zoom must be an integer from 50 to 200"),
    );
  try {
    localStorage.setItem(preferenceKey, String(zoom));
  } catch {
    /* Native preferences still persist. */
  }
  if (isTauri())
    zoomWrite = zoomWrite
      .catch(() => {})
      .then(() => invoke<void>("set_writing_zoom", { zoom }));
  return zoomWrite;
}
