export interface ReadingState {
  anchor: number;
  head: number;
  scrollTop: number;
  scrollLeft: number;
}

interface Position extends ReadingState {
  bookId: string;
  chapterId: string;
}
interface Visit {
  bookId: string;
  chapterId: string;
}
interface ReadingStore {
  version: 1;
  positions: Position[];
  lastChapters: Visit[];
}

const key = "codebook.readingState.v1";
const positionLimit = 500;
const bookLimit = 100;
let cached: ReadingStore | undefined;

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
function validVisit(value: unknown): value is Visit {
  if (!value || typeof value !== "object") return false;
  const visit = value as Visit;
  return validId(visit.bookId) && validId(visit.chapterId);
}
function validPosition(value: unknown): value is Position {
  if (!validVisit(value)) return false;
  const position = value as Position;
  return (
    [position.anchor, position.head].every(
      (number) => Number.isSafeInteger(number) && number >= 0,
    ) &&
    [position.scrollTop, position.scrollLeft].every(
      (number) => Number.isFinite(number) && number >= 0,
    )
  );
}
function store(): ReadingStore {
  if (cached) return cached;
  cached = { version: 1, positions: [], lastChapters: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved?.version === 1) {
      if (Array.isArray(saved.positions))
        cached.positions = saved.positions
          .filter(validPosition)
          .slice(-positionLimit);
      if (Array.isArray(saved.lastChapters))
        cached.lastChapters = saved.lastChapters
          .filter(validVisit)
          .slice(-bookLimit);
    }
  } catch {
    // Reading position is optional; damaged preferences cannot block writing.
  }
  return cached;
}
function persist() {
  try {
    localStorage.setItem(key, JSON.stringify(store()));
  } catch {
    // The in-memory copy still resumes sections while this window is open.
  }
}

export function readReadingState(
  bookId: string,
  chapterId: string,
): ReadingState | null {
  const position = [...store().positions]
    .reverse()
    .find((entry) => entry.bookId === bookId && entry.chapterId === chapterId);
  if (!position) return null;
  const { anchor, head, scrollTop, scrollLeft } = position;
  return { anchor, head, scrollTop, scrollLeft };
}

export function saveReadingState(
  bookId: string,
  chapterId: string,
  state: ReadingState,
) {
  const position = { bookId, chapterId, ...state };
  if (!validPosition(position)) return;
  const saved = store();
  saved.positions = [
    ...saved.positions.filter(
      (entry) => entry.bookId !== bookId || entry.chapterId !== chapterId,
    ),
    position,
  ].slice(-positionLimit);
  persist();
}

export function readLastChapter(bookId: string): string | null {
  return (
    [...store().lastChapters].reverse().find((visit) => visit.bookId === bookId)
      ?.chapterId || null
  );
}

export function rememberChapter(bookId: string, chapterId: string) {
  if (!validId(bookId) || !validId(chapterId)) return;
  const saved = store();
  saved.lastChapters = [
    ...saved.lastChapters.filter((visit) => visit.bookId !== bookId),
    { bookId, chapterId },
  ].slice(-bookLimit);
  persist();
}
