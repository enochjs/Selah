import type { MediaFile, MediaRequest, MediaResponsePlan } from "./media.types";

export const immutableMedia = "public, max-age=31536000, immutable";

export function mediaResponse(
  file: MediaFile,
  request: MediaRequest,
  contentType: string,
  cacheControl: string,
): MediaResponsePlan {
  const etag = `"${file.size.toString(16)}-${Math.trunc(file.mtimeMs).toString(16)}"`;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": file.mtime.toUTCString(),
    "Cache-Control": cacheControl,
  };
  if (request.ifNoneMatch === etag) return { status: 304, headers };
  let start = 0;
  let end = file.size - 1;
  let partial = false;
  const { range, ifRange } = request;
  if (
    range &&
    (!ifRange || ifRange === etag || ifRange === file.mtime.toUTCString())
  ) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    const invalidRange = (): MediaResponsePlan => ({
      status: 416,
      headers: { ...headers, "Content-Range": `bytes */${file.size}` },
    });
    if (!match || (!match[1] && !match[2])) return invalidRange();
    if (!match[1]) start = Math.max(0, file.size - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= file.size
    )
      return invalidRange();
    partial = true;
    headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
  }
  headers["Content-Length"] = String(Math.max(0, end - start + 1));
  return {
    status: partial ? 206 : 200,
    headers,
    ...(!request.head && file.size
      ? { stream: () => file.stream(start, end) }
      : {}),
  };
}
