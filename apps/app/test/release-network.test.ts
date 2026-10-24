import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, expect, it, vi } from "vitest";
import { compileModsAsync } from "@expo/config-plugins";
import withLocalAudioService from "../plugins/with-local-audio-service";

afterEach(() => vi.unstubAllEnvs());

async function releasePolicy(serverUrl: string) {
  vi.stubEnv("EXPO_PUBLIC_BIBLE_SERVER_URL", serverUrl);
  const root = await mkdtemp(join(tmpdir(), "selah-release-policy-"));
  try {
    const config = withLocalAudioService({ name: "Selah", slug: "selah" });
    await compileModsAsync(config, {
      projectRoot: root,
      platforms: ["android"],
    });
    return await readFile(
      join(
        root,
        "android/app/src/release/res/xml/local_audio_network_security.xml",
      ),
      "utf8",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

it.each(["10.10.0.216", "106.14.219.191"])(
  "allows HTTP only for the configured release audio server %s",
  async (host) => {
    const xml = await releasePolicy(`http://${host}:8890`);
    expect(xml).toContain('<base-config cleartextTrafficPermitted="false"');
    const domains = [...xml.matchAll(/<domain [^>]*>([^<]+)<\/domain>/g)].map(
      (match) => match[1],
    );
    expect(domains).toEqual([host]);
    expect(xml).toContain('includeSubdomains="false"');
  },
);

it("keeps HTTP blocked when the release service uses HTTPS", async () => {
  const xml = await releasePolicy("https://audio.example.test");
  expect(xml).not.toContain('cleartextTrafficPermitted="true"');
  expect(xml).not.toContain("<domain ");
});

it("rejects unsupported release service protocols", async () => {
  await expect(releasePolicy("file:///audio")).rejects.toThrow(/HTTP|HTTPS/);
});
