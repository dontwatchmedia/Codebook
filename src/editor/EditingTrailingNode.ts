import { TrailingNode } from "@tiptap/extensions";
import { Plugin } from "@tiptap/pm/state";

// Opening a section, restoring its cursor or updating search decorations must
// not append content and mark the book modified. Keep Tiptap's trailing editing
// paragraph, but only after a transaction that actually changes the document.
export const EditingTrailingNode = TrailingNode.extend({
  addProseMirrorPlugins() {
    return (this.parent?.() || []).map((plugin) => {
      const append = plugin.spec.appendTransaction;
      if (!append) return plugin;
      return new Plugin({
        ...plugin.spec,
        appendTransaction(transactions, previous, state) {
          if (!transactions.some((transaction) => transaction.docChanged))
            return null;
          return append.call(this, transactions, previous, state);
        },
      });
    });
  },
});
