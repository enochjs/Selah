import { execFile } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";

const run = promisify(execFile);
const content = new URL("../../packages/content/data/", import.meta.url);
async function synthesize(word, file, wasm, compiled) {
  const args = ["-v", "th", "-s", "145", "-w", file, word];
  if (!wasm) {
    await run("espeak-ng", args);
    return;
  }
  const engine = await wasm.default({
    arguments: ["-v", "th", "-s", "145", "-w", "clip.wav", word],
    instantiateWasm(imports, ready) {
      const instance = new WebAssembly.Instance(compiled, imports);
      ready(instance, compiled);
      return instance.exports;
    },
  });
  await writeFile(file, engine.FS.readFile("clip.wav"));
}
async function generateClips(words, wasmPath) {
  const wasm = wasmPath ? await import(pathToFileURL(wasmPath)) : undefined;
  const compiled = wasmPath
    ? await WebAssembly.compile(
        await readFile(new URL("espeak-ng.wasm", pathToFileURL(wasmPath))),
      )
    : undefined;
  const directory = await mkdtemp(join(tmpdir(), "selah-thai-pronunciation-"));
  const audio = [];
  try {
    for (let index = 0; index < words.length; index += 4) {
      const entries = await Promise.all(
        words.slice(index, index + 4).map(async (word, slot) => {
          const wav = join(directory, `${slot}.wav`);
          const clip = join(directory, `${slot}.m4a`);
          await synthesize(word, wav, wasm, compiled);
          await run("ffmpeg", [
            "-loglevel",
            "error",
            "-y",
            "-i",
            wav,
            "-map_metadata",
            "-1",
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "aac",
            "-b:a",
            "20k",
            "-movflags",
            "+faststart",
            clip,
          ]);
          return [word, (await readFile(clip)).toString("base64")];
        }),
      );
      audio.push(...entries);
    }
    return audio;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (!isMainThread) {
  parentPort.postMessage(
    await generateClips(workerData.words, workerData.wasmPath),
  );
} else {
  const { books } = JSON.parse(
    await readFile(new URL("thai-kjv.json", content)),
  );
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  const words = new Set();
  for (const book of Object.values(books))
    for (const chapter of book)
      for (const verse of Object.values(chapter))
        for (const part of segmenter.segment(verse.replaceAll("\u200b", "")))
          if (part.isWordLike && /^[\p{L}\p{M}]+$/u.test(part.segment))
            words.add(part.segment.normalize("NFC"));

  const sorted = [...words].sort();
  const wasmPath = process.argv[2];
  const version = wasmPath
    ? "eSpeak NG (espeak-ng.js 1.0.2)"
    : (await run("espeak-ng", ["--version"])).stdout
        .trim()
        .split(" Data at:")[0];
  const batchSize = Math.ceil(sorted.length / 5);
  const batches = await Promise.all(
    Array.from(
      { length: 5 },
      (_, part) =>
        new Promise((resolve, reject) => {
          const batch = sorted.slice(part * batchSize, (part + 1) * batchSize);
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { words: batch, wasmPath },
          });
          worker.once("message", (entries) => {
            console.log(`Encoded ${entries.length} Thai pronunciation clips`);
            resolve(entries);
          });
          worker.once("error", reject);
          worker.once("exit", (code) => {
            if (code)
              reject(new Error(`Audio generation worker exited with ${code}`));
          });
        }),
    ),
  );
  const temporary = new URL("thai-pronunciations.json.tmp", content);
  const output = new URL("thai-pronunciations.json", content);
  await writeFile(
    temporary,
    JSON.stringify({
      engine: version,
      source: "https://github.com/espeak-ng/espeak-ng",
      format: "audio/mp4",
      audio: Object.fromEntries(batches.flat()),
    }) + "\n",
  );
  await rename(temporary, output);
  console.log(`Saved ${sorted.length} Thai pronunciation clips`);
}
