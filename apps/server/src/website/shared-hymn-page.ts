import type { Hymn } from "../domain/hymns";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function sharedHymnPage(
  hymn: Pick<Hymn, "titleZh" | "titleEn" | "artist" | "audioPath"> | undefined,
  english: boolean,
) {
  const unavailable = english
    ? "This hymn is unavailable"
    : "这首诗歌暂不可播放";
  const title = escapeHtml(
    (english ? hymn?.titleEn : hymn?.titleZh) ?? unavailable,
  );
  const artist = escapeHtml(hymn?.artist ?? "");
  const brand = english ? "Selah" : "Selah 息语";
  const description =
    artist ||
    (english ? "Listen to a hymn on Selah." : "在 Selah 息语聆听诗歌。");
  const playLabel = english ? "Play hymn" : "播放诗歌";
  const action = english ? "Get the Selah app" : "下载 Selah 息语";

  return `<!doctype html>
<html lang="${english ? "en" : "zh-CN"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title} · ${brand}</title>
    <meta property="og:title" content="${title} · ${brand}" />
    ${hymn ? `<meta property="og:description" content="${description}" />` : ""}
    <link rel="icon" href="/website/icon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/website/site.css" />
  </head>
  <body class="hymn-share-page">
    <main class="hymn-share-card">
      <a class="brand" href="/" aria-label="${brand}">
        <img src="/website/icon.svg" width="36" height="36" alt="" />
        <span>${brand}</span>
      </a>
      <h1>${title}</h1>
      ${artist ? `<p>${artist}</p>` : ""}
      ${hymn ? `<audio controls preload="none" src="${escapeHtml(hymn.audioPath)}" aria-label="${playLabel}"></audio>` : ""}
      <a class="text-link" href="/#download">${action}</a>
    </main>
  </body>
</html>`;
}
