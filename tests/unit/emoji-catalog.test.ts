import { describe, expect, it } from "vitest";
import {
  emojiCategories,
  emojiChoices,
  searchEmoji,
} from "../../src/emojiCatalog";
import { normalizeSectionEmoji } from "../../src/model";

const emojiKey = (value: string) => value.replace(/[\uFE0E\uFE0F]/g, "");
const emojis = (query: string, category?: string) =>
  searchEmoji(query, category).map((choice) => choice.emoji);

describe("Offline emoji catalog", () => {
  it("covers the Unicode 15.1 catalog without duplicates or unsavable choices", () => {
    expect(emojiChoices).toHaveLength(3773);
    expect(new Set(emojiChoices.map(({ emoji }) => emojiKey(emoji))).size).toBe(
      3773,
    );
    expect(
      emojiChoices.every(({ emoji }) => normalizeSectionEmoji(emoji) === emoji),
    ).toBe(true);
    expect(
      emojiChoices.every(({ label, keywords }) => label && keywords.length),
    ).toBe(true);
    expect(emojiChoices.map(({ emoji }) => emoji)).toEqual(
      expect.arrayContaining(["🧑🏿‍🔬", "👨‍👩‍👧‍👦", "🇺🇸", "1️⃣", "🐦‍🔥", "🙂‍↔️"]),
    );
  });

  it("keeps the original suggested markers and names in their familiar order", () => {
    const choices = searchEmoji("", "suggested");
    expect(choices).toHaveLength(25);
    expect(
      choices.slice(0, 5).map(({ emoji, label }) => [emoji, label]),
    ).toEqual([
      ["✅", "Complete"],
      ["🟪", "In progress"],
      ["❌", "Not started"],
      ["🚧", "Under construction"],
      ["⏸️", "On hold"],
    ]);
    expect(choices.at(-1)).toMatchObject({ emoji: "📦", label: "Inventory" });
    expect(emojiChoices.slice(0, 25)).toEqual(choices);
  });

  it("finds project status and domain aliases, with precise names ahead of broad matches", () => {
    expect(searchEmoji("done")[0]).toMatchObject({
      emoji: "✅",
      label: "Complete",
    });
    expect(searchEmoji("wip")[0].emoji).toBe("🟪");
    expect(searchEmoji("todo")[0].emoji).toBe("❌");
    expect(searchEmoji("mechanics")[0].emoji).toBe("⚙️");
    expect(searchEmoji("documentation")[0].emoji).toBe("📝");
    expect(searchEmoji("farming")[0].emoji).toBe("🌱");
    expect(searchEmoji("dragon")[0]).toMatchObject({
      emoji: "🐉",
      label: "Dragon",
    });
    expect(emojis(":thumbsup:")).toContain("👍");
    expect(emojis("thumbs_up")).toContain("👍");
    expect(emojis("favourite")).toContain("⭐");
  });

  it("matches case, word prefixes, accent-free names, and every query term in any order", () => {
    expect(emojis("  DRAG  ")).toEqual(expect.arrayContaining(["🐉", "🐲"]));
    expect(emojis("skin scientist dark")).toContain("🧑🏿‍🔬");
    expect(emojis("sci dar sk")).toContain("🧑🏿‍🔬");
    expect(emojis("sci dar sk")).not.toContain("🧑🏻‍🔬");
    expect(emojis("reunion")).toContain("🇷🇪");
    expect(emojis("united states")).toContain("🇺🇸");
    expect(emojis("rocket dragon")).toEqual([]);
  });

  it("searches a literal glyph with or without a presentation selector, retaining variants", () => {
    expect(emojis("🐉")).toEqual(["🐉"]);
    expect(emojis("❤")).toEqual(["❤️"]);
    expect(emojis("\u2764\uFE0E")).toEqual(["❤️"]);
    expect(emojis("👩🏽‍💻")).toEqual(["👩🏽‍💻"]);
    expect(emojis("🇺🇸")).toEqual(["🇺🇸"]);
    expect(emojis("1⃣")).toEqual(["1️⃣"]);
    expect(emojis("✅✅")).toEqual([]);
  });

  it("filters categories without losing suggested emoji from their real categories", () => {
    expect(emojis("", "symbols")).toContain("✅");
    expect(emojis("", "activities")).toContain("🎮");
    expect(emojis("dragon", "animals")).toContain("🐉");
    expect(emojis("dragon", "food")).not.toContain("🐉");
    expect(emojis("🐉", "food")).toEqual([]);
    expect(emojis("done", "suggested")).toEqual(["✅"]);
    expect(emojis("scientist", "suggested")).toEqual([]);
    expect(emojis("", "missing")).toEqual([]);
    for (const { id } of emojiCategories.filter(
      ({ id }) => !["all", "suggested"].includes(id),
    )) {
      expect(searchEmoji("", id).length).toBeGreaterThan(50);
      expect(searchEmoji("", id).every(({ category }) => category === id)).toBe(
        true,
      );
    }
    expect(emojis("objects").length).toBeGreaterThan(50);
  });

  it("keeps blank queries useful and returns no matches for unknown words or punctuation", () => {
    expect(searchEmoji(" \t\n ")).toEqual(emojiChoices);
    expect(emojis("no-such-emoji-asdfghjkl")).toEqual([]);
    expect(emojis(":::")).toEqual([]);
  });
});
