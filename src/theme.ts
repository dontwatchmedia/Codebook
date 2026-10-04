import { invoke, isTauri } from "@tauri-apps/api/core";

export const themeOptions = [
  {
    id: "light",
    label: "Light",
    dark: false,
    swatch: "#f8f8f4",
    description: "Ivory paper and forest accents",
  },
  {
    id: "sepia",
    label: "Sepia",
    dark: false,
    swatch: "#f1eadc",
    description: "Warm paper and soft brown accents",
  },
  {
    id: "dark",
    label: "Dark",
    dark: true,
    swatch: "#1c2520",
    description: "Deep green with gentle contrast",
  },
  {
    id: "midnight",
    label: "Midnight",
    dark: true,
    swatch: "#111b2c",
    description: "Dark navy and clear blue accents",
  },
  {
    id: "ocean",
    label: "Ocean",
    dark: false,
    swatch: "#e3f0f5",
    description: "Cool blue paper and ocean accents",
  },
  {
    id: "rose",
    label: "Rose",
    dark: false,
    swatch: "#f4e5ee",
    description: "Soft pink paper and berry accents",
  },
  {
    id: "lavender",
    label: "Lavender",
    dark: false,
    swatch: "#ece5f8",
    description: "Pale purple paper and violet accents",
  },
] as const;
export type Theme = (typeof themeOptions)[number]["id"];
export const themeIds: readonly Theme[] = themeOptions.map(({ id }) => id);
export const isTheme = (value: unknown): value is Theme =>
  typeof value === "string" && themeIds.includes(value as Theme);
export const isDarkTheme = (theme: string): boolean =>
  themeOptions.some((option) => option.id === theme && option.dark);

export function applyTheme(theme: string) {
  const selected = isTheme(theme) ? theme : "light";
  document.documentElement.dataset.theme = selected;
  document.documentElement.dataset.colorScheme = isDarkTheme(selected)
    ? "dark"
    : "light";
}

export function readTheme(): Theme {
  try {
    const saved = localStorage.getItem("codebook.theme");
    if (isTheme(saved)) return saved;
  } catch {
    /* Storage may be unavailable; the editor can still open. */
  }
  return "light";
}

// Set the saved appearance before React renders the library or loading screen.
applyTheme(readTheme());

export async function loadTheme() {
  if (!isTauri()) return;
  const saved = await invoke<string | null>("get_theme_preference");
  if (isTheme(saved)) {
    try {
      localStorage.setItem("codebook.theme", saved);
    } catch {
      /* Native preferences still persist. */
    }
    applyTheme(saved);
  }
}

let themeWrite = Promise.resolve();
export function saveTheme(theme: string) {
  if (!isTheme(theme)) return Promise.reject(new Error("Unknown color theme"));
  try {
    localStorage.setItem("codebook.theme", theme);
  } catch {
    /* Native preferences still persist. */
  }
  if (isTauri())
    themeWrite = themeWrite
      .catch(() => {})
      .then(() => invoke<void>("set_theme_preference", { theme }));
  return themeWrite;
}
