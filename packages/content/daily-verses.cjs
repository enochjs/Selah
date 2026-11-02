"use strict";
const fail = (message) => {
  throw new TypeError("Invalid daily verse catalog: " + message);
};
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 2000;
const integer = (v, min, max) =>
  Number.isSafeInteger(v) && v >= min && v <= max;
const https = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
function isDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  return (
    d <=
    [
      31,
      y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ][m - 1]
  );
}
function localDateKey(date = new Date()) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()))
    throw new TypeError("Invalid date");
  return (
    String(date.getFullYear()).padStart(4, "0") +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
}
function addDays(date, days) {
  if (!isDateKey(date) || !Number.isSafeInteger(days))
    throw new TypeError("Invalid civil date or day offset");
  const d = new Date(date + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  const result = d.toISOString().slice(0, 10);
  if (!isDateKey(result)) throw new RangeError("Date outside supported years");
  return result;
}
function parseDailyVerseCatalog(value) {
  if (
    !object(value) ||
    !integer(value.revision, 0, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(value.images) ||
    !Array.isArray(value.items)
  )
    fail("structure");
  if (
    Object.keys(value).some((k) => !["revision", "images", "items"].includes(k))
  )
    fail("unknown catalog field");
  const images = new Set(),
    ids = new Set(),
    dates = new Set();
  for (const image of value.images) {
    if (
      !object(image) ||
      Object.keys(image).some(
        (k) =>
          ![
            "id",
            "file",
            "sha256",
            "author",
            "sourceUrl",
            "license",
            "licenseUrl",
            "width",
            "height",
            "theme",
          ].includes(k),
      ) ||
      !/^([a-f0-9]{64})$/.test(image.id) ||
      image.sha256 !== image.id ||
      image.file !== image.id + ".jpg" ||
      images.has(image.id)
    )
      fail("image identity");
    if (
      !["author", "license", "theme"].every((k) => text(image[k])) ||
      !https(image.sourceUrl) ||
      !https(image.licenseUrl) ||
      !integer(image.width, 1, 30000) ||
      !integer(image.height, 1, 30000)
    )
      fail("image metadata");
    images.add(image.id);
  }
  for (const item of value.items) {
    if (
      !object(item) ||
      !text(item.id) ||
      !/^[a-zA-Z0-9_-]+$/.test(item.id) ||
      ids.has(item.id) ||
      !isDateKey(item.date) ||
      dates.has(item.date) ||
      !images.has(item.imageId) ||
      !text(item.theme) ||
      !["draft", "approved", "withdrawn"].includes(item.status)
    )
      fail("entry metadata");
    const r = item.reference;
    if (
      !object(r) ||
      !text(r.bookId) ||
      !/^[a-z0-9-]+$/.test(r.bookId) ||
      !integer(r.chapter, 1, 150) ||
      !integer(r.verse, 1, 176) ||
      (r.endVerse !== undefined && !integer(r.endVerse, r.verse, 176))
    )
      fail("reference");
    if (
      item.reviewedAt !== undefined &&
      (!text(item.reviewedAt) || !Number.isFinite(Date.parse(item.reviewedAt)))
    )
      fail("review timestamp");
    if (item.reviewedBy !== undefined && !text(item.reviewedBy))
      fail("reviewer");
    if (
      Object.keys(item).some(
        (k) =>
          ![
            "id",
            "date",
            "reference",
            "imageId",
            "theme",
            "status",
            "reviewedAt",
            "reviewedBy",
          ].includes(k),
      ) ||
      Object.keys(r).some(
        (k) => !["bookId", "chapter", "verse", "endVerse"].includes(k),
      )
    )
      fail("unknown entry field");
    ids.add(item.id);
    dates.add(item.date);
  }
  return JSON.parse(JSON.stringify(value));
}
function selectDailyVerse(catalog, date) {
  if (!isDateKey(date)) throw new TypeError("Invalid date");
  let entry = null;
  for (const item of catalog.items)
    if (
      item.status === "approved" &&
      item.date <= date &&
      (!entry || item.date > entry.date)
    )
      entry = item;
  return { entry, stale: entry !== null && entry.date !== date };
}
function publishedDailyVerseCatalog(catalog) {
  const items = catalog.items
    .filter((i) => i.status === "approved")
    .map(({ reviewedBy, ...i }) => i);
  const used = new Set(items.map((i) => i.imageId));
  return {
    revision: catalog.revision,
    items,
    images: catalog.images.filter((i) => used.has(i.id)),
  };
}
module.exports = {
  isDateKey,
  localDateKey,
  addDays,
  parseDailyVerseCatalog,
  selectDailyVerse,
  publishedDailyVerseCatalog,
};
