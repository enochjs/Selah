import type { DailyVerseCatalog } from "@selah/content/daily-verses";
import type { DailyVerseSharePayload } from "./daily-verse-sharing";
export interface DailyShareSession {
  payload: DailyVerseSharePayload;
  publication: string;
}
function publication(
  payload: DailyVerseSharePayload,
  catalog: DailyVerseCatalog,
) {
  const entry = catalog.items.find(
    (item) => item.date === payload.date && item.status === "approved",
  );
  const image = catalog.images.find((image) => image.id === entry?.imageId);
  return entry && image ? JSON.stringify([entry, image]) : "";
}
export function captureDailyShare(
  payload: DailyVerseSharePayload,
  catalog: DailyVerseCatalog,
): DailyShareSession {
  return { payload, publication: publication(payload, catalog) };
}
export function resolveDailyShare(
  session: DailyShareSession | null,
  catalog: DailyVerseCatalog,
): DailyVerseSharePayload | null {
  return session?.publication &&
    session.publication === publication(session.payload, catalog)
    ? session.payload
    : null;
}
