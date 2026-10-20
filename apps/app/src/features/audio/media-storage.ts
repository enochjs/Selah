import { Directory, File, Paths } from "expo-file-system";
import type { DocumentPickerAsset } from "expo-document-picker";

export async function saveAudio(
  asset: DocumentPickerAsset,
  id: string,
): Promise<string> {
  const directory = new Directory(Paths.document, "selah-audio");
  directory.create({ idempotent: true, intermediates: true });
  const extension =
    asset.name
      .split(".")
      .pop()
      ?.replace(/[^a-zA-Z0-9]/g, "") || "mp3";
  const destination = new File(directory, `${id}.${extension}`);
  await new File(asset.uri).copy(destination);
  return destination.uri;
}
export async function audioUri(uri: string): Promise<string> {
  return uri;
}
export async function deleteAudio(uri: string): Promise<void> {
  const file = new File(uri);
  if (file.exists) await file.delete();
}
