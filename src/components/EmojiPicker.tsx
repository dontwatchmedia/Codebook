import { Search, SmilePlus, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { emojiCategories, searchEmoji } from "../emojiCatalog";
import { normalizeSectionEmoji } from "../model";

const RESULT_PAGE_SIZE = 84;
const GRID_COLUMNS = 7;

interface Props {
  title: string;
  value?: string;
  onChange: (emoji?: string) => void;
}

export default function EmojiPicker({ title, value, onChange }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const resultViewport = useRef<HTMLDivElement>(null);
  const nextFocusIndex = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const normalized = normalizeSectionEmoji(custom);
  const results = useMemo(
    () => (open ? searchEmoji(query, category) : []),
    [open, query, category],
  );
  const visibleResults = results.slice(0, visibleCount);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(emoji?: string) {
    onChange(emoji);
    close();
  }

  function focusResult(index: number) {
    popup.current
      ?.querySelectorAll<HTMLButtonElement>(".emoji-choice")
      [index]?.focus();
  }

  function updateQuery(nextQuery: string) {
    setQuery(nextQuery);
    setVisibleCount(RESULT_PAGE_SIZE);
    if (resultViewport.current) resultViewport.current.scrollTop = 0;
  }

  function updateCategory(nextCategory: string) {
    setCategory(nextCategory);
    setVisibleCount(RESULT_PAGE_SIZE);
    if (resultViewport.current) resultViewport.current.scrollTop = 0;
  }

  function reposition() {
    if (!trigger.current || !popup.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const bounds = popup.current.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(rect.left, window.innerWidth - bounds.width - 8),
    );
    const top = Math.max(
      8,
      Math.min(rect.bottom + 6, window.innerHeight - bounds.height - 8),
    );
    setPosition((current) =>
      current.left === left && current.top === top ? current : { left, top },
    );
  }

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    if (nextFocusIndex.current !== null) {
      focusResult(nextFocusIndex.current);
      nextFocusIndex.current = null;
    }
  }, [open, visibleResults.length, custom, normalized]);

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !popup.current?.contains(target) &&
        !trigger.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function escape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
    function scrolled(event: Event) {
      if (event.target instanceof Node && popup.current?.contains(event.target))
        return;
      reposition();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", scrolled, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", scrolled, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`outline-emoji-trigger ${value ? "has-emoji" : ""}`}
        aria-label={`Emoji for ${title}`}
        title={value ? "Change section emoji" : "Choose a section emoji"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setCustom("");
          setQuery("");
          setCategory("all");
          setVisibleCount(RESULT_PAGE_SIZE);
          setOpen((current) => !current);
        }}
      >
        {value || <SmilePlus size={14} />}
      </button>
      {open &&
        createPortal(
          <div
            ref={popup}
            className="outline-emoji-picker"
            role="dialog"
            aria-label="Choose section emoji"
            style={position}
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const controls = popup.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input, select",
              );
              if (!controls?.length) return;
              const first = controls[0];
              const last = controls[controls.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <div className="emoji-picker-heading">
              <strong>Section emoji</strong>
              <button
                type="button"
                aria-label="Close emoji picker"
                onClick={close}
              >
                <X size={15} />
              </button>
            </div>
            <div className="emoji-search-field">
              <Search size={15} aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                aria-label="Search emojis"
                placeholder="Search names, ideas, or emoji"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" && visibleResults.length) {
                    event.preventDefault();
                    focusResult(0);
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    if (results.length) choose(results[0].emoji);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear emoji search"
                  onClick={() => {
                    updateQuery("");
                    searchInput.current?.focus();
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              className="emoji-category"
              aria-label="Emoji category"
              value={category}
              onChange={(event) => updateCategory(event.target.value)}
            >
              {emojiCategories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p
              className="emoji-result-count"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {results.length === 0
                ? "No emoji found"
                : `${results.length.toLocaleString()} ${results.length === 1 ? "emoji" : "emojis"}${visibleResults.length < results.length ? ` · Showing ${visibleResults.length}` : ""}`}
            </p>
            <div ref={resultViewport} className="emoji-results-viewport">
              {results.length ? (
                <div className="emoji-choice-grid">
                  {visibleResults.map(({ emoji, label }, index) => (
                    <button
                      type="button"
                      key={emoji}
                      className="emoji-choice"
                      aria-label={`${emoji} ${label}`}
                      title={label}
                      aria-pressed={value === emoji}
                      onClick={() => choose(emoji)}
                      onKeyDown={(event) => {
                        let target: number;
                        if (event.key === "Home") target = 0;
                        else if (event.key === "End")
                          target = visibleResults.length - 1;
                        else {
                          const offset = {
                            ArrowRight: 1,
                            ArrowLeft: -1,
                            ArrowDown: GRID_COLUMNS,
                            ArrowUp: -GRID_COLUMNS,
                          }[event.key];
                          if (offset === undefined) return;
                          target =
                            (index + offset + visibleResults.length) %
                            visibleResults.length;
                        }
                        event.preventDefault();
                        focusResult(target);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="emoji-empty-state">
                  <p>Try another word or a different category.</p>
                  <button
                    type="button"
                    onClick={() => {
                      updateQuery("");
                      updateCategory("all");
                      searchInput.current?.focus();
                    }}
                  >
                    Reset emoji filters
                  </button>
                </div>
              )}
            </div>
            {visibleResults.length < results.length && (
              <button
                type="button"
                className="emoji-load-more"
                onClick={() => {
                  nextFocusIndex.current = visibleResults.length;
                  setVisibleCount((current) => current + RESULT_PAGE_SIZE);
                }}
              >
                Show more emojis
              </button>
            )}
            <form
              className="emoji-custom-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (normalized) choose(normalized);
              }}
            >
              <input
                aria-label="Custom section emoji"
                placeholder="Paste a custom emoji"
                value={custom}
                maxLength={64}
                onChange={(event) => setCustom(event.target.value)}
              />
              <button type="submit" disabled={!normalized}>
                Use
              </button>
            </form>
            {custom && normalized === null && (
              <p className="emoji-picker-hint" role="status">
                Choose one emoji.
              </p>
            )}
            <button
              type="button"
              className="emoji-clear"
              disabled={!value}
              onClick={() => choose()}
            >
              Clear emoji
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}
