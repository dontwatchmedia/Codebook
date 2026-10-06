import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  ancestors,
  canMoveNode,
  createOutlineIndex,
  visibleOutlineEntries,
  type Book,
  type BookNode,
  type OutlineDropPlacement,
  type OutlineIndex,
} from "../model";
import { ProgressIcon, SectionIcon, progressOptions } from "./SectionSymbols";
import EmojiPicker from "./EmojiPicker";
import InlineRename from "./InlineRename";
import "./outline.css";

interface Props {
  book: Book;
  activeId: string;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onEdit: (node: BookNode) => void;
  onMove: (
    movingId: string,
    targetId: string | null,
    placement?: OutlineDropPlacement,
  ) => void;
  onImportFiles?: (
    files: File[],
    targetId: string | null,
    placement: OutlineDropPlacement,
  ) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, title: string) => void;
  onEmojiChange: (id: string, emoji?: string) => void;
  index?: OutlineIndex;
}

/** Existing chapters and incoming files share the same row hit areas. */
export function outlineDropPlacement(
  clientY: number,
  rect: { top: number; height: number },
): "before" | "inside" | "after" {
  const fraction = (clientY - rect.top) / Math.max(1, rect.height);
  return fraction < 0.25 ? "before" : fraction > 0.75 ? "after" : "inside";
}

interface DropHint {
  targetId: string | null;
  placement: OutlineDropPlacement;
  legacy: boolean;
  external: boolean;
  valid: boolean;
  message: string;
}

export default function OutlineTree({
  book,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onEdit,
  onMove,
  onImportFiles,
  onAddChild,
  onRename,
  onEmojiChange,
  index: suppliedIndex,
}: Props) {
  const tree = useRef<HTMLElement>(null);
  const draggingId = useRef<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const [dragging, setDragging] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 500 });
  const [rowHeight, setRowHeight] = useState(28);
  const measure = useRef<HTMLDivElement>(null);
  const dragScrollFrame = useRef<number | null>(null);
  const dragScrollSpeed = useRef(0);
  const lastActive = useRef<{
    id: string;
    position: number | undefined;
    rowHeight: number;
  }>({
    id: "",
    position: undefined,
    rowHeight,
  });
  const bible = book.mode === "bible";
  const index = useMemo(
    () => suppliedIndex || createOutlineIndex(book.nodes),
    [book.nodes, suppliedIndex],
  );
  const visible = useMemo(
    () => visibleOutlineEntries(index, collapsed),
    [index, collapsed],
  );
  const visiblePositions = useMemo(
    () => new Map(visible.map((entry, position) => [entry.node.id, position])),
    [visible],
  );
  const virtualized = visible.length > 300;
  const parents = index.childrenByParent;
  const maxDepth = visible.reduce(
    (maximum, entry) => Math.max(maximum, entry.depth),
    0,
  );
  const start = Math.max(0, Math.floor(viewport.top / rowHeight) - 8);
  const end = Math.min(
    visible.length,
    Math.ceil((viewport.top + viewport.height) / rowHeight) + 8,
  );
  const renderPositions = new Set<number>();
  if (virtualized) {
    for (let position = start; position < end; position++)
      renderPositions.add(position);
    for (const id of [focusedId, editingId, draggingId.current]) {
      const position = id ? visiblePositions.get(id) : undefined;
      if (position !== undefined) renderPositions.add(position);
    }
  }
  const rendered = virtualized
    ? [...renderPositions]
        .sort((a, b) => a - b)
        .map((position) => ({ entry: visible[position], position }))
    : visible.map((entry, position) => ({ entry, position }));

  useLayoutEffect(() => {
    const element = tree.current;
    if (!element || !virtualized) return;
    const update = () => {
      setViewport({ top: element.scrollTop, height: element.clientHeight });
      if (measure.current)
        setRowHeight(measure.current.getBoundingClientRect().height || 28);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (measure.current) observer.observe(measure.current);
    return () => observer.disconnect();
  }, [virtualized]);
  const activePosition = visiblePositions.get(activeId);
  useLayoutEffect(() => {
    if (
      virtualized &&
      activePosition !== undefined &&
      (lastActive.current.id !== activeId ||
        lastActive.current.position !== activePosition ||
        lastActive.current.rowHeight !== rowHeight)
    )
      ensureRowVisible(activePosition);
    lastActive.current = { id: activeId, position: activePosition, rowHeight };
  }, [activeId, activePosition, virtualized, rowHeight]);

  useEffect(() => {
    function cancelDrag(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        finishDrag();
      }
    }
    window.addEventListener("keydown", cancelDrag);
    window.addEventListener("dragend", finishDrag);
    window.addEventListener("drop", finishDrag);
    window.addEventListener("blur", finishDrag);
    return () => {
      window.removeEventListener("keydown", cancelDrag);
      window.removeEventListener("dragend", finishDrag);
      window.removeEventListener("drop", finishDrag);
      window.removeEventListener("blur", finishDrag);
      if (dragScrollFrame.current !== null)
        cancelAnimationFrame(dragScrollFrame.current);
    };
  }, []);

  function focusRow(id?: string) {
    if (!id) return;
    const focus = () => {
      const buttons = tree.current?.querySelectorAll<HTMLButtonElement>(
        "button[data-outline-id]",
      );
      Array.from(buttons || [])
        .find((button) => button.dataset.outlineId === id)
        ?.focus();
    };
    if (virtualized) {
      const position = visiblePositions.get(id);
      if (position === undefined) return;
      ensureRowVisible(position);
      setFocusedId(id);
      requestAnimationFrame(focus);
    } else focus();
  }

  function ensureRowVisible(position: number) {
    const element = tree.current;
    if (!element) return;
    const top = position * rowHeight;
    const bottom = top + rowHeight;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
    const indent = (visible[position]?.depth || 0) * 16;
    if (indent < element.scrollLeft)
      element.scrollLeft = Math.max(0, indent - 12);
    else if (indent + 140 > element.scrollLeft + element.clientWidth)
      element.scrollLeft = Math.max(0, indent - 12);
    setViewport({ top: element.scrollTop, height: element.clientHeight });
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, node: BookNode) {
    const position = visiblePositions.get(node.id) ?? -1;
    if (event.key === "F2") {
      event.preventDefault();
      setEditingId(node.id);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(
        visible[position + (event.key === "ArrowDown" ? 1 : -1)]?.node.id,
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(visible[event.key === "Home" ? 0 : visible.length - 1]?.node.id);
    } else if (event.key === "ArrowRight" && parents.has(node.id)) {
      event.preventDefault();
      if (collapsed.has(node.id)) onToggle(node.id);
      else focusRow(visible[position + 1]?.node.id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (parents.has(node.id) && !collapsed.has(node.id)) onToggle(node.id);
      else focusRow(ancestors(book, node.id, index).at(-1)?.id);
    }
  }

  function dragStart(event: DragEvent<HTMLElement>, id: string) {
    if (editingId === id) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/codebook-node", id);
    event.dataTransfer.effectAllowed = "move";
    draggingId.current = id;
    setDragging(true);
  }

  function finishDrag() {
    draggingId.current = null;
    setDropHint(null);
    setDragging(false);
    dragScrollSpeed.current = 0;
    if (dragScrollFrame.current !== null)
      cancelAnimationFrame(dragScrollFrame.current);
    dragScrollFrame.current = null;
  }
  function dragScroll(event: DragEvent<HTMLElement>) {
    if (
      !event.dataTransfer.types.some(
        (type) => type === "Files" || type === "text/codebook-node",
      ) ||
      !tree.current
    )
      return;
    const bounds = tree.current.getBoundingClientRect();
    dragScrollSpeed.current =
      event.clientY < bounds.top + 40
        ? -10
        : event.clientY > bounds.bottom - 40
          ? 10
          : 0;
    if (dragScrollFrame.current !== null || !dragScrollSpeed.current) return;
    const step = () => {
      const element = tree.current;
      if (!element || !dragScrollSpeed.current) {
        dragScrollFrame.current = null;
        return;
      }
      element.scrollTop += dragScrollSpeed.current;
      dragScrollFrame.current = requestAnimationFrame(step);
    };
    dragScrollFrame.current = requestAnimationFrame(step);
  }

  function eventDropHint(
    event: DragEvent<HTMLElement>,
    id: string | null,
  ): DropHint | null {
    const external = event.dataTransfer.types.includes("Files");
    if (!external && !event.dataTransfer.types.includes("text/codebook-node"))
      return null;
    const movingId =
      event.dataTransfer.getData("text/codebook-node") || draggingId.current;
    const moving = index.nodesById.get(movingId || "");
    let target = index.nodesById.get(id || "");
    const legacy =
      !external && id !== null && event.clientX === 0 && event.clientY === 0;
    let placement: OutlineDropPlacement =
      id === null
        ? "root"
        : legacy
          ? moving?.type === "chapter" && target?.type === "part"
            ? "inside"
            : "before"
          : outlineDropPlacement(
              event.clientY,
              event.currentTarget.getBoundingClientRect(),
            );
    if (moving?.type === "part" && placement === "inside") {
      const rect = event.currentTarget.getBoundingClientRect();
      placement =
        event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    }
    const valid = external
      ? Boolean(onImportFiles)
      : Boolean(
          movingId &&
          canMoveNode(
            book,
            movingId,
            id,
            legacy ? undefined : placement,
            index,
          ),
        );
    if (
      !external &&
      moving?.type === "part" &&
      target?.type === "chapter" &&
      target.parentId
    )
      target = ancestors(book, target.id, index)[0];
    return {
      targetId: id,
      placement,
      legacy,
      external,
      valid,
      message: valid
        ? dropMessage(placement, target?.title, external)
        : "This move would place a section inside itself or its children.",
    };
  }

  function dragOver(event: DragEvent<HTMLElement>, id: string | null) {
    const hint = eventDropHint(event, id);
    if (!hint) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = hint.valid
      ? hint.external
        ? "copy"
        : "move"
      : "none";
    setDragging(true);
    setDropHint(hint);
  }

  function dragLeave(event: DragEvent<HTMLElement>) {
    const related = event.relatedTarget;
    if (related instanceof Node && event.currentTarget.contains(related))
      return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      (event.clientX || event.clientY) &&
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    )
      return;
    setDropHint(null);
    if (event.currentTarget === tree.current) {
      setDragging(false);
      dragScrollSpeed.current = 0;
    }
  }

  function drop(event: DragEvent<HTMLElement>, id: string | null) {
    const hint = eventDropHint(event, id);
    if (!hint) return;
    event.preventDefault();
    event.stopPropagation();
    const movingId =
      event.dataTransfer.getData("text/codebook-node") || draggingId.current;
    const files = Array.from(event.dataTransfer.files);
    finishDrag();
    if (!hint.valid) return;
    if (hint.placement === "inside" && id && collapsed.has(id)) onToggle(id);
    if (hint.external) {
      if (files.length) onImportFiles?.(files, id, hint.placement);
    } else if (movingId) {
      onMove(movingId, id, hint.legacy ? undefined : hint.placement);
    }
  }

  function dropClasses(id: string | null) {
    return dropHint?.targetId === id
      ? dropHint.valid
        ? `outline-drop-${dropHint.placement}`
        : "outline-drop-invalid"
      : "";
  }

  function finishRename(id: string, title?: string) {
    if (title) onRename(id, title);
    setEditingId(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) focusRow(id);
    });
  }

  return (
    <nav
      ref={tree}
      className={`book-tree outline-tree ${bible ? "bible-tree" : "manuscript-tree"}`}
      aria-label={bible ? "System bible structure" : "Book structure"}
      onDragEnd={finishDrag}
      onDragLeave={dragLeave}
      onDragOverCapture={dragScroll}
      onScroll={(event) => {
        if (virtualized)
          setViewport({
            top: event.currentTarget.scrollTop,
            height: event.currentTarget.clientHeight,
          });
      }}
      onFocusCapture={(event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-outline-id]",
        )?.dataset.outlineId;
        if (id) setFocusedId(id);
      }}
    >
      {virtualized && (
        <div
          ref={measure}
          className="outline-virtual-measure"
          aria-hidden="true"
        />
      )}
      <div
        className="outline-tree-content"
        style={{ minWidth: `${210 + maxDepth * 16}px` }}
      >
        <div
          className={virtualized ? "outline-virtual-list" : undefined}
          style={
            virtualized ? { height: visible.length * rowHeight } : undefined
          }
        >
          {rendered.map(({ entry: { node, depth }, position }) => {
            const hasChildren = parents.has(node.id);
            const current = node.id === activeId;
            const indent = {
              paddingLeft: `${depth * 16}px`,
              ...(virtualized
                ? {
                    position: "absolute" as const,
                    top: position * rowHeight,
                    height: rowHeight,
                    left: 0,
                    right: 0,
                    margin: 0,
                  }
                : {}),
            };
            if (node.type === "part") {
              return (
                <div
                  key={node.id}
                  className={`part-row outline-part ${dropClasses(node.id)}`}
                  style={indent}
                  data-outline-id={node.id}
                  data-outline-drop-row="true"
                  data-drop-placement={
                    dropHint?.targetId === node.id
                      ? dropHint.placement
                      : undefined
                  }
                  draggable={editingId !== node.id}
                  onDragStart={(event) => dragStart(event, node.id)}
                  onDragOver={(event) => dragOver(event, node.id)}
                  onDragLeave={dragLeave}
                  onDragEnd={finishDrag}
                  onDrop={(event) => drop(event, node.id)}
                >
                  {editingId === node.id ? (
                    <div className="part-name outline-part-editing">
                      <InlineRename
                        value={node.title}
                        label={`Rename part ${node.title}`}
                        onCommit={(title) => finishRename(node.id, title)}
                        onCancel={() => finishRename(node.id)}
                      />
                    </div>
                  ) : (
                    <button
                      className="part-name"
                      data-outline-id={node.id}
                      title={node.title}
                      aria-expanded={!collapsed.has(node.id)}
                      onKeyDown={(event) => navigate(event, node)}
                      onClick={() => onToggle(node.id)}
                      onDoubleClick={() => setEditingId(node.id)}
                    >
                      {collapsed.has(node.id) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      <span>{node.title}</span>
                    </button>
                  )}
                  <div className="outline-actions">
                    <button
                      className="row-edit"
                      aria-label={`Add child to ${node.title}`}
                      title="Add a section here"
                      onClick={() => onAddChild(node.id)}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      className="row-edit"
                      aria-label={`Edit part ${node.title}`}
                      title="Edit part"
                      onClick={() => onEdit(node)}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                </div>
              );
            }
            const number = index.numberById.get(node.id) || 0;
            const progress =
              progressOptions.find((option) => option.value === node.progress)
                ?.label || "Not started";
            const topic = (
              <span className={bible ? "section-topic" : "chapter-number"}>
                {bible ? (
                  <SectionIcon icon={node.icon} />
                ) : node.kind === "chapter" ? (
                  String(number).padStart(2, "0")
                ) : (
                  <FileText size={14} />
                )}
              </span>
            );
            const status = bible ? (
              <ProgressIcon progress={node.progress} />
            ) : (
              <span
                className={`chapter-status-dot status-${node.status.toLowerCase()}`}
                title={node.status}
              />
            );
            return (
              <div
                key={node.id}
                className={`outline-row ${current ? "outline-current" : ""} ${dropClasses(node.id)}`}
                style={indent}
                data-depth={depth}
                data-outline-id={node.id}
                data-outline-drop-row="true"
                data-drop-placement={
                  dropHint?.targetId === node.id
                    ? dropHint.placement
                    : undefined
                }
                onDragOver={(event) => dragOver(event, node.id)}
                onDragLeave={dragLeave}
                onDrop={(event) => drop(event, node.id)}
              >
                {hasChildren ? (
                  <button
                    className="outline-disclosure"
                    aria-label={`${collapsed.has(node.id) ? "Expand" : "Collapse"} ${node.title}`}
                    aria-expanded={!collapsed.has(node.id)}
                    title={`${collapsed.has(node.id) ? "Expand" : "Collapse"} section`}
                    onClick={() => onToggle(node.id)}
                  >
                    {collapsed.has(node.id) ? (
                      <ChevronRight size={13} />
                    ) : (
                      <ChevronDown size={13} />
                    )}
                  </button>
                ) : (
                  <span
                    className="outline-disclosure-spacer"
                    aria-hidden="true"
                  />
                )}
                <EmojiPicker
                  title={node.title}
                  value={node.emoji}
                  onChange={(emoji) => onEmojiChange(node.id, emoji)}
                />
                {editingId === node.id ? (
                  <div
                    className={`chapter-row outline-row-editing ${current ? "current" : ""} ${node.parentId ? "nested" : ""}`}
                  >
                    {topic}
                    <InlineRename
                      value={node.title}
                      label={`Rename ${bible ? "section" : "chapter"} ${node.title}`}
                      onCommit={(title) => finishRename(node.id, title)}
                      onCancel={() => finishRename(node.id)}
                    />
                    {status}
                  </div>
                ) : (
                  <button
                    className={`chapter-row ${current ? "current" : ""} ${node.parentId ? "nested" : ""}`}
                    data-outline-id={node.id}
                    aria-current={current ? "page" : undefined}
                    title={bible ? `${node.title} · ${progress}` : node.title}
                    draggable
                    onDragStart={(event) => dragStart(event, node.id)}
                    onDragEnd={finishDrag}
                    onKeyDown={(event) => navigate(event, node)}
                    onClick={() => onSelect(node.id)}
                    onDoubleClick={() => setEditingId(node.id)}
                  >
                    {topic}
                    <span className="outline-title">{node.title}</span>
                    {status}
                  </button>
                )}
                <div className="outline-actions">
                  <button
                    className="row-edit"
                    aria-label={`Add child to ${node.title}`}
                    title="Add a section here"
                    onClick={() => onAddChild(node.id)}
                  >
                    <Plus size={13} />
                  </button>
                  <button
                    className="row-edit"
                    aria-label={`Edit ${bible ? "section" : "chapter"} ${node.title}`}
                    title="Section settings"
                    onClick={() => onEdit(node)}
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div
          className={`outline-root-drop ${dragging ? "outline-drag-active" : ""} ${dropClasses(null)}`}
          role="region"
          aria-label="Move to top level"
          data-outline-root-drop="true"
          onDragOver={(event) => dragOver(event, null)}
          onDragLeave={dragLeave}
          onDrop={(event) => drop(event, null)}
        >
          Move to top level
        </div>
        <div className="outline-drop-hint" role="status" aria-live="polite">
          {dropHint?.message ||
            (dragging
              ? "Drop between sections to reorder, or on a section to nest."
              : "")}
        </div>
      </div>
    </nav>
  );
}

function dropMessage(
  placement: OutlineDropPlacement,
  title: string | undefined,
  external: boolean,
) {
  const verb = external ? "Add chapters" : "Move";
  if (placement === "root") return `${verb} to top level`;
  return `${verb} ${placement === "inside" ? "into" : placement} ${title || "section"}`;
}
