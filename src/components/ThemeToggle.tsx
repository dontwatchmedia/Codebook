import { Moon, Sun } from "lucide-react";
import { isDarkTheme } from "../theme";

export default function ThemeToggle({
  theme,
  toggle,
}: {
  theme: string;
  toggle: () => void;
}) {
  const dark = isDarkTheme(theme);
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
