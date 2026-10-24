import { expect,it } from "vitest";
import recordings from "@selah/content/chapter-audio.json";
import { offlineChapters,parseDownloadManifest } from "../src/data/offline-catalog";
import type { ChapterRecording } from "../src/domain/models";
const catalog=recordings as unknown as Record<string,ChapterRecording>;
const paths=[...new Set(Object.values(catalog).flatMap((recording)=>[recording.path,...(recording.verseFiles??[]).map((verse)=>verse.path)]))];
const manifest={version:1 as const,recordings:catalog,files:paths.map((path)=>({path,size:100,sha256:path.split("/").pop()!.slice(0,-4)}))};
it("selects all 1189 chapters and old/new testament ranges independently for each narration",()=>{
  expect(offlineChapters({kind:"all"},"en",manifest)).toHaveLength(1189);
  expect(offlineChapters({kind:"old"},"zh",manifest)).toHaveLength(929);
  expect(offlineChapters({kind:"new"},"zh",manifest)).toHaveLength(260);
  expect(offlineChapters({kind:"book",bookId:"psalms"},"en",manifest)).toHaveLength(150);
});
it("preserves the server's downloaded timing snapshot and all files needed for verse loops",()=>{
  const item=offlineChapters({kind:"chapter",bookId:"psalms",chapter:23},"en",manifest)[0];
  expect(item.recording).toEqual(catalog["psalms:23:en"]);
  expect(item.files.map((file)=>file.path)).toContain(item.recording.path);
  for(const verse of item.recording.verseFiles??[]) expect(item.files.map((file)=>file.path)).toContain(verse.path);
  expect(()=>offlineChapters({kind:"chapter",bookId:"psalms",chapter:23},"en",{...manifest,recordings:{}})).toThrow("unavailable");
});
it("rejects unsafe paths, mismatched content hashes and incomplete scope resources",()=>{
  expect(()=>parseDownloadManifest({version:1,files:[{path:"https://example.test/audio.mp3",sha256:"a".repeat(64),size:10}]})).toThrow();
  expect(()=>parseDownloadManifest({version:1,files:[{path:"/api/audio/resources/"+"a".repeat(64)+".mp3",sha256:"b".repeat(64),size:10}]})).toThrow();
  expect(()=>offlineChapters({kind:"all"},"en",{...manifest,files:[]})).toThrow("unavailable");
});
