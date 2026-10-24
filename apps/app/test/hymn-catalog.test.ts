import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { expect, it } from "vitest";

const file = path.resolve(
  __dirname,
  "../../../packages/content/data/hymns.json",
);
it("shares the existing three bundled hymn recordings and their exact media identity with the server", () => {
  expect(existsSync(file), "canonical shared hymn catalog exists").toBe(true);
  const catalog = JSON.parse(readFileSync(file, "utf8")) as {
    revision: number;
    items: {
      id: string;
      enabled: boolean;
      titleZh: string;
      titleEn: string;
      duration: number;
      audioPath: string;
    }[];
  };
  expect(catalog.revision).toBeGreaterThanOrEqual(0);
  expect(catalog.items.map((item) => item.id)).toEqual([
    "amazing-grace",
    "be-thou-my-vision",
    "doxology",
  ]);
  for (const item of catalog.items) {
    const audio = readFileSync(
      path.resolve(__dirname, `../assets/audio/${item.id}.mp3`),
    );
    expect(item.audioPath).toBe(
      `/api/audio/resources/${createHash("sha256").update(audio).digest("hex")}.mp3`,
    );
    expect(item.titleZh.trim()).not.toBe("");
    expect(item.titleEn.trim()).not.toBe("");
    expect(item.duration).toBeGreaterThan(0);
    expect(typeof item.enabled).toBe("boolean");
  }
});
