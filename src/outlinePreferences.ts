export const MIN_OUTLINE_ZOOM = 80;
export const MAX_OUTLINE_ZOOM = 200;
export const DEFAULT_OUTLINE_ZOOM = 100;
export interface OutlinePreferences {
  zoom: number;
  footerCollapsed: boolean;
}

const preferenceKey = "codebook.outlinePreferences.v1";
const collapseKey = "codebook.outlineCollapsed.v1";
const defaults: OutlinePreferences = {
  zoom: DEFAULT_OUTLINE_ZOOM,
  footerCollapsed: false,
};
let preferenceCache: OutlinePreferences | undefined;
let collapseCache: { bookId: string; ids: string[] }[] | undefined;

export function isOutlineZoom(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_OUTLINE_ZOOM &&
    value <= MAX_OUTLINE_ZOOM
  );
}

export function readOutlinePreferences(): OutlinePreferences {
  if (preferenceCache) return { ...preferenceCache };
  preferenceCache = { ...defaults };
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) || "null");
    if (isOutlineZoom(value?.zoom)) preferenceCache.zoom = value.zoom;
    if (typeof value?.footerCollapsed === "boolean")
      preferenceCache.footerCollapsed = value.footerCollapsed;
  } catch {
    /* Reading preferences must never prevent opening a project. */
  }
  return { ...preferenceCache };
}

export function saveOutlinePreferences(
  preferences: OutlinePreferences,
): boolean {
  if (
    !isOutlineZoom(preferences.zoom) ||
    typeof preferences.footerCollapsed !== "boolean"
  )
    return false;
  preferenceCache = {
    zoom: preferences.zoom,
    footerCollapsed: preferences.footerCollapsed,
  };
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferenceCache));
  } catch {
    /* The session still remembers the user's chosen view. */
  }
  return true;
}

const validId = (id: unknown): id is string =>
  typeof id === "string" && id.length > 0 && id.length <= 100;

function boundedCollapses(
  values: unknown[],
): { bookId: string; ids: string[] }[] {
  const result: { bookId: string; ids: string[] }[] = [];
  const seen = new Set<string>();
  let remaining = 10000;
  for (const value of [...values].reverse()) {
    if (!value || typeof value !== "object") continue;
    const entry = value as { bookId: unknown; ids: unknown };
    if (
      !validId(entry.bookId) ||
      !Array.isArray(entry.ids) ||
      seen.has(entry.bookId)
    )
      continue;
    seen.add(entry.bookId);
    const ids = [...new Set(entry.ids.filter(validId))].slice(
      0,
      Math.min(5000, remaining),
    );
    result.unshift({ bookId: entry.bookId, ids });
    remaining -= ids.length;
    if (result.length >= 100 || remaining <= 0) break;
  }
  return result;
}

function collapsedBooks() {
  if (collapseCache) return collapseCache;
  collapseCache = [];
  try {
    const saved = JSON.parse(localStorage.getItem(collapseKey) || "null");
    if (Array.isArray(saved)) collapseCache = boundedCollapses(saved);
  } catch {
    /* Fall back to expanded branches when a preference is damaged. */
  }
  return collapseCache;
}

export function readCollapsedSections(bookId: string): string[] {
  return [
    ...(collapsedBooks().find((entry) => entry.bookId === bookId)?.ids || []),
  ];
}

export function saveCollapsedSections(bookId: string, ids: string[]) {
  if (!validId(bookId)) return;
  collapseCache = boundedCollapses([
    ...collapsedBooks().filter((entry) => entry.bookId !== bookId),
    { bookId, ids },
  ]);
  try {
    localStorage.setItem(collapseKey, JSON.stringify(collapseCache));
  } catch {
    /* Preserve the selected branches for the current session. */
  }
}
