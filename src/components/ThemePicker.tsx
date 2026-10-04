import { Palette } from "lucide-react";
import { isTheme, themeOptions, type Theme } from "../theme";

export default function ThemePicker({
  theme,
  onChange,
}: {
  theme: string;
  onChange: (theme: Theme) => void;
}) {
  return (
    <label className="theme-picker" title="Choose a color theme">
      <Palette size={16} aria-hidden="true" />
      <select
        aria-label="Color theme"
        value={isTheme(theme) ? theme : "light"}
        onChange={(event) => {
          const selected = event.target.value;
          if (isTheme(selected)) onChange(selected);
        }}
      >
        {themeOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
