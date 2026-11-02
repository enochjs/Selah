import type { DailyVerseImage } from "@selah/content/daily-verses";

/** Check cached and downloaded bytes identically before making them visible. */
export async function verifyDailyVerseImage(
  image: DailyVerseImage,
  bytes: Uint8Array,
  sha256: (bytes: Uint8Array) => Promise<string>,
): Promise<void> {
  if (
    bytes.length < 4 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    (await sha256(bytes)) !== image.sha256
  )
    throw new Error("Daily image integrity check failed");
}
