import { lowlight } from "./highlighting";
import { cachedDecorationPlugin, type RelativeDecoration } from "./runtime";

interface HighlightNode {
  value?: string;
  properties?: { className?: (string | number)[] };
  children?: HighlightNode[];
}
export function codeDecorations(name: string, defaultLanguage?: string | null) {
  return cachedDecorationPlugin("codebookLowlight", (node) => {
    if (node.type.name !== name)
      return node.isTextblock || node.isLeaf ? [] : null;
    const language = node.attrs.language || defaultLanguage;
    const highlighted =
      language && lowlight.registered(language)
        ? lowlight.highlight(language, node.textContent)
        : lowlight.highlightAuto(node.textContent);
    const decorations: RelativeDecoration[] = [];
    let from = 1;
    const visit = (
      entry: HighlightNode,
      parentClasses: (string | number)[],
    ) => {
      const classes = [
        ...parentClasses,
        ...(entry.properties?.className || []),
      ];
      if (entry.children) {
        entry.children.forEach((child) => visit(child, classes));
        return;
      }
      const to = from + (entry.value?.length || 0);
      if (to > from && classes.length)
        decorations.push({
          from,
          to,
          attributes: { class: classes.join(" ") },
        });
      from = to;
    };
    highlighted.children.forEach((entry) => visit(entry as HighlightNode, []));
    return decorations;
  });
}
