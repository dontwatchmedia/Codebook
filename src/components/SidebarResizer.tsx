import { useLayoutEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  HTMLAttributes,
  KeyboardEvent,
  PointerEvent,
} from "react";
import {
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  readSidebarWidth,
  saveSidebarWidth,
} from "../sidebar";

const MIN_EDITOR_WIDTH = 360;

interface Options {
  activeKey: string | undefined;
  focus: boolean;
  inspectorVisible: boolean;
  onSaveError: (error: unknown) => void;
}

interface Drag {
  pointerId: number;
  startX: number;
  startWidth: number;
  originalWidth: number | null;
  handle: HTMLDivElement;
}

/** Preserve the chosen width while smaller windows temporarily limit it. */
export function useResizableSidebar({
  activeKey,
  focus,
  inspectorVisible,
  onSaveError,
}: Options) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const inspectorRef = useRef<HTMLElement>(null);
  const [preferredWidth, setPreferredWidth] = useState(readSidebarWidth);
  const [maximumWidth, setMaximumWidth] = useState(MAX_SIDEBAR_WIDTH);
  const [actualWidth, setActualWidth] = useState(242);
  const [dragging, setDragging] = useState(false);
  const preferredRef = useRef(preferredWidth);
  const maximumRef = useRef(maximumWidth);
  const actualRef = useRef(actualWidth);
  const dragRef = useRef<Drag | null>(null);
  const errorRef = useRef(onSaveError);
  errorRef.current = onSaveError;

  function changeWidth(width: number | null) {
    preferredRef.current = width;
    setPreferredWidth(width);
  }

  function persistWidth(width: number | null) {
    void saveSidebarWidth(width).catch((error) => errorRef.current(error));
  }

  function clampWidth(width: number) {
    return Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(maximumRef.current, Math.round(width)),
    );
  }

  function finishDrag(cancel = false) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    document.documentElement.classList.remove("resizing-sidebar");
    setDragging(false);
    if (drag.handle.hasPointerCapture(drag.pointerId))
      drag.handle.releasePointerCapture(drag.pointerId);
    if (cancel) changeWidth(drag.originalWidth);
    else persistWidth(preferredRef.current);
  }

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const sidebar = sidebarRef.current;
    if (!workspace || !sidebar || focus) return;

    function measure() {
      if (!workspace || !sidebar) return;
      const inspectorWidth =
        inspectorRef.current?.getBoundingClientRect().width || 0;
      const maximum = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(
          MAX_SIDEBAR_WIDTH,
          Math.floor(
            workspace.getBoundingClientRect().width -
              inspectorWidth -
              MIN_EDITOR_WIDTH,
          ),
        ),
      );
      maximumRef.current = maximum;
      setMaximumWidth(maximum);
      const measuredWidth = Math.round(sidebar.getBoundingClientRect().width);
      if (measuredWidth > 0) {
        actualRef.current = measuredWidth;
        setActualWidth(measuredWidth);
      }
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    observer.observe(sidebar);
    if (inspectorRef.current) observer.observe(inspectorRef.current);
    window.addEventListener("resize", measure);
    const cancel = () => finishDrag(true);
    window.addEventListener("blur", cancel);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("blur", cancel);
      finishDrag(true);
    };
  }, [activeKey, focus, inspectorVisible]);

  useLayoutEffect(() => {
    const width = sidebarRef.current?.getBoundingClientRect().width;
    if (width) {
      actualRef.current = Math.round(width);
      setActualWidth(Math.round(width));
    }
  }, [preferredWidth, maximumWidth]);

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth:
        sidebarRef.current?.getBoundingClientRect().width || actualRef.current,
      originalWidth: preferredRef.current,
      handle: event.currentTarget,
    };
    document.documentElement.classList.add("resizing-sidebar");
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    changeWidth(clampWidth(drag.startWidth + event.clientX - drag.startX));
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      finishDrag(true);
      return;
    }
    const step = event.shiftKey ? 50 : 10;
    let width: number;
    if (event.key === "ArrowLeft") width = actualRef.current - step;
    else if (event.key === "ArrowRight") width = actualRef.current + step;
    else if (event.key === "Home") width = MIN_SIDEBAR_WIDTH;
    else if (event.key === "End") width = maximumRef.current;
    else return;
    event.preventDefault();
    event.stopPropagation();
    finishDrag(true);
    const next = clampWidth(width);
    changeWidth(next);
    persistWidth(next);
  }

  const sidebarStyle: CSSProperties = {
    width:
      preferredWidth === null
        ? undefined
        : Math.min(preferredWidth, maximumWidth),
  };
  const handleProps: HTMLAttributes<HTMLDivElement> = {
    className: `sidebar-resizer${dragging ? " is-resizing" : ""}`,
    role: "separator",
    tabIndex: 0,
    "aria-label": "Resize left panel",
    "aria-orientation": "vertical",
    "aria-controls": "outline-panel",
    "aria-valuemin": Math.min(MIN_SIDEBAR_WIDTH, actualWidth),
    "aria-valuemax": maximumWidth,
    "aria-valuenow": actualWidth,
    "aria-valuetext": `${actualWidth} pixels wide`,
    title:
      "Drag to resize the left panel. Double-click to reset. Arrow keys adjust the width.",
    onPointerDown: pointerDown,
    onPointerMove: pointerMove,
    onPointerUp: (event) => {
      if (event.pointerId === dragRef.current?.pointerId) finishDrag();
    },
    onPointerCancel: () => finishDrag(true),
    onLostPointerCapture: () => finishDrag(true),
    onKeyDown: keyDown,
    onDoubleClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      finishDrag(true);
      changeWidth(null);
      persistWidth(null);
    },
  };

  return { workspaceRef, sidebarRef, inspectorRef, sidebarStyle, handleProps };
}

export default function SidebarResizer({
  controls,
}: {
  controls: ReturnType<typeof useResizableSidebar>;
}) {
  return <div {...controls.handleProps} />;
}
