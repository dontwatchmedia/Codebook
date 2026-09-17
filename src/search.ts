import type { Editor } from "@tiptap/core";
export function findMatches(editor: Editor, query: string, sensitive: boolean) {
  if (!query) return [];
  const result: { from: number; to: number }[] = [],
    needle = sensitive ? query : query.toLowerCase();
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = sensitive ? node.textContent : node.textContent.toLowerCase();
    let start = 0,
      index: number;
    while ((index = text.indexOf(needle, start)) !== -1) {
      result.push({
        from: pos + 1 + index,
        to: pos + 1 + index + query.length,
      });
      start = index + Math.max(1, query.length);
    }
    return false;
  });
  return result;
}
