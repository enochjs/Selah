import { expect, it } from "vitest";
import { bibleRepository } from "../src/data/bible-repository";
import {
  comparisonVersions,
  resolveComparisonVersion,
  versionText,
} from "../src/data/reading-versions";

it("reads the bundled Thai KJV against either primary language", () => {
  const verse = bibleRepository.getChapter("genesis", 1)[0];
  for (const locale of ["en", "zh"] as const) {
    expect(comparisonVersions(locale).map((version) => version.id)).toContain(
      "tha-kjv",
    );
    expect(
      versionText(verse, resolveComparisonVersion(locale, "tha-kjv")),
    ).toBe("ในเริ่มแรกนั้นพระเจ้าทรงเนรมิตสร้างฟ้าและแผ่นดินโลก");
    expect(resolveComparisonVersion(locale).language).toBe(
      locale === "en" ? "zh" : "en",
    );
  }
});

it("includes John 7:53 in the parallel row where the NIV places it", () => {
  const thai = resolveComparisonVersion("en", "tha-kjv");
  const john7 = bibleRepository.getChapter("john", 7);
  expect(john7.at(-1)?.number).toBe(52);
  expect(versionText(john7.at(-1)!, thai).split("\n").at(-1)).toBe(
    "ต่างคนต่างกลับไปบ้านของตน",
  );
  expect(
    versionText(bibleRepository.getChapter("john", 8)[0], thai),
  ).not.toContain("ต่างคนต่างกลับไปบ้านของตน");
});

it("keeps Thai vowels attached to their letters in the reading text", () => {
  const thai = resolveComparisonVersion("zh", "tha-kjv");
  const verse = bibleRepository.getChapter("psalms", 23)[1];
  const text = versionText(verse, thai);
  expect(text).toContain("ทุ่งหญ้า");
  expect(text).not.toContain("\u200b");
});

it("does not line up the following Thai verse against an extra parallel row", () => {
  const thai = resolveComparisonVersion("zh", "tha-kjv");
  const lastRow = bibleRepository.getChapter("3-john", 1).at(-1)!;
  expect(lastRow.number).toBe(15);
  expect(versionText(lastRow, thai)).toBe("");
  expect(
    versionText(bibleRepository.getChapter("1-chronicles", 22)[0], thai),
  ).toMatch(/อิสราเอล/);
});
