import catalogData from "./data/emoji.json";
import { normalizeSectionEmoji } from "./model";

export interface EmojiChoice {
  emoji: string;
  label: string;
  category: string;
  keywords: readonly string[];
}

export const emojiCategories: readonly { id: string; label: string }[] = [
  { id: "all", label: "All emoji" },
  { id: "suggested", label: "Suggested" },
  { id: "smileys", label: "Smileys & emotion" },
  { id: "people", label: "People & body" },
  { id: "animals", label: "Animals & nature" },
  { id: "food", label: "Food & drink" },
  { id: "travel", label: "Travel & places" },
  { id: "activities", label: "Activities" },
  { id: "objects", label: "Objects" },
  { id: "symbols", label: "Symbols" },
  { id: "flags", label: "Flags" },
];

// These familiar writing and project markers stay first, with their old names.
const suggested = [
  ["✅", "Complete"],
  ["🟪", "In progress"],
  ["❌", "Not started"],
  ["🚧", "Under construction"],
  ["⏸️", "On hold"],
  ["🎮", "Game"],
  ["🌍", "World"],
  ["🌱", "Nature"],
  ["🏡", "Home"],
  ["⚙️", "System"],
  ["🧰", "Tools"],
  ["📝", "Notes"],
  ["📚", "Reference"],
  ["💡", "Idea"],
  ["📌", "Pinned"],
  ["🎯", "Goal"],
  ["🐾", "Animals"],
  ["👥", "Community"],
  ["🔨", "Building"],
  ["🎨", "Art"],
  ["⭐", "Favorite"],
  ["🔥", "Fire"],
  ["🌊", "Water"],
  ["🍎", "Food"],
  ["📦", "Inventory"],
] as const;

function emojiKey(value: string): string {
  return value.replace(/[\uFE0E\uFE0F]/g, "");
}

const suggestedKeys = new Set(suggested.map(([emoji]) => emojiKey(emoji)));
const sourceChoices = (catalogData as [string, string, string, string[]][])
  .filter(([emoji]) => normalizeSectionEmoji(emoji) === emoji)
  .map(([emoji, label, category, keywords]): EmojiChoice => ({
    emoji,
    label,
    category,
    keywords,
  }));
const choiceByEmoji = new Map(
  sourceChoices.map((choice) => [emojiKey(choice.emoji), choice]),
);

/** Unicode 15.1 choices and English CLDR names, bundled for offline use. */
export const emojiChoices: readonly EmojiChoice[] = [
  ...suggested.flatMap(([emoji, label]) => {
    const choice = choiceByEmoji.get(emojiKey(emoji));
    return choice
      ? [{ ...choice, label, keywords: [choice.label, ...choice.keywords] }]
      : [];
  }),
  ...sourceChoices.filter(
    (choice) => !suggestedKeys.has(emojiKey(choice.emoji)),
  ),
];

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase("en")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const categoryLabels = new Map(
  emojiCategories.map(({ id, label }) => [id, normalizeText(label)]),
);
const searchIndex = emojiChoices.map((choice, order) => {
  const label = normalizeText(choice.label);
  const keywords = choice.keywords.map(normalizeText);
  const category = categoryLabels.get(choice.category) || choice.category;
  const names = [label, ...keywords];
  return {
    choice,
    order,
    label,
    keywords,
    names,
    nameWords: names.flatMap((name) => name.split(" ")),
    category,
    words: [...names, category].flatMap((name) => name.split(" ")),
  };
});

/** Match every query word against names, aliases, keywords, or a category. */
export function searchEmoji(
  query: string,
  category = "all",
): readonly EmojiChoice[] {
  if (!categoryLabels.has(category)) return [];
  const eligible = searchIndex.filter(({ choice }) =>
    category === "all"
      ? true
      : category === "suggested"
        ? suggestedKeys.has(emojiKey(choice.emoji))
        : choice.category === category,
  );
  if (!query.trim()) return eligible.map(({ choice }) => choice);

  // Searching a pasted emoji is exact, including skin tones and joined forms.
  // The text/emoji presentation selector does not change its identity.
  const literal = emojiKey(query.trim());
  const emojiMatch = eligible.find(
    ({ choice }) => emojiKey(choice.emoji) === literal,
  );
  if (emojiMatch) return [emojiMatch.choice];

  const phrase = normalizeText(query);
  if (!phrase) return [];
  const terms = [...new Set(phrase.split(" "))];
  return eligible
    .flatMap((entry) => {
      const wordMatches = terms.map((term) =>
        entry.words.some((word) => word.startsWith(term)),
      );
      if (
        !terms.every(
          (term, index) =>
            wordMatches[index] ||
            entry.names.some((name) => name.includes(term)) ||
            entry.category.includes(term),
        )
      )
        return [];

      const score =
        entry.label === phrase
          ? 1000
          : entry.keywords.includes(phrase)
            ? 900
            : entry.label.startsWith(phrase)
              ? 800
              : entry.keywords.some((keyword) => keyword.startsWith(phrase))
                ? 700
                : terms.every((term) =>
                      entry.nameWords.some((word) => word.startsWith(term)),
                    )
                  ? 600
                  : wordMatches.every(Boolean)
                    ? 400
                    : 200;
      return [{ entry, score }];
    })
    .sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
    .map(({ entry }) => entry.choice);
}
