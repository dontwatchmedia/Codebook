export function readTheme(): string {
  try {
    const saved = localStorage.getItem("codebook.theme");
    if (saved && ["light", "dark", "sepia"].includes(saved)) return saved;
  } catch {
    /* Storage may be unavailable; the editor can still open. */
  }
  return "light";
}

// Set the saved appearance before React renders the library or loading screen.
document.documentElement.dataset.theme = readTheme();

export async function loadTheme() {
  if (!isTauri()) return;
  const saved = await invoke<string | null>("get_theme_preference");
  if (saved && ["light", "dark", "sepia"].includes(saved)) {
    localStorage.setItem("codebook.theme", saved);
    document.documentElement.dataset.theme = saved;
  }
}

let themeWrite = Promise.resolve();
export function saveTheme(theme: string) {
  localStorage.setItem("codebook.theme", theme);
  if (isTauri())
    themeWrite = themeWrite
      .catch(() => {})
      .then(() => invoke<void>("set_theme_preference", { theme }));
  return themeWrite;
}
import { invoke, isTauri } from "@tauri-apps/api/core";
