const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");

/** Allow HTTP only for the configured audio host in release builds. */
module.exports = function withLocalAudioService(config) {
  const server = new URL(
    process.env.EXPO_PUBLIC_BIBLE_SERVER_URL || "http://127.0.0.1:8890",
  );
  if (!["http:", "https:"].includes(server.protocol)) {
    throw new Error("The audio service URL must use HTTP or HTTPS.");
  }
  const host = server.hostname.replace(/&/g, "&amp;");
  const httpException =
    server.protocol === "http:"
      ? `  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${host}</domain>
  </domain-config>\n`
      : "";
  return withDangerousMod(config, [
    "android",
    async (mod) => {
      const release = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/release",
      );
      const xml = path.join(release, "res/xml");
      await fs.mkdir(xml, { recursive: true });
      await fs.writeFile(
        path.join(release, "AndroidManifest.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:networkSecurityConfig="@xml/local_audio_network_security" />
</manifest>
`,
      );
      await fs.writeFile(
        path.join(xml, "local_audio_network_security.xml"),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
${httpException}</network-security-config>
`,
      );
      return mod;
    },
  ]);
};
