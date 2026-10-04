import {
  ChevronDown,
  ChevronRight,
  FileText,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  ancestors,
  chapters,
  outlineEntries,
  type Book,
  type BookNode,
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
  onMove: (movingId: string, targetId: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (id: string, title: string) => void;
  onEmojiChange: (id: string, emoji?: string) => void;
}

export default function OutlineTree({
  book,
  activeId,
  collapsed,
  onToggle,
  onSelect,
  onEdit,
  onMove,
  onAddChild,
  onRename,
  onEmojiChange,
}: Props) {
  const tree = useRef<HTMLElement>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const bible = book.mode === "bible";
  const entries = outlineEntries(book);
  const visible = entries.filter(
    ({ node }) =>
      !ancestors(book, node.id).some((parent) => collapsed.has(parent.id)),
  );
  const parents = new Set(
    book.nodes.flatMap((node) =>
      node.type === "chapter" && node.parentId ? [node.parentId] : [],
    ),
  );
  const numbered = chapters(book).filter(
    (chapter) => chapter.kind === "chapter",
  );
  const maxDepth = Math.max(0, ...visible.map(({ depth }) => depth));

  function focusRow(id?: string) {
    if (!id) return;
    const buttons =
      tree.current?.querySelectorAll<HTMLButtonElement>("[data-outline-id]");
    Array.from(buttons || [])
      .find((button) => button.dataset.outlineId === id)
      ?.focus();
  }

  function navigate(event: KeyboardEvent<HTMLButtonElement>, node: BookNode) {
    const index = visible.findIndex((entry) => entry.node.id === node.id);
    if (event.key === "F2") {
      event.preventDefault();
      setEditingId(node.id);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(visible[index + (event.key === "ArrowDown" ? 1 : -1)]?.node.id);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(visible[event.key === "Home" ? 0 : visible.length - 1]?.node.id);
    } else if (event.key === "ArrowRight" && parents.has(node.id)) {
      event.preventDefault();
      if (collapsed.has(node.id)) onToggle(node.id);
      else focusRow(visible[index + 1]?.node.id);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (parents.has(node.id) && !collapsed.has(node.id)) onToggle(node.id);
      else focusRow(ancestors(book, node.id).at(-1)?.id);
    }
  }

  function dragStart(event: DragEvent<HTMLElement>, id: string) {
    if (editingId === id) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/codebook-node", id);
    event.dataTransfer.effectAllowed = "move";
  }

  function dragOver(event: DragEvent<HTMLElement>, id: string) {
    if (!event.dataTransfer.types.includes("text/codebook-node")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(id);
  }

  function drop(event: DragEvent<HTMLElement>, id: string) {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const movingId = event.dataTransfer.getData("text/codebook-node");
    if (movingId) onMove(movingId, id);
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
    >
      <div
        className="outline-tree-content"
        style={{ minWidth: `${210 + maxDepth * 16}px` }}
      >
        {visible.map(({ node, depth }) => {
          const hasChildren = parents.has(node.id);
          const current = node.id === activeId;
          const indent = { paddingLeft: `${depth * 16}px` };
          if (node.type === "part") {
            return (
              <div
                key={node.id}
                className={`part-row outline-part ${dropTarget === node.id ? "outline-drop-target" : ""}`}
                style={indent}
                draggable={editingId !== node.id}
                onDragStart={(event) => dragStart(event, node.id)}
                onDragOver={(event) => dragOver(event, node.id)}
                onDragLeave={() => setDropTarget(null)}
                onDragEnd={() => setDropTarget(null)}
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
          const number =
            numbered.findIndex((chapter) => chapter.id === node.id) + 1;
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
              className={`outline-row ${current ? "outline-current" : ""} ${dropTarget === node.id ? "outline-drop-target" : ""}`}
              style={indent}
              data-depth={depth}
              onDragOver={(event) => dragOver(event, node.id)}
              onDragLeave={() => setDropTarget(null)}
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
                  onDragEnd={() => setDropTarget(null)}
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
    </nav>
  );
}
