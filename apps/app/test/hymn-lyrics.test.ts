import { expect, it } from "vitest";
import { activeLyricIndex, parseLyrics } from "../src/domain/lyrics";

it("parses LRC fractions, repeated choruses, translations and metadata without inventing timing", () => {
  const lyrics = parseLyrics(
    "[ti:Test]\n[ar:Choir]\n[00:12.50][01:02.005]First line\n[00:12.50]第一句\n[00:20]Second line\n[00:30.000]\n",
    90,
  );
  expect(lyrics).toEqual({
    timed: true,
    lines: [
      { time: 12.5, text: "First line\n第一句" },
      { time: 20, text: "Second line" },
      { time: 30, text: "" },
      { time: 62.005, text: "First line" },
    ],
  });
  expect(activeLyricIndex(lyrics.lines, 0)).toBe(-1);
  expect(activeLyricIndex(lyrics.lines, 12.5)).toBe(0);
  expect(activeLyricIndex(lyrics.lines, 29.99)).toBe(1);
  expect(activeLyricIndex(lyrics.lines, 30)).toBe(2);
  expect(activeLyricIndex(lyrics.lines, 80)).toBe(3);
  expect(activeLyricIndex(lyrics.lines, 15)).toBe(0);
});

it("applies a millisecond LRC offset and sorts unsorted lines", () => {
  expect(
    parseLyrics("[00:10]Later\n[00:01]Start\n[offset:500]", 20).lines,
  ).toEqual([
    { time: 0.5, text: "Start" },
    { time: 9.5, text: "Later" },
  ]);
});

it("keeps plain lyrics readable and never makes them seekable", () => {
  const lyrics = parseLyrics("[ti:Song]\nFirst line\r\nSecond line", 50);
  expect(lyrics).toEqual({
    timed: false,
    lines: [{ text: "First line" }, { text: "Second line" }],
  });
  expect(activeLyricIndex(lyrics.lines, 20)).toBe(-1);
  expect(parseLyrics(undefined, 50).lines).toEqual([]);
  expect(parseLyrics("[ti:Song]\n[ar:Artist]", 50).lines).toEqual([]);
});

it("does not offer invalid or out-of-recording timestamps as jump targets", () => {
  expect(parseLyrics("[00:60]Invalid\n[99:00]Past end", 40).timed).toBe(false);
  const lyrics = parseLyrics("[00:05]Valid\n[00:50]Past end", 40);
  expect(lyrics.lines).toEqual([{ time: 5, text: "Valid" }]);
  expect(activeLyricIndex(lyrics.lines, Number.NaN)).toBe(-1);
});
