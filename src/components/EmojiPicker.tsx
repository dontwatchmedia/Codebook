import { SmilePlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeSectionEmoji } from "../model";

const choices = [
  ["✅", "Complete"],
  ["🟪", "In progress"],
  ["❌", "Not started"],
  ["🚧", "Under construction"],
  ["⏸️", "On hold"],
  ["🎮", "Game"],
  ["🌍", "World"],
  ["🌱", "Nature"],
  ["🏡", "Home"],
  ["⚙️", "System"],
  ["🧰", "Tools"],
  ["📝", "Notes"],
  ["📚", "Reference"],
  ["💡", "Idea"],
  ["📌", "Pinned"],
  ["🎯", "Goal"],
  ["🐾", "Animals"],
  ["👥", "Community"],
  ["🔨", "Building"],
  ["🎨", "Art"],
  ["⭐", "Favorite"],
  ["🔥", "Fire"],
  ["🌊", "Water"],
  ["🍎", "Food"],
  ["📦", "Inventory"],
] as const;

interface Props {
  title: string;
  value?: string;
  onChange: (emoji?: string) => void;
}

export default function EmojiPicker({ title, value, onChange }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const normalized = normalizeSectionEmoji(custom);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function choose(emoji?: string) {
    onChange(emoji);
    close();
  }

  useEffect(() => {
    if (!open) return;
    const rect = trigger.current!.getBoundingClientRect();
    const height = popup.current!.getBoundingClientRect().height;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 276)),
      top: Math.max(
        8,
        Math.min(rect.bottom + 6, window.innerHeight - height - 8),
      ),
    });
    popup.current?.querySelector<HTMLButtonElement>(".emoji-choice")?.focus();
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
    function moved() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", moved);
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
            <div className="emoji-choice-grid">
              {choices.map(([emoji, label], index) => (
                <button
                  type="button"
                  key={emoji}
                  className="emoji-choice"
                  aria-label={`${emoji} ${label}`}
                  title={label}
                  aria-pressed={value === emoji}
                  onClick={() => choose(emoji)}
                  onKeyDown={(event) => {
                    const offset = {
                      ArrowRight: 1,
                      ArrowLeft: -1,
                      ArrowDown: 5,
                      ArrowUp: -5,
                    }[event.key];
                    if (offset === undefined) return;
                    event.preventDefault();
                    const buttons =
                      popup.current?.querySelectorAll<HTMLButtonElement>(
                        ".emoji-choice",
                      );
                    buttons?.[
                      (index + offset + choices.length) % choices.length
                    ]?.focus();
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form
              className="emoji-custom-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (normalized) choose(normalized);
              }}
            >
              <input
                aria-label="Custom section emoji"
                placeholder="Paste another emoji"
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
