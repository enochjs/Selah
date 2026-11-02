import {
  parseDailyVerseCatalog,
  publishedDailyVerseCatalog,
  type DailyVerseCatalog,
  type DailyVerseImage,
  type DailyVerseReference,
} from "@selah/content/daily-verses";
import { dailyPrefetchImages } from "../domain/daily-verse";

export interface DailyVersePort {
  readCatalog(): Promise<unknown>;
  writeCatalog(catalog: DailyVerseCatalog): Promise<void>;
  fetchCatalog(signal: AbortSignal): Promise<unknown>;
  readImage(image: DailyVerseImage): Promise<string | null>;
  bundledImage(image: DailyVerseImage): Promise<string | null>;
  downloadImage(image: DailyVerseImage, signal: AbortSignal): Promise<string>;
  validReference(reference: DailyVerseReference): boolean;
}
interface DailyVerseSnapshot {
  catalog: DailyVerseCatalog;
  images: Readonly<Record<string, string>>;
  online: boolean | null;
}

export function createDailyVerseCatalog(
  initial: DailyVerseCatalog,
  port: DailyVersePort,
) {
  let snapshot: DailyVerseSnapshot = {
    catalog: initial,
    images: {},
    online: null,
  };
  let hydration: Promise<void> | undefined;
  let refresh: Promise<void> | undefined;
  const pendingImages = new Map<string, Promise<string | null>>();
  const listeners = new Set<() => void>();
  function update(next: Partial<DailyVerseSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  }
  function parse(value: unknown) {
    const catalog = publishedDailyVerseCatalog(parseDailyVerseCatalog(value));
    if (!catalog.items.every((item) => port.validReference(item.reference)))
      throw new Error("Invalid scripture reference");
    return catalog;
  }
  function hydrate() {
    hydration ??= port
      .readCatalog()
      .then((value) => {
        if (value !== null && value !== undefined) {
          const catalog = parse(value);
          if (catalog.revision >= initial.revision) update({ catalog });
        }
      })
      .catch(() => {
        // A damaged or unavailable cache must not hide bundled content.
      });
    return hydration;
  }
  async function ensureImage(imageId: string): Promise<string | null> {
    const pending = pendingImages.get(imageId);
    if (pending) return pending;
    const image = snapshot.catalog.images.find((item) => item.id === imageId);
    if (!image) return null;
    const work = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const uri =
          (await port.readImage(image).catch(() => null)) ??
          (await port.bundledImage(image).catch(() => null)) ??
          (await port.downloadImage(image, controller.signal));
        // A withdrawal during download cannot put an image back into active content.
        if (snapshot.catalog.images.some((item) => item.id === imageId))
          update({ images: { ...snapshot.images, [imageId]: uri } });
        return uri;
      } catch {
        const images = { ...snapshot.images };
        delete images[imageId];
        update({ images });
        return null;
      } finally {
        clearTimeout(timer);
        pendingImages.delete(imageId);
      }
    })();
    pendingImages.set(imageId, work);
    return work;
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    ensureImage,
    refresh(today: string): Promise<void> {
      refresh ??= (async () => {
        await hydrate();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const catalog = parse(await port.fetchCatalog(controller.signal));
          const ids = new Set(catalog.images.map((image) => image.id));
          update({
            catalog,
            online: true,
            images: Object.fromEntries(
              Object.entries(snapshot.images).filter(([id]) => ids.has(id)),
            ),
          });
          await port.writeCatalog(catalog).catch(() => {});
        } catch {
          update({ online: false });
        } finally {
          clearTimeout(timer);
        }
        // The bundled copy already works offline. Prefetch new server images in
        // small batches so background preparation does not flood the connection.
        const images = dailyPrefetchImages(snapshot.catalog, today);
        for (let i = 0; i < images.length; i += 2)
          await Promise.all(
            images.slice(i, i + 2).map((image) => ensureImage(image.id)),
          );
      })().finally(() => {
        refresh = undefined;
      });
      return refresh;
    },
  };
}
