import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findDocumentMatches, type SearchMatch } from "../search";

interface HighlightSettings {
  query: string;
  caseSensitive: boolean;
  activeRange?: SearchMatch;
}
interface HighlightState extends HighlightSettings {
  decorations: DecorationSet;
}

export const searchHighlightsKey = new PluginKey<HighlightState>(
  "codebookSearchHighlights",
);

/** Search decorations are view state and never enter saved documents or Undo. */
export const SearchHighlights = Extension.create({
  name: "searchHighlights",
  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: searchHighlightsKey,
        state: {
          init: () => ({
            query: "",
            caseSensitive: false,
            decorations: DecorationSet.empty,
          }),
          apply(transaction, previous) {
            const requested = transaction.getMeta(searchHighlightsKey) as
              HighlightSettings | undefined;
            if (!requested && !transaction.docChanged) return previous;
            const settings: HighlightSettings = requested || {
              query: previous.query,
              caseSensitive: previous.caseSensitive,
              ...(previous.activeRange
                ? {
                    activeRange: {
                      from: transaction.mapping.map(
                        previous.activeRange.from,
                        1,
                      ),
                      to: transaction.mapping.map(previous.activeRange.to, -1),
                    },
                  }
                : {}),
            };
            const matches = findDocumentMatches(
              transaction.doc,
              settings.query,
              settings.caseSensitive,
            );
            const decorations = DecorationSet.create(
              transaction.doc,
              matches.map((match) => {
                const active =
                  match.from === settings.activeRange?.from &&
                  match.to === settings.activeRange?.to;
                return Decoration.inline(match.from, match.to, {
                  class: active ? "search-match is-active" : "search-match",
                  "data-search-match": "true",
                  ...(active ? { "data-search-active": "true" } : {}),
                });
              }),
            );
            return { ...settings, decorations };
          },
        },
        props: {
          decorations(state) {
            return (
              searchHighlightsKey.getState(state)?.decorations ||
              DecorationSet.empty
            );
          },
        },
      }),
    ];
  },
});

export function setSearchHighlights(
  editor: Editor,
  query: string,
  caseSensitive: boolean,
  activeRange?: SearchMatch,
) {
  const previous = searchHighlightsKey.getState(editor.state);
  if (
    !previous ||
    (previous.query === query &&
      previous.caseSensitive === caseSensitive &&
      previous.activeRange?.from === activeRange?.from &&
      previous.activeRange?.to === activeRange?.to)
  )
    return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(searchHighlightsKey, {
        query,
        caseSensitive,
        activeRange,
      } satisfies HighlightSettings)
      .setMeta("addToHistory", false),
  );
}
