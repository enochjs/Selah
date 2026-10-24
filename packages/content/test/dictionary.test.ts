import { expect, it } from "vitest";
import entries from "../data/dictionary-offline.json";
import forms from "../data/dictionary-forms.json";
import license from "../data/dictionary-license.json";

it("ships a compact licensed Chinese dictionary with resolvable word forms", () => {
  expect(Object.keys(entries).length).toBe(license.entries);
  expect(Object.keys(forms).length).toBe(license.forms);
  expect(license.entries).toBeGreaterThan(40000);
  expect(license.license).toBe("MIT");
  expect(license.licenseText).toContain("Permission is hereby granted");
  expect(license.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(license.gitBlob).toMatch(/^[a-f0-9]{40}$/);
  const dictionary: Record<string, string[]> = entries;
  for (const [word, row] of Object.entries(dictionary)) {
    expect(row).toHaveLength(3);
    expect(row[0], word).toMatch(/[\u3400-\u9fff]/);
  }
  for (const [word, lemma] of Object.entries(forms)) {
    expect(word).not.toBe(lemma);
    expect(Object.hasOwn(dictionary, lemma), `${word} → ${lemma}`).toBe(true);
  }
});
