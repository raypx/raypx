import { describe, expect, it } from "vite-plus/test";
import { sessionCookie } from "../features/auth/account";
import { readRequestPreferences } from "../preferences";

describe("server request handling", () => {
  it("forwards only Better Auth cookies to the API", () => {
    expect(
      sessionCookie(
        "theme=dark; better-auth.session_token=abc; __Secure-better-auth.session_data=def; other=1",
      ),
    ).toBe("better-auth.session_token=abc; __Secure-better-auth.session_data=def");
    expect(sessionCookie("theme=dark; locale=zh")).toBe("");
    expect(sessionCookie(null)).toBe("");
  });
  it("reads device preferences from cookies and the browser language", () => {
    expect(
      readRequestPreferences(
        new Headers({ cookie: "theme=dark; locale=zh", "accept-language": "en-US,en;q=0.9" }),
      ),
    ).toEqual({ theme: "dark", locale: "zh", systemLocales: ["en-US", "en"] });
    expect(
      readRequestPreferences(
        new Headers({ cookie: "theme=sepia", "accept-language": "fr, zh-CN;q=0.8" }),
      ),
    ).toEqual({ theme: "system", locale: "system", systemLocales: ["fr", "zh-CN"] });
    expect(readRequestPreferences(new Headers())).toEqual({
      theme: "system",
      locale: "system",
      systemLocales: [],
    });
  });
});
