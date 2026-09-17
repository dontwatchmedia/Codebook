import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export default function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button,input,select,textarea,[tabindex="0"]',
        ),
      ).filter((e) => !e.hasAttribute("disabled"));
    (
      (dialog.querySelector("[autofocus]") as HTMLElement) ||
      focusable()[1] ||
      focusable()[0]
    )?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
      if (e.key === "Tab") {
        const items = focusable();
        if (e.shiftKey && document.activeElement === items[0]) {
          e.preventDefault();
          items[items.length - 1]?.focus();
        } else if (
          !e.shiftKey &&
          document.activeElement === items[items.length - 1]
        ) {
          e.preventDefault();
          items[0]?.focus();
        }
      }
    };
    dialog.addEventListener("keydown", key);
    return () => {
      dialog.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={19} />
        </button>
        <h2>{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}
