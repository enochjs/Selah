/* Public download links always come from the published release catalog. */
(() => {
  "use strict";
  const pageUrl = "https://www.enochjs.top/#download";
  const byId = (id) => document.getElementById(id);
  const androidLink = byId("android-download");
  const browserDownload = byId("browser-download");
  const embeddedAndroid =
    /Android/i.test(navigator.userAgent) &&
    /MicroMessenger|QQ\//i.test(navigator.userAgent);
  const iosLink = byId("ios-download");
  const retry = byId("retry-release");
  let loading = false;

  async function releaseFor(platform, channel) {
    const query = new URLSearchParams({ platform, channel, buildNumber: "0" });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let result;
    try {
      const response = await fetch(`/api/app-updates?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Release service unavailable");
      result = await response.json();
    } finally {
      clearTimeout(timeout);
    }
    const release = result.release;
    if (release === null) return null;
    if (
      !release ||
      release.platform !== platform ||
      release.channel !== channel ||
      release.appId !== "app.selah.bible" ||
      !/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(release.version) ||
      !Number.isSafeInteger(release.buildNumber) ||
      release.buildNumber < 1 ||
      typeof release.publishedAt !== "string" ||
      !Number.isFinite(Date.parse(release.publishedAt))
    ) {
      throw new Error("Invalid published release");
    }
    return release;
  }

  async function loadAndroid() {
    androidLink.hidden = true;
    browserDownload.hidden = true;
    androidLink.removeAttribute("href");
    byId("release-details").hidden = true;
    retry.hidden = true;
    byId("release-status").textContent = "正在获取最新版本…";
    try {
      const release = await releaseFor("android", "direct");
      if (!release) {
        byId("release-status").textContent =
          "Android 安装包暂未开放下载，请稍后再来。";
        retry.hidden = false;
        return;
      }
      const artifact = release.artifact;
      if (
        !artifact ||
        !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        artifact.path !== `/api/app-updates/artifacts/${artifact.sha256}.apk` ||
        !Number.isSafeInteger(artifact.size) ||
        artifact.size < 1 ||
        artifact.size > 200 * 1024 * 1024 ||
        typeof release.notesZh !== "string"
      ) {
        throw new Error("Invalid APK metadata");
      }
      const date = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(release.publishedAt));
      byId("release-status").textContent =
        `v${release.version} · ${(artifact.size / 1024 / 1024).toFixed(1)} MB · ${date} 更新`;
      if (embeddedAndroid) {
        browserDownload.hidden = false;
      } else {
        androidLink.href = artifact.path;
        androidLink.hidden = false;
      }
      byId("release-notes").textContent = release.notesZh;
      byId("release-hash").textContent = artifact.sha256;
      byId("release-details").hidden = false;
    } catch {
      byId("release-status").textContent =
        "暂时无法获取安装包，请检查网络后重试。";
      retry.hidden = false;
    }
  }

  function officialIosUrl(release) {
    const url = new URL(release.storeUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    )
      throw new Error("Invalid store link");
    const valid =
      release.channel === "testflight"
        ? url.hostname === "testflight.apple.com" &&
          /^\/join\/[A-Za-z0-9]+$/.test(url.pathname)
        : url.hostname === "apps.apple.com" &&
          /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+$/.test(url.pathname);
    if (!valid) throw new Error("Invalid store link");
    return url.href;
  }

  async function loadIos() {
    iosLink.hidden = true;
    iosLink.removeAttribute("href");
    byId("ios-status").textContent = "正在查询发布状态…";
    const results = await Promise.allSettled([
      releaseFor("ios", "store"),
      releaseFor("ios", "testflight"),
    ]);
    const released = results.find(
      (result) => result.status === "fulfilled" && result.value,
    );
    if (released) {
      try {
        const release = released.value;
        iosLink.href = officialIosUrl(release);
        iosLink.hidden = false;
        byId("ios-status").textContent =
          `${release.channel === "testflight" ? "TestFlight" : "App Store"} · v${release.version}`;
        return;
      } catch {
        /* A malformed link must never become a download action. */
      }
    }
    const failed =
      results.some((result) => result.status === "rejected") ||
      Boolean(released);
    byId("ios-status").textContent = failed
      ? "暂时无法查询，请稍后重试"
      : "尚未开放下载";
    if (failed) retry.hidden = false;
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    retry.disabled = true;
    try {
      await Promise.all([loadAndroid(), loadIos()]);
    } finally {
      loading = false;
      retry.disabled = false;
    }
  }

  retry.addEventListener("click", refresh);
  browserDownload.addEventListener("click", async () => {
    const guide = byId("browser-tip");
    guide.hidden = false;
    guide.scrollIntoView({ block: "nearest" });
    guide.focus({ preventScroll: true });
    try {
      await navigator.clipboard.writeText(pageUrl);
      byId("browser-copy-status").textContent =
        "链接已复制。请打开手机浏览器，粘贴到地址栏后下载。";
    } catch {
      byId("browser-copy-status").textContent =
        `请长按复制此链接，到手机浏览器打开：${pageUrl}`;
    }
  });
  byId("copy-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      byId("copy-status").textContent = "链接已复制";
    } catch {
      byId("copy-status").textContent = `请复制：${pageUrl}`;
    }
  });
  byId("browser-tip").hidden = !embeddedAndroid;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refresh();
  });
  void refresh();
})();
