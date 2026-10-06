import { Extension, Mark } from "@tiptap/core";
import { cachedDecorationPlugin } from "./runtime";
import {
  parseTextStyle,
  parseBlockStyle,
  textStyleCSS,
  blockStyleCSS,
  normalizeFormattingValue,
} from "../formatting";

const textKeys = [
  "fontFamily",
  "fontSize",
  "color",
  "backgroundColor",
] as const;
const blockKeys = [
  ...textKeys,
  "textAlign",
  "lineHeight",
  "marginTop",
  "marginBottom",
  "marginLeft",
  "marginRight",
  "textIndent",
  "paddingLeft",
] as const;

function presentationAttrs(style: string, attrs: Record<string, unknown>) {
  if (!style) return {};
  const color = String(attrs.color || "").toLowerCase();
  const hex = /^#([a-f0-9]{3}|[a-f0-9]{6})$/.exec(color)?.[1];
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(color);
  const channels = hex
    ? (hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex
      )
        .match(/../g)!
        .map((c) => parseInt(c, 16))
    : rgb
      ? rgb.slice(1).map(Number)
      : color === "black"
        ? [0, 0, 0]
        : [];
  const darkNeutral =
    channels.length === 3 &&
    Math.max(...channels) <= 85 &&
    Math.max(...channels) - Math.min(...channels) <= 20;
  const background = String(attrs.backgroundColor || "").toLowerCase();
  const alpha = /^(?:rgba|hsla)\([^)]*,\s*(\d*(?:\.\d+)?)\s*\)$/.exec(
    background,
  )?.[1];
  const transparentBackground =
    !background ||
    background === "transparent" ||
    /^#(?:[a-f0-9]{3}0|[a-f0-9]{6}00)$/.test(background) ||
    (alpha !== undefined && Number(alpha) === 0);
  const explicitBackground = !transparentBackground;
  const automaticInk = darkNeutral && !explicitBackground;
  return {
    style,
    ...(automaticInk ? { "data-document-ink": "default" } : {}),
    ...(explicitBackground ? { "data-document-background": "explicit" } : {}),
  };
}

/** Store supported typography as document data, rather than a transient paste style. */
export const ImportedTextStyle = Mark.create({
  name: "textStyle",
  addAttributes() {
    return Object.fromEntries(
      textKeys.map((name) => [
        name,
        {
          default: null,
          parseHTML: (element: HTMLElement) => parseTextStyle(element)[name],
          renderHTML: () => ({}),
        },
      ]),
    );
  },
  parseHTML() {
    return [
      {
        tag: "span[style]",
        getAttrs: (element) => {
          const attrs = parseTextStyle(element as HTMLElement);
          return textKeys.some((key) => attrs[key]) ? attrs : false;
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes, mark }) {
    const style = textStyleCSS(mark.attrs);
    return [
      "span",
      { ...HTMLAttributes, ...presentationAttrs(style, mark.attrs) },
      0,
    ];
  },
});

export const ImportedBlockStyle = Extension.create({
  name: "importedBlockStyle",
  addProseMirrorPlugins() {
    return [
      cachedDecorationPlugin("importedBlankLines", (node) => {
        if (!node.isTextblock) return node.isLeaf ? [] : null;
        if (node.type.name !== "paragraph" || node.textContent.trim())
          return [];
        let blank = true;
        node.forEach((child) => {
          if (!child.isText && child.type.name !== "hardBreak") blank = false;
        });
        return blank
          ? [
              {
                from: 0,
                to: node.nodeSize,
                node: true,
                attributes: { "data-blank-line": "true" },
              },
            ]
          : [];
      }),
    ];
  },
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "bulletList",
          "orderedList",
          "listItem",
          "blockquote",
          "tableCell",
          "tableHeader",
          "callout",
        ],
        attributes: Object.fromEntries(
          blockKeys.map((name) => [
            name,
            {
              default: null,
              parseHTML: (element: HTMLElement) =>
                parseBlockStyle(element)[name],
              renderHTML: (attrs: Record<string, unknown>) => {
                // One attribute supplies the combined style so split declarations cannot override one another.
                const style =
                  name === "fontFamily"
                    ? [
                        blockStyleCSS(attrs),
                        ...(["marginTop", "marginBottom"] as const).flatMap(
                          (key) => {
                            const property =
                              key === "marginTop"
                                ? "margin-top"
                                : "margin-bottom";
                            const value = normalizeFormattingValue(
                              property,
                              attrs[key],
                            );
                            return value === null
                              ? []
                              : [`--document-${property}: ${value}`];
                          },
                        ),
                      ]
                        .filter(Boolean)
                        .join("; ")
                    : "";
                return presentationAttrs(style, attrs);
              },
            },
          ]),
        ),
      },
    ];
  },
});
