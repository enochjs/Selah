import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import { Converter } from "opencc-js/t2cn";

const inputs = process.argv.slice(2);
const sources = [
  "https://kaikki.org/zhwiktionary/泰語/",
  "https://kaikki.org/zhwiktionary/泰语/",
];
if (inputs.length !== sources.length)
  throw new Error(
    "Provide the Kaikki 泰語 and 泰语 JSONL snapshots in that order",
  );
const archives = await Promise.all(inputs.map((file) => readFile(file)));
const simplify = Converter({ from: "t", to: "cn" });
const words = new Map();
for (const line of archives
  .map((archive) => archive.toString("utf8"))
  .join("\n")
  .split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line);
  if (row.lang_code !== "th" || typeof row.word !== "string") continue;
  const head = row.word.normalize("NFC");
  if (!/^[\p{L}\p{M}]+$/u.test(head)) continue;
  const partOfSpeech = simplify(row.pos_title ?? "");
  const glosses = (row.senses ?? [])
    .flatMap(({ glosses }) => glosses ?? [])
    .filter((gloss) => /\p{Script=Han}/u.test(gloss))
    .map((gloss) => simplify(gloss.trim()));
  if (!glosses.length) continue;
  const entry = words.get(head) ?? {
    meanings: new Set(),
    parts: new Set(),
    ipa: "",
  };
  entry.ipa ||= row.sounds?.find((sound) => sound.ipa)?.ipa ?? "";
  if (partOfSpeech) entry.parts.add(partOfSpeech);
  for (const gloss of glosses) {
    if (entry.meanings.size >= 6) break;
    entry.meanings.add(partOfSpeech ? `${partOfSpeech}：${gloss}` : gloss);
  }
  words.set(head, entry);
}
const entries = Object.fromEntries(
  [...words]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([word, entry]) => [
      word,
      [[...entry.meanings].join("\n"), entry.ipa, [...entry.parts].join("、")],
    ]),
);
if (!entries["แห่ง"] || words.size < 1000)
  throw new Error("Incomplete Thai dictionary");
const data = new URL("../../packages/content/data/", import.meta.url);
const temporary = new URL("thai-dictionary-zh.json.tmp", data);
await writeFile(
  temporary,
  JSON.stringify({
    source: "https://zh.wiktionary.org/",
    archives: archives.map((archive, index) => ({
      url: sources[index],
      sha256: createHash("sha256").update(archive).digest("hex"),
    })),
    license: "https://creativecommons.org/licenses/by-sa/4.0/",
    entries,
  }) + "\n",
);
await rename(temporary, new URL("thai-dictionary-zh.json", data));
console.log(`Imported ${words.size} Thai headwords with Chinese definitions`);
