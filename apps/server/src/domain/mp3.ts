/** Validate complete Layer III frames and derive duration from their sample counts. */
export function mp3Duration(bytes: Uint8Array): number | null {
  let offset = 0;
  if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    if (bytes.length < 10 || bytes.slice(6, 10).some((b) => b > 127))
      return null;
    offset =
      10 + bytes[6] * 0x200000 + bytes[7] * 0x4000 + bytes[8] * 128 + bytes[9];
    if (bytes[3] === 4 && bytes[5] & 16) offset += 10;
  }
  let duration = 0;
  let frames = 0;
  while (offset < bytes.length) {
    // ID3v1 may follow the last audio frame.
    if (
      bytes.length - offset === 128 &&
      bytes[offset] === 84 &&
      bytes[offset + 1] === 65 &&
      bytes[offset + 2] === 71
    )
      break;
    const a = bytes[offset],
      b = bytes[offset + 1],
      c = bytes[offset + 2];
    if (
      offset + 4 > bytes.length ||
      a !== 255 ||
      (b & 224) !== 224 ||
      (b & 24) === 8 ||
      (b & 6) !== 2 ||
      c >> 4 === 0 ||
      c >> 4 === 15 ||
      (c & 12) === 12
    )
      return null;
    const version = (b >> 3) & 3;
    const rates =
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
    const rate =
      [44100, 48000, 32000][(c >> 2) & 3] /
      (version === 3 ? 1 : version === 2 ? 2 : 4);
    const size =
      Math.floor(((version === 3 ? 144000 : 72000) * rates[c >> 4]) / rate) +
      ((c >> 1) & 1);
    if (offset + size > bytes.length) return null;
    duration += (version === 3 ? 1152 : 576) / rate;
    frames++;
    offset += size;
  }
  return frames >= 2 ? duration : null;
}
