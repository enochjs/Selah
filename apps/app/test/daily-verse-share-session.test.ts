import { expect, it } from "vitest";
import type { DailyVerseCatalog } from "@selah/content/daily-verses";
import {
  captureDailyShare,
  resolveDailyShare,
} from "../src/domain/daily-verse-share-session";
import type { DailyVerseSharePayload } from "../src/domain/daily-verse-sharing";
const catalog: DailyVerseCatalog = {
  revision: 1,
  images: [
    {
      id: "photo",
      sha256: "a".repeat(64),
      file: "photo.jpg",
      author: "A",
      sourceUrl: "https://example.com",
      license: "CC0",
      licenseUrl: "https://example.com/license",
      width: 100,
      height: 100,
      theme: "peace",
    },
  ],
  items: [
    {
      id: "daily",
      date: "2026-11-02",
      imageId: "photo",
      reference: { bookId: "psalms", chapter: 1, verse: 1 },
      status: "approved",
      theme: "peace",
    },
  ],
};
const payload = { date: "2026-11-02" } as DailyVerseSharePayload;
it("removes open and pending archive payloads when withdrawn or replaced", () => {
  const session = captureDailyShare(payload, catalog);
  expect(resolveDailyShare(session, catalog)).toBe(payload);
  expect(
    resolveDailyShare(session, { ...catalog, revision: 2, items: [] }),
  ).toBeNull();
  expect(
    resolveDailyShare(session, {
      ...catalog,
      revision: 2,
      items: [
        {
          ...catalog.items[0],
          reference: { bookId: "john", chapter: 1, verse: 1 },
        },
      ],
    }),
  ).toBeNull();
  expect(
    resolveDailyShare(session, {
      ...catalog,
      revision: 2,
      images: [{ ...catalog.images[0], author: "Changed" }],
    }),
  ).toBeNull();
  expect(resolveDailyShare(session, { ...catalog, revision: 2 })).toBe(payload);
});
