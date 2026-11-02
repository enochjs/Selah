import { Asset } from "expo-asset";
import type { DailyVerseImage } from "@selah/content/daily-verses";
import { bundledDailyVerseImages } from "./daily-verse-images";
import { resourceUrl } from "../config/resources";
import { verifyDailyVerseImage } from "./daily-verse-image-bytes";

const cacheName = "selah-daily-verses-v1";
const objectUrls = new Map<string, string>();
const key = (image: DailyVerseImage) =>
  new URL(`/__selah_daily__/${image.file}`, location.origin).href;
async function hash(bytes: Uint8Array) {
  const result = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return [...new Uint8Array(result)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
function uri(image: DailyVerseImage, bytes: Uint8Array) {
  let url = objectUrls.get(image.id);
  if (!url) {
    url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
    );
    objectUrls.set(image.id, url);
  }
  return url;
}
async function store(image: DailyVerseImage, bytes: Uint8Array) {
  await verifyDailyVerseImage(image, bytes, hash);
  try {
    const cache = await caches.open(cacheName);
    await cache.put(
      key(image),
      new Response(new Uint8Array(bytes), {
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  } catch {
    /* Current content remains readable when browser storage is full. */
  }
  return uri(image, bytes);
}
export async function readDailyVerseImage(
  image: DailyVerseImage,
): Promise<string | null> {
  try {
    const cache = await caches.open(cacheName);
    const response = await cache.match(key(image));
    if (!response) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    try {
      await verifyDailyVerseImage(image, bytes, hash);
    } catch {
      await cache.delete(key(image));
      objectUrls.delete(image.id);
      return null;
    }
    return uri(image, bytes);
  } catch {
    return null;
  }
}
export async function bundledDailyVerseImage(
  image: DailyVerseImage,
): Promise<string | null> {
  const module = bundledDailyVerseImages[image.id];
  if (module === undefined) return null;
  const asset = Asset.fromModule(module);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Bundled image unavailable");
  return store(image, new Uint8Array(await response.arrayBuffer()));
}
export async function downloadDailyVerseImage(
  image: DailyVerseImage,
  signal: AbortSignal,
): Promise<string> {
  const url = resourceUrl(`/api/daily-verses/images/${image.file}`);
  if (!url) throw new Error("Daily image server unavailable");
  const response = await fetch(url, { signal, credentials: "omit" });
  if (!response.ok) throw new Error("Daily image unavailable");
  return store(image, new Uint8Array(await response.arrayBuffer()));
}
