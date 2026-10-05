import { useEffect, useMemo, useRef, useState } from "react";
import { getSchema, type Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import { ancestors, type Book } from "../model";
import { extensions } from "../editor/extensions";
import { setSearchHighlights } from "../editor/SearchHighlights";
import { searchBook, findMatches, type SearchMatch } from "../search";

interface Target extends SearchMatch {
  chapterId: string;
}
interface Props {
  book: Book;
  chapterId: string;
  editor: { chapterId: string; instance: Editor } | null;
  open: boolean;
  focusRequest: number;
  initialSearch: { query: string; chapterId: string; revision: number } | null;
  preview: boolean;
  navigate: (id: string) => void;
  close: () => void;
  notify: (message: string) => void;
}
const sameTarget = (a: Target | null, b: Target) =>
  a?.chapterId === b.chapterId && a.from === b.from && a.to === b.to;

export default function FindPanel({
  book,
  chapterId,
  editor,
  open,
  focusRequest,
  initialSearch,
  preview,
  navigate,
  close,
  notify,
}: Props) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [origin, setOrigin] = useState(chapterId);
  const [active, setActive] = useState<Target | null>(null);
  const [notice, setNotice] = useState("");
  const [shown, setShown] = useState(60);
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<Target | null>(null);
  const continueAfterReplace = useRef<string | null>(null);
  const remembered = useRef(new Map<string, Target>());
  const previousChapter = useRef(chapterId);
  const request = useRef<
    | { kind: "first"; query: string; sensitive: boolean; origin: string }
    | { kind: "afterReplace"; chapterId: string; from: number; all: boolean }
    | null
  >(null);
  const [requestRevision, setRequestRevision] = useState(0);
  const schema = useMemo(() => getSchema(extensions()), []);
  const groups = useMemo(
    () => searchBook(book, query, sensitive, origin, schema),
    [book, query, sensitive, origin, schema],
  );
  const matches = useMemo(
    () =>
      groups.flatMap((group) =>
        group.matches.map((match) => ({
          ...match,
          chapterId: group.chapter.id,
        })),
      ),
    [groups],
  );
  const activeIndex = matches.findIndex((match) => sameTarget(active, match));
  const bible = book.mode === "bible";
  const sectionName = bible ? "section" : "chapter";

  function showMatch(target: Target) {
    continueAfterReplace.current = null;
    setActive(target);
    remembered.current.set(target.chapterId, target);
    if (
      editor?.chapterId === target.chapterId &&
      chapterId === target.chapterId &&
      !editor.instance.isDestroyed
    ) {
      pending.current = null;
      editor.instance
        .chain()
        .setTextSelection({ from: target.from, to: target.to })
        .scrollIntoView()
        .run();
      // ProseMirror only scrolls its DOM selection while the editor has focus.
      // Find keeps focus in its input, so scroll the writing pane explicitly.
      const pane = editor.instance.view.dom.closest(".paper-scroll");
      if (pane instanceof HTMLElement) {
        const bounds = pane.getBoundingClientRect();
        const start = editor.instance.view.coordsAtPos(target.from);
        const end = editor.instance.view.coordsAtPos(target.to);
        if (start.top < bounds.top + 20 || end.bottom > bounds.bottom - 20) {
          pane.scrollTo({
            top: Math.max(
              0,
              pane.scrollTop +
                start.top -
                bounds.top -
                Math.min(80, bounds.height / 3),
            ),
            behavior: "instant",
          });
        }
      }
    } else {
      pending.current = target;
      navigate(target.chapterId);
    }
  }
  function move(direction: number) {
    if (!matches.length) return;
    const next =
      activeIndex < 0
        ? direction > 0
          ? Math.max(
              0,
              matches.findIndex(
                (match) => match.chapterId === continueAfterReplace.current,
              ),
            )
          : matches.length - 1
        : (activeIndex + direction + matches.length) % matches.length;
    setNotice(
      activeIndex >= 0 &&
        (activeIndex + direction < 0 ||
          activeIndex + direction >= matches.length)
        ? "Wrapped through the project"
        : "",
    );
    showMatch(matches[next]);
    continueAfterReplace.current = null;
  }
  function startSearch(
    nextQuery: string,
    nextSensitive = sensitive,
    startChapter = origin,
  ) {
    remembered.current.clear();
    pending.current = null;
    continueAfterReplace.current = null;
    request.current = {
      kind: "first",
      query: nextQuery,
      sensitive: nextSensitive,
      origin: startChapter,
    };
    setQuery(nextQuery);
    setSensitive(nextSensitive);
    setActive(null);
    setNotice("");
    setShown(60);
    setRequestRevision((value) => value + 1);
  }
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
  }, [open, focusRequest]);
  useEffect(() => {
    if (!initialSearch) return;
    setOrigin(initialSearch.chapterId);
    startSearch(initialSearch.query, sensitive, initialSearch.chapterId);
  }, [initialSearch]);
  useEffect(() => {
    if (previousChapter.current === chapterId) return;
    previousChapter.current = chapterId;
    if (pending.current?.chapterId === chapterId) return;
    continueAfterReplace.current = null;
    // Ordinary outline navigation restores the reader's position, while search
    // keeps its query and remembers each section's last occurrence separately.
    setOrigin(chapterId);
    setNotice("");
    setShown(60);
    const candidates = matches.filter((match) => match.chapterId === chapterId);
    const saved = remembered.current.get(chapterId);
    setActive(
      candidates.find((match) => sameTarget(saved || null, match)) ||
        candidates[0] ||
        null,
    );
  }, [chapterId, matches]);
  useEffect(() => {
    if (!open || !editor || editor.chapterId !== chapterId) return;
    const target = pending.current;
    if (target?.chapterId === chapterId) {
      const valid = matches.find((match) => sameTarget(target, match));
      pending.current = null;
      if (valid) showMatch(valid);
    }
  }, [editor, chapterId, open, matches]);
  useEffect(() => {
    if (!open || !request.current) return;
    const next = request.current;
    if (
      next.kind === "first" &&
      (next.query !== query ||
        next.sensitive !== sensitive ||
        next.origin !== origin)
    )
      return;
    request.current = null;
    let target: Target | undefined;
    if (next.kind === "afterReplace") {
      target = !next.all
        ? matches.find(
            (match) =>
              match.chapterId === next.chapterId && match.from >= next.from,
          )
        : undefined;
      if (target) showMatch(target);
      else setActive(null);
      return;
    }
    target ||= matches[0];
    if (target) showMatch(target);
    else setActive(null);
  }, [groups, matches, open, requestRevision, query, sensitive, origin]);
  useEffect(() => {
    if (
      !open ||
      activeIndex >= 0 ||
      pending.current ||
      request.current ||
      continueAfterReplace.current
    )
      return;
    // Document edits can remove or shift a result. Never replace a stale range.
    setActive((current) => {
      if (matches.some((match) => sameTarget(current, match))) return current;
      return (
        matches.find(
          (match) =>
            match.chapterId === chapterId && match.from >= (current?.from || 0),
        ) ||
        matches.find((match) => match.chapterId === chapterId) ||
        null
      );
    });
  }, [matches, activeIndex, open, chapterId]);
  useEffect(() => {
    if (!editor || editor.instance.isDestroyed) return;
    setSearchHighlights(
      editor.instance,
      open ? query : "",
      sensitive,
      active?.chapterId === editor.chapterId ? active : undefined,
    );
  }, [editor, query, sensitive, active, open, book]);

  function replaceMatches(all: boolean) {
    if (!editor || editor.chapterId !== chapterId || preview || !query) return;
    const instance = editor.instance;
    const current = findMatches(instance, query, sensitive);
    const chosen = all
      ? current
      : current.filter(
          (match) =>
            active?.chapterId === chapterId &&
            match.from === active.from &&
            match.to === active.to,
        );
    if (!chosen.length) return;
    const transaction = closeHistory(instance.state.tr);
    for (const match of [...chosen].reverse())
      transaction.insertText(replacement, match.from, match.to);
    const groupIndex = groups.findIndex(
      (group) => group.chapter.id === chapterId,
    );
    const nextGroup =
      groups
        .slice(groupIndex + 1)
        .find((group) => group.chapter.id !== chapterId) ||
      groups.find((group) => group.chapter.id !== chapterId);
    continueAfterReplace.current = nextGroup?.chapter.id || chapterId;
    request.current = {
      kind: "afterReplace",
      chapterId,
      from: all ? 0 : chosen[0].from + replacement.length,
      all,
    };
    instance.view.dispatch(transaction);
    instance.view.dispatch(closeHistory(instance.state.tr));
    setRequestRevision((value) => value + 1);
    notify(
      `Replaced ${chosen.length} match${chosen.length === 1 ? "" : "es"} in this ${sectionName}. Undo restores the original text.`,
    );
  }
  if (!open) return null;
  const localCount =
    groups.find((group) => group.chapter.id === chapterId)?.matches.length || 0;
  let rendered = 0;
  return (
    <section className="project-find" aria-label="Find and replace">
      <div className="project-find-controls">
        <Search size={16} aria-hidden="true" />
        <input
          ref={input}
          aria-label={bible ? "Find in system bible" : "Find in book"}
          placeholder="Find across chapters and sections…"
          value={query}
          onChange={(event) => startSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              move(event.shiftKey ? -1 : 1);
            }
          }}
        />
        <button
          aria-label="Case sensitive"
          aria-pressed={sensitive}
          className={sensitive ? "active" : ""}
          title="Match case"
          onClick={() => startSearch(query, !sensitive)}
        >
          Aa
        </button>
        <button
          aria-label="Previous match"
          title="Previous match (Shift+Enter)"
          disabled={!matches.length}
          onClick={() => move(-1)}
        >
          <ArrowUp size={15} />
        </button>
        <button
          aria-label="Next match"
          title="Next match (Enter)"
          disabled={!matches.length}
          onClick={() => move(1)}
        >
          <ArrowDown size={15} />
        </button>
        <button
          aria-label="Close find"
          onClick={() => {
            close();
            editor?.instance.commands.focus(undefined, {
              scrollIntoView: false,
            });
          }}
        >
          <X size={16} />
        </button>
      </div>
      <div className="project-find-replace">
        <input
          aria-label="Replace with"
          placeholder="Replace with"
          value={replacement}
          onChange={(event) => setReplacement(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              replaceMatches(false);
            }
          }}
        />
        <button
          disabled={
            preview ||
            activeIndex < 0 ||
            active?.chapterId !== editor?.chapterId
          }
          onClick={() => replaceMatches(false)}
        >
          Replace
        </button>
        <button
          disabled={preview || !localCount || editor?.chapterId !== chapterId}
          onClick={() => replaceMatches(true)}
        >
          Replace all in {sectionName}
        </button>
      </div>
      <div className="project-find-summary">
        <span role="status" aria-label="Search match count">
          {!query
            ? "Search this project’s writing"
            : !matches.length
              ? "No matches"
              : `${activeIndex >= 0 ? `${activeIndex + 1} of ` : ""}${matches.length} ${matches.length === 1 ? "match" : "matches"} · ${groups.length} ${sectionName}${groups.length === 1 ? "" : "s"}`}
        </span>
        <span>
          {notice ||
            `Starts in ${book.nodes.find((node) => node.id === origin)?.title || "this chapter"}`}
        </span>
      </div>
      {!!groups.length && (
        <div
          className="project-find-results"
          aria-label="Matching chapters and sections"
        >
          {groups.map((group) => {
            if (rendered >= shown) return null;
            const available = group.matches.slice(0, shown - rendered);
            rendered += available.length;
            return (
              <section
                key={group.chapter.id}
                data-chapter-id={group.chapter.id}
                className="project-find-group"
              >
                <div className="project-find-heading">
                  <strong>{group.chapter.title}</strong>
                  <span>
                    {group.matches.length}{" "}
                    {group.matches.length === 1 ? "match" : "matches"}
                  </span>
                </div>
                <small>
                  {ancestors(book, group.chapter.id)
                    .map((node) => node.title)
                    .join(" / ") || "Top level"}
                </small>
                {available.map((match, index) => {
                  const target = { ...match, chapterId: group.chapter.id };
                  const snippet = group.document
                    .textBetween(
                      Math.max(0, match.from - 45),
                      Math.min(group.document.content.size, match.to + 70),
                      " ",
                      " ",
                    )
                    .trim();
                  return (
                    <button
                      key={`${match.from}-${match.to}`}
                      aria-label={`${group.chapter.title}, match ${index + 1}: ${snippet}`}
                      aria-current={
                        sameTarget(active, target) ? "true" : undefined
                      }
                      className={sameTarget(active, target) ? "active" : ""}
                      onClick={() => {
                        setNotice("");
                        showMatch(target);
                      }}
                    >
                      <span>{index + 1}</span>
                      <span>{snippet}</span>
                    </button>
                  );
                })}
              </section>
            );
          })}
          {matches.length > shown && (
            <button
              className="project-find-more"
              onClick={() => setShown((value) => value + 60)}
            >
              Show more matches ({matches.length - shown} remaining)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
