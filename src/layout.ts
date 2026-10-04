import { invoke, isTauri } from "@tauri-apps/api/core";

export type WritingLayout = "compact" | "original";
export function readLayout(): WritingLayout {
  try {
    return localStorage.getItem("codebook.layout") === "original"
      ? "original"
      : "compact";
  } catch {
    return "compact";
  }
}
export function applyLayout(layout: WritingLayout) {
  document.documentElement.dataset.layout = layout;
}
applyLayout(readLayout());
export async function loadLayout() {
  if (!isTauri()) return;
  const saved = await invoke<string | null>("get_layout_preference");
  if (saved === "compact" || saved === "original") {
    try {
      localStorage.setItem("codebook.layout", saved);
    } catch {
      /* Native preferences remain available. */
    }
    applyLayout(saved);
  }
}
let layoutWrite = Promise.resolve();
export function saveLayout(layout: WritingLayout) {
  try {
    localStorage.setItem("codebook.layout", layout);
  } catch {
    /* Native preferences still persist. */
  }
  if (isTauri())
    layoutWrite = layoutWrite
      .catch(() => {})
      .then(() => invoke<void>("set_layout_preference", { layout }));
  return layoutWrite;
}
