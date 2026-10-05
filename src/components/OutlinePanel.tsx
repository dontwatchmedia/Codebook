import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Minus,
  Plus,
} from "lucide-react";
import {
  DEFAULT_OUTLINE_ZOOM,
  MAX_OUTLINE_ZOOM,
  MIN_OUTLINE_ZOOM,
  readOutlinePreferences,
  saveOutlinePreferences,
  type OutlinePreferences,
} from "../outlinePreferences";
import "./outline.css";

interface Props {
  backButton: ReactNode;
  projectTitle: ReactNode;
  label: string;
  settingsButton: ReactNode;
  summary: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  hasBranches: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}

export default function OutlinePanel({
  backButton,
  projectTitle,
  label,
  settingsButton,
  summary,
  footer,
  children,
  hasBranches,
  onExpandAll,
  onCollapseAll,
}: Props) {
  const [preferences, setPreferences] = useState(readOutlinePreferences);
  const preferencesRef = useRef(preferences);
  const panel = useRef<HTMLDivElement>(null);
  const footerId = useId();
  preferencesRef.current = preferences;

  function update(next: OutlinePreferences) {
    preferencesRef.current = next;
    setPreferences(next);
    saveOutlinePreferences(next);
  }
  function zoomBy(delta: number) {
    const current = preferencesRef.current;
    update({
      ...current,
      zoom: Math.min(
        MAX_OUTLINE_ZOOM,
        Math.max(MIN_OUTLINE_ZOOM, current.zoom + delta),
      ),
    });
  }
  useEffect(() => {
    const surface = panel.current?.closest(".structure") || panel.current;
    if (!surface) return;
    const wheel = (event: Event) => {
      const input = event as WheelEvent;
      if (!input.ctrlKey || !input.deltaY) return;
      input.preventDefault();
      zoomBy(input.deltaY < 0 ? 10 : -10);
    };
    // React's delegated wheel handler is passive; a native listener is needed
    // to consume Ctrl+wheel before WebView/browser page zoom handles it.
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, []);

  return (
    <div
      className="outline-panel"
      ref={panel}
      style={{ "--outline-scale": preferences.zoom / 100 } as CSSProperties}
    >
      <div className="outline-panel-header">
        {backButton}
        <div className="outline-panel-title">{projectTitle}</div>
      </div>
      <div className="outline-panel-tools">
        <span className="outline-panel-label">{label}</span>
        <div
          className="outline-branch-tools"
          role="group"
          aria-label="Outline branches"
        >
          <button
            type="button"
            aria-label="Expand all sections"
            title="Expand all sections"
            disabled={!hasBranches}
            onClick={onExpandAll}
          >
            <ChevronsUpDown size={14} />
          </button>
          <button
            type="button"
            aria-label="Collapse all sections"
            title="Collapse all sections"
            disabled={!hasBranches}
            onClick={onCollapseAll}
          >
            <ChevronsDownUp size={14} />
          </button>
          {settingsButton}
        </div>
        <div
          className="outline-zoom-tools"
          role="group"
          aria-label="Outline text size"
          title="Ctrl+mouse wheel over the left panel changes outline text size"
        >
          <button
            type="button"
            aria-label="Smaller outline text"
            title="Smaller outline text"
            disabled={preferences.zoom <= MIN_OUTLINE_ZOOM}
            onClick={() => zoomBy(-10)}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="outline-zoom-reset"
            aria-label={`Reset outline text size (${preferences.zoom}%)`}
            title="Reset outline text size to 100%"
            onClick={() =>
              update({ ...preferencesRef.current, zoom: DEFAULT_OUTLINE_ZOOM })
            }
          >
            {preferences.zoom}%
          </button>
          <button
            type="button"
            aria-label="Larger outline text"
            title="Larger outline text"
            disabled={preferences.zoom >= MAX_OUTLINE_ZOOM}
            onClick={() => zoomBy(10)}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>
      {children}
      <div className="outline-footer-summary">
        <div className="outline-footer-stats">{summary}</div>
        <button
          type="button"
          className="outline-footer-toggle"
          aria-label={
            preferences.footerCollapsed
              ? "Show outline tools"
              : "Hide outline tools"
          }
          aria-expanded={!preferences.footerCollapsed}
          aria-controls={footerId}
          title={
            preferences.footerCollapsed
              ? "Show chapter tools and progress"
              : "Hide chapter tools and progress"
          }
          onClick={() =>
            update({
              ...preferencesRef.current,
              footerCollapsed: !preferencesRef.current.footerCollapsed,
            })
          }
        >
          {preferences.footerCollapsed ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
          <span>Tools</span>
        </button>
      </div>
      <div
        className="outline-footer-content"
        id={footerId}
        hidden={preferences.footerCollapsed}
      >
        {footer}
      </div>
    </div>
  );
}
