import fs from "node:fs";
import crypto from "node:crypto";

// Developer-only regeneration. The app imports the generated JSON, never fetches.
// Run from the repository root: node scripts/build-emoji-catalog.mjs
const source = ".cache/emoji-source";
fs.mkdirSync(source, { recursive: true });
const inputs = [
  [
    "emoji-test.txt",
    "https://unicode.org/Public/emoji/15.1/emoji-test.txt",
    "d876ee249aa28eaa76cfa6dfaa702847a8d13b062aa488d465d0395ee8137ed9",
  ],
  [
    "en.xml",
    "https://raw.githubusercontent.com/unicode-org/cldr/release-44/common/annotations/en.xml",
    "13db8bb0a85a1ab9c46dd70f6170d72e7938063eb04cb2ee65e46d0378cfebf6",
  ],
  [
    "en-derived.xml",
    "https://raw.githubusercontent.com/unicode-org/cldr/release-44/common/annotationsDerived/en.xml",
    "cfcadefede165fdad566f32894d4a7975a0bce76ca3d6758a5f8f448e550e6b2",
  ],
];
for (const [file, url, expected] of inputs) {
  const path = `${source}/${file}`;
  if (!fs.existsSync(path)) {
    const response = await fetch(url);
    if (!response.ok)
      throw new Error(`Unable to fetch ${url}: ${response.status}`);
    fs.writeFileSync(path, Buffer.from(await response.arrayBuffer()));
  }
  const actual = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path))
    .digest("hex");
  if (actual !== expected)
    throw new Error(
      `Source changed: ${file}. Review its contents and update the pinned hash before regenerating.`,
    );
}
const key = (value) => value.replace(/[\uFE0E\uFE0F]/g, "");
const decode = (value) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
    if (entity[0] === "#")
      return String.fromCodePoint(
        parseInt(
          entity.slice(entity[1] === "x" ? 2 : 1),
          entity[1] === "x" ? 16 : 10,
        ),
      );
    return { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" }[entity];
  });
const annotations = new Map();
for (const file of ["en.xml", "en-derived.xml"]) {
  const xml = fs.readFileSync(`${source}/${file}`, "utf8");
  for (const match of xml.matchAll(
    /<annotation\s+([^>]+)>([^<]*)<\/annotation>/g,
  )) {
    const cp = match[1].match(/\bcp="([^"]+)"/)?.[1];
    if (!cp) continue;
    const id = key(decode(cp));
    const entry = annotations.get(id) ?? { label: "", keywords: [] };
    const value = decode(match[2]).trim();
    if (/\btype="tts"/.test(match[1])) entry.label = value;
    else entry.keywords.push(...value.split(/\s*\|\s*/));
    annotations.set(id, entry);
  }
}
const categories = {
  "Smileys & Emotion": "smileys",
  "People & Body": "people",
  "Animals & Nature": "animals",
  "Food & Drink": "food",
  "Travel & Places": "travel",
  Activities: "activities",
  Objects: "objects",
  Symbols: "symbols",
  Flags: "flags",
};
const aliases = {
  "✅": [
    "done",
    "finished",
    "ready",
    "complete",
    "checked",
    "checkmark",
    "approved",
    "success",
  ],
  "🟪": ["wip", "working", "started", "progress", "in progress", "purple"],
  "❌": [
    "todo",
    "unstarted",
    "pending",
    "not started",
    "cancelled",
    "rejected",
    "cross",
  ],
  "🚧": [
    "construction",
    "building",
    "development",
    "work in progress",
    "blocked",
  ],
  "⏸️": ["paused", "pause", "waiting", "on hold", "suspended"],
  "🎮": ["game", "games", "gaming", "gameplay", "controller"],
  "🌍": ["world", "earth", "planet", "map", "geography"],
  "🌱": [
    "nature",
    "garden",
    "gardening",
    "farming",
    "growth",
    "plant",
    "seedling",
  ],
  "🏡": ["home", "house", "housing", "property", "homestead"],
  "⚙️": [
    "settings",
    "mechanics",
    "system",
    "systems",
    "configuration",
    "options",
    "gear",
  ],
  "🧰": ["tools", "toolkit", "maintenance", "workshop", "repair"],
  "📝": [
    "note",
    "notes",
    "document",
    "documentation",
    "writing",
    "draft",
    "memo",
  ],
  "📚": [
    "reference",
    "books",
    "library",
    "knowledge",
    "wiki",
    "manual",
    "bible",
  ],
  "💡": ["idea", "ideas", "inspiration", "thinking", "brainstorm", "lightbulb"],
  "📌": ["pinned", "pin", "bookmark", "important", "priority"],
  "🎯": ["goal", "goals", "target", "objective", "mission", "aim"],
  "🐾": ["animals", "pets", "wildlife", "creatures", "tracks"],
  "👥": ["community", "people", "npc", "npcs", "characters", "social", "team"],
  "🔨": ["building", "construction", "crafting", "work", "hammer"],
  "🎨": ["art", "arts", "design", "painting", "artist", "palette"],
  "⭐": [
    "favorite",
    "favourite",
    "favorites",
    "favourites",
    "star",
    "featured",
  ],
  "🔥": ["fire", "hot", "burning", "flame", "firemaking"],
  "🌊": ["water", "ocean", "sea", "wave", "waves"],
  "🍎": ["food", "fruit", "apple", "meal", "cooking"],
  "📦": ["inventory", "storage", "items", "package", "box", "delivery"],
  "⚠️": ["warning", "caution", "alert", "danger"],
  "☑️": ["checked", "checkmark", "done", "checkbox"],
  "✔️": ["checked", "checkmark", "done", "approved"],
  "🟢": ["ready", "active", "online", "green"],
  "🟡": ["waiting", "pending", "yellow"],
  "🔴": ["stopped", "error", "offline", "red"],
  "🚀": ["launch", "release", "ship", "deploy", "rocket"],
  "🐛": ["bug", "bugs", "issue", "debug", "debugging", "testing"],
  "💻": [
    "code",
    "coding",
    "programming",
    "computer",
    "software",
    "development",
  ],
  "🧑‍💻": ["developer", "programmer", "coding", "code", "software"],
  "👨‍💻": ["developer", "programmer", "coding", "code", "software"],
  "👩‍💻": ["developer", "programmer", "coding", "code", "software"],
  "🧑‍🔬": ["science", "scientist", "research", "experiment"],
  "🧪": ["science", "research", "experiment", "alchemy", "chemistry"],
  "🤖": ["robot", "ai", "automation", "bot", "artificial intelligence"],
  "🛠️": ["tools", "repair", "maintenance", "crafting"],
  "🏗️": ["building", "construction", "development"],
  "🧱": ["building", "construction", "wall", "bricks"],
  "🗺️": ["map", "world", "region", "navigation"],
  "🌳": ["tree", "forest", "forestry", "logging", "nature"],
  "🌾": ["farming", "crops", "harvest", "agriculture"],
  "🐟": ["fish", "fishing", "angler"],
  "⛏️": ["mining", "mine", "ore", "pickaxe"],
  "⚒️": ["mining", "smithing", "crafting", "forge"],
  "🪓": ["axe", "logging", "woodworking", "forestry"],
  "🧵": ["tailoring", "sewing", "crafting", "thread"],
  "💰": ["money", "currency", "economy", "finance", "trade"],
  "🏪": ["shop", "store", "merchant", "trade"],
  "🛡️": ["shield", "defense", "defence", "combat", "protection"],
  "⚔️": ["swords", "combat", "battle", "weapons"],
  "🗡️": ["dagger", "sword", "weapon", "combat"],
  "🐉": ["dragon", "fantasy", "creature", "monster"],
  "🧙": ["wizard", "magic", "mage", "fantasy"],
  "❤️": ["heart", "love", "health", "hp", "hit points"],
  "💜": ["heart", "love", "purple"],
  "👍": ["thumbsup", "thumbs up", "like", "approve", "approved", "yes"],
  "👎": ["thumbsdown", "thumbs down", "dislike", "reject", "no"],
  "😄": ["smile", "happy", "smiling", "grin"],
  "🙂": ["smile", "happy", "smiling"],
  "😀": ["smile", "happy", "smiling", "grin"],
  "😂": ["lol", "laugh", "laughing", "funny"],
  "🔍": ["search", "find", "inspect", "investigate"],
  "🔎": ["search", "find", "inspect", "investigate"],
  "🕒": ["time", "schedule", "clock"],
  "🗓️": ["calendar", "date", "schedule", "planning"],
  "🏳️‍🌈": ["pride", "lgbt", "lgbtq", "rainbow"],
  "🏳️‍⚧️": ["pride", "trans", "transgender"],
  "🇺🇸": ["usa", "us", "america", "american", "united states"],
  "🇬🇧": ["uk", "britain", "british", "united kingdom"],
  "🇹🇷": ["turkey", "turkiye"],
};
const aliasByKey = new Map(
  Object.entries(aliases).map(([emoji, words]) => [key(emoji), words]),
);
const rows = [];
let group = "",
  subgroup = "";
for (const line of fs
  .readFileSync(`${source}/emoji-test.txt`, "utf8")
  .split(/\r?\n/)) {
  if (line.startsWith("# group: ")) group = line.slice(9);
  if (line.startsWith("# subgroup: ")) subgroup = line.slice(12);
  const match = line.match(
    /^([\dA-F ]+);\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/,
  );
  if (!match) continue;
  const emoji = String.fromCodePoint(
    ...match[1]
      .trim()
      .split(/\s+/)
      .map((hex) => parseInt(hex, 16)),
  );
  const entry = annotations.get(key(emoji));
  const rawLabel = entry?.label || match[3];
  const label = rawLabel[0].toLocaleUpperCase("en") + rawLabel.slice(1);
  const base = key(emoji.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, ""));
  const keywords = [
    ...new Set([
      match[3],
      ...(entry?.keywords || []),
      subgroup.replaceAll("-", " "),
      ...(aliasByKey.get(key(emoji)) || []),
      ...(base !== key(emoji) ? aliasByKey.get(base) || [] : []),
    ]),
  ].filter(
    (word) => word.toLocaleLowerCase("en") !== label.toLocaleLowerCase("en"),
  );
  if (!categories[group]) throw new Error(`Unknown Unicode group: ${group}`);
  rows.push([emoji, label, categories[group], keywords]);
}
const model = fs.readFileSync("src/model.ts", "utf8");
const pattern = model.match(/const sectionEmojiPattern =\s*(\/[^\n]+\/u);/)[1];
const regex = new Function(`return ${pattern}`)();
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const excluded = rows.filter(
  ([emoji]) =>
    emoji.length > 32 ||
    !regex.test(emoji) ||
    [...segmenter.segment(emoji)].length !== 1,
);
const valid = rows.filter((row) => !excluded.includes(row));
fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync(
  "src/data/emoji.json",
  "[\n" + valid.map((row) => JSON.stringify(row)).join(",\n") + "\n]\n",
);
fs.writeFileSync(
  `${source}/manifest.json`,
  JSON.stringify(
    {
      version: "15.1",
      sourceCount: rows.length,
      validCount: valid.length,
      excluded,
      bytes: fs.statSync("src/data/emoji.json").size,
      inputs: ["emoji-test.txt", "en.xml", "en-derived.xml"].map((file) => ({
        file,
        sha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(`${source}/${file}`))
          .digest("hex"),
      })),
    },
    null,
    2,
  ),
);
console.log(fs.readFileSync(`${source}/manifest.json`, "utf8"));
