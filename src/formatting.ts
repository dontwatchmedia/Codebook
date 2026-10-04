// Formatting copied from document editors must remain useful without allowing
// arbitrary CSS, external resources, or page layout controls into a manuscript.
const textProperties = {
  fontFamily: "font-family",
  fontSize: "font-size",
  color: "color",
  backgroundColor: "background-color",
} as const;
const blockProperties = {
  ...textProperties,
  textAlign: "text-align",
  lineHeight: "line-height",
  marginTop: "margin-top",
  marginBottom: "margin-bottom",
  marginLeft: "margin-left",
  marginRight: "margin-right",
  textIndent: "text-indent",
  paddingLeft: "padding-left",
} as const;
export type TextFormatting = Record<keyof typeof textProperties, string | null>;
export type BlockFormatting = Record<
  keyof typeof blockProperties,
  string | null
>;

function length(value: string, limits: Record<string, [number, number]>) {
  if (value === "0") return limits.px?.[0] === 0 ? "0px" : null;
  const match = /^(\d+(?:\.\d+)?|\.\d+)(px|pt|em|rem|%)$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const range = limits[match[2]];
  return range && amount >= range[0] && amount <= range[1]
    ? `${amount}${match[2]}`
    : null;
}

export function normalizeFormattingValue(
  property: string,
  input: unknown,
): string | null {
  if (typeof input !== "string" || input.length > 200) return null;
  const value = input.trim();
  if (!value || /[;{}<>\\\u0000-\u001f]|!important/i.test(value)) return null;
  switch (property) {
    case "font-family": {
      const names = value.split(",").map((name) => name.trim());
      if (
        names.length > 8 ||
        names.some(
          (name) =>
            !/^(?:[a-zA-Z0-9 -]+|"[a-zA-Z0-9 -]+"|'[a-zA-Z0-9 -]+')$/.test(
              name,
            ),
        )
      )
        return null;
      return names
        .map((name) => {
          const plain = name.replace(/^["']|["']$/g, "");
          return plain.includes(" ") ? `"${plain}"` : plain;
        })
        .join(", ");
    }
    case "font-size":
      return length(value.toLowerCase(), {
        px: [6, 128],
        pt: [4.5, 96],
        em: [0.5, 8],
        rem: [0.5, 8],
        "%": [50, 800],
      });
    case "color":
    case "background-color": {
      const color = value.toLowerCase();
      if (/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/.test(color))
        return color;
      if (
        /^[a-z]{3,24}$/.test(color) &&
        !/^(inherit|initial|unset|revert)$/.test(color)
      )
        return color;
      const rgb =
        /^rgba?\(\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/.exec(
          color,
        );
      if (
        rgb &&
        rgb
          .slice(1, 4)
          .every(
            (part) => parseFloat(part) <= (part.endsWith("%") ? 100 : 255),
          ) &&
        (rgb[4] === undefined || (Number(rgb[4]) >= 0 && Number(rgb[4]) <= 1))
      )
        return color;
      const hsl =
        /^hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*(\d*(?:\.\d+)?))?\s*\)$/.exec(
          color,
        );
      if (
        hsl &&
        Number(hsl[1]) <= 360 &&
        Number(hsl[2]) <= 100 &&
        Number(hsl[3]) <= 100 &&
        (hsl[4] === undefined || (Number(hsl[4]) >= 0 && Number(hsl[4]) <= 1))
      )
        return color;
      return null;
    }
    case "font-weight": {
      const weight = value.toLowerCase();
      if (weight === "normal") return "400";
      if (weight === "bold" || weight === "bolder") return "700";
      return /^[1-9]00$/.test(weight) ? weight : null;
    }
    case "font-style":
      return /^(normal|italic|oblique)$/.test(value) ? value : null;
    case "text-decoration":
    case "text-decoration-line": {
      const decoration = value.toLowerCase().split(/\s+/);
      return decoration.length <= 2 &&
        decoration.every((part) => /^(none|underline|line-through)$/.test(part))
        ? decoration.join(" ")
        : null;
    }
    case "text-align":
      return /^(left|right|center|justify|start|end)$/.test(value)
        ? value
        : null;
    case "line-height": {
      if (value === "normal") return value;
      if (/^(\d+(?:\.\d+)?|\.\d+)$/.test(value))
        return Number(value) >= 0.8 && Number(value) <= 4
          ? String(Number(value))
          : null;
      return length(value, {
        px: [8, 160],
        pt: [6, 120],
        em: [0.5, 8],
        rem: [0.5, 8],
        "%": [50, 800],
      });
    }
    case "margin-top":
    case "margin-bottom":
    case "margin-left":
    case "margin-right":
    case "text-indent":
    case "padding-left":
      return length(value, {
        px: [0, 192],
        pt: [0, 144],
        em: [0, 12],
        rem: [0, 12],
        "%": [0, 40],
      });
    default:
      return null;
  }
}

export function sanitizeInlineStyle(style: string): string {
  const approved = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    const value = normalizeFormattingValue(
      property,
      declaration.slice(colon + 1),
    );
    if (value !== null)
      approved.set(
        property === "text-decoration-line" ? "text-decoration" : property,
        value,
      );
  }
  return [...approved]
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function parseFormatting<T extends Record<string, string>>(
  element: HTMLElement,
  properties: T,
): Record<keyof T, string | null> {
  return Object.fromEntries(
    Object.entries(properties).map(([attribute, property]) => [
      attribute,
      normalizeFormattingValue(
        property,
        element.style.getPropertyValue(property),
      ),
    ]),
  ) as Record<keyof T, string | null>;
}
function formattingCSS(
  attrs: Record<string, unknown>,
  properties: Record<string, string>,
): string {
  return Object.entries(properties)
    .flatMap(([attribute, property]) => {
      const value = normalizeFormattingValue(property, attrs[attribute]);
      return value === null ? [] : [`${property}: ${value}`];
    })
    .join("; ");
}
export const parseTextStyle = (element: HTMLElement): TextFormatting =>
  parseFormatting(element, textProperties);
export const parseBlockStyle = (element: HTMLElement): BlockFormatting =>
  parseFormatting(element, blockProperties);
export const textStyleCSS = (attrs: Record<string, unknown>): string =>
  formattingCSS(attrs, textProperties);
export const blockStyleCSS = (attrs: Record<string, unknown>): string =>
  formattingCSS(attrs, blockProperties);
