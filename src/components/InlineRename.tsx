import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  label?: string;
  className?: string;
}

/** The same Enter, Escape, and blur behavior for outline and project titles. */
export default function InlineRename({
  value,
  onCommit,
  onCancel,
  label = `Rename ${value}`,
  className = "outline-rename-input",
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const completed = useRef(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  function commit() {
    if (completed.current) return;
    completed.current = true;
    const title = draft.trim();
    if (title && title !== value) onCommit(title);
    else onCancel();
  }

  return (
    <input
      ref={input}
      className={className}
      aria-label={label}
      value={draft}
      maxLength={300}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          completed.current = true;
          onCancel();
        }
      }}
    />
  );
}
