import { describe, expect, it } from "vite-plus/test";

import { resolveManifestLocale } from "./manifest[.]webmanifest";

describe("manifest locale resolution", () => {
  it("uses a supported query locale before request preferences", () => {
    const request = new Request("https://voidmix.invalid/manifest.webmanifest?locale=zh");
    const headers = new Headers({
      cookie: "locale=en",
      "accept-language": "en-US",
    });

    expect(resolveManifestLocale(request, headers)).toBe("zh");
  });

  it("falls back to the request locale when the query is missing or unsupported", () => {
    const headers = new Headers({ "accept-language": "zh-CN, en;q=0.8" });

    expect(
      resolveManifestLocale(new Request("https://voidmix.invalid/manifest.webmanifest"), headers),
    ).toBe("zh");
    expect(
      resolveManifestLocale(
        new Request("https://voidmix.invalid/manifest.webmanifest?locale=fr"),
        headers,
      ),
    ).toBe("zh");
  });
});
