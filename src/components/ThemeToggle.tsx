import { Moon, Sun } from "lucide-react";

export default function ThemeToggle({
  theme,
  toggle,
}: {
  theme: string;
  toggle: () => void;
}) {
  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";
  return (
    <button
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
