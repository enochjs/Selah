import { Directory, File, Paths } from "expo-file-system";
import { Asset } from "expo-asset";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import type { DailyVerseImage } from "@selah/content/daily-verses";
import { bundledDailyVerseImages } from "./daily-verse-images";
import { resourceUrl } from "../config/resources";
import { verifyDailyVerseImage } from "./daily-verse-image-bytes";

const directory = () => new Directory(Paths.document, "selah-daily-verses");
function fileFor(image: DailyVerseImage) {
  if (!/^[a-f0-9]{64}\.jpg$/.test(image.file))
    throw new Error("Invalid image file");
  return new File(directory(), image.file);
}
async function hash(bytes: Uint8Array) {
  const result = await digest(
    CryptoDigestAlgorithm.SHA256,
    new Uint8Array(bytes),
  );
  return [...new Uint8Array(result)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
async function store(image: DailyVerseImage, bytes: Uint8Array) {
  await verifyDailyVerseImage(image, bytes, hash);
  await directory().create({ idempotent: true, intermediates: true });
  const destination = fileFor(image);
  const temporary = new File(directory(), `${image.id}.part`);
  const temporaryUri = temporary.uri;
  try {
    await temporary.write(bytes);
    await temporary.move(destination, { overwrite: true });
    return destination.uri;
  } finally {
    // move() retargets the File instance to its destination. Clean only the
    // original partial path, never the completed JPEG it now points to.
    const unfinished = new File(temporaryUri);
    if (unfinished.exists) await unfinished.delete();
  }
}

export async function readDailyVerseImage(
  image: DailyVerseImage,
): Promise<string | null> {
  const file = fileFor(image);
  if (!file.exists) return null;
  try {
    await verifyDailyVerseImage(image, await file.bytes(), hash);
    return file.uri;
  } catch {
    try {
      await file.delete();
    } catch {
      /* A read-only damaged cache can be replaced later. */
    }
    return null;
  }
}
export async function bundledDailyVerseImage(
  image: DailyVerseImage,
): Promise<string | null> {
  const module = bundledDailyVerseImages[image.id];
  if (module === undefined) return null;
  const bundled = Asset.fromModule(module);
  // On Android Image-compatible asset URIs can be bare drawable names, even
  // when Expo marks them downloaded. Extract through ExpoAsset before File I/O.
  const local = bundled.localUri;
  const asset =
    local?.startsWith("file://") && !local.startsWith("file:///android_res/")
      ? bundled
      : await new Asset({
          name: bundled.name,
          type: bundled.type,
          hash: bundled.hash,
          uri: bundled.uri,
        }).downloadAsync();
  const uri = asset.localUri;
  if (!uri) return null;
  const bytes = await new File(uri).bytes();
  await verifyDailyVerseImage(image, bytes, hash);
  return store(image, bytes).catch(() => uri);
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
