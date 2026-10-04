import {
  Circle,
  CircleCheck,
  CircleDot,
  CircleX,
  Code2,
  FileText,
  Flag,
  Gamepad2,
  Globe2,
  Hammer,
  Layers,
  Leaf,
  Lightbulb,
  PauseCircle,
  Users,
} from "lucide-react";
import type { Progress, SectionIconName } from "../model";
import "./outline.css";

export const iconOptions: { value: SectionIconName; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "layers", label: "System" },
  { value: "gamepad", label: "Game" },
  { value: "globe", label: "World" },
  { value: "users", label: "People" },
  { value: "leaf", label: "Nature" },
  { value: "hammer", label: "Building" },
  { value: "code", label: "Code" },
  { value: "lightbulb", label: "Idea" },
  { value: "flag", label: "Milestone" },
];

export const progressOptions: { value: Progress; label: string }[] = [
  { value: "not-started", label: "Not started" },
  { value: "in-progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "blocked", label: "Blocked" },
  { value: "on-hold", label: "On hold" },
];

const sectionIcons = {
  document: FileText,
  layers: Layers,
  gamepad: Gamepad2,
  globe: Globe2,
  users: Users,
  leaf: Leaf,
  hammer: Hammer,
  code: Code2,
  lightbulb: Lightbulb,
  flag: Flag,
};

const progressIcons = {
  "not-started": Circle,
  "in-progress": CircleDot,
  complete: CircleCheck,
  blocked: CircleX,
  "on-hold": PauseCircle,
};

export function SectionIcon({
  icon = "document",
  size = 15,
}: {
  icon?: SectionIconName;
  size?: number;
}) {
  const Icon = sectionIcons[icon] || FileText;
  return <Icon size={size} aria-hidden="true" className="section-symbol" />;
}

export function ProgressIcon({
  progress = "not-started",
  size = 15,
}: {
  progress?: Progress;
  size?: number;
}) {
  const Icon = progressIcons[progress] || Circle;
  const label = progressOptions.find(
    (option) => option.value === progress,
  )?.label;
  return (
    <span
      className={`section-progress progress-${progress}`}
      role="img"
      aria-label={label || "Not started"}
      title={label || "Not started"}
    >
      <Icon size={size} aria-hidden="true" />
    </span>
  );
}
