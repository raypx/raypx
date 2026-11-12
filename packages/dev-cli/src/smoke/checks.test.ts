import { expect, it, vi } from "vite-plus/test";
import { checkWeb } from "./checks.js";

function fixture(home: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const path = new URL(String(input)).pathname;
      if (path === "/") return new Response(home);
      if (path === "/admin/settings")
        return new Response(null, { status: 302, headers: { location: "/login?next=settings" } });
      if (path === "/login")
        return new Response(
          '<html lang="zh"><h1 class="title">欢迎回来</h1><script src="/assets/fixture.js"></script></html>',
        );
      if (path === "/forgot-password") return new Response('<h1 class="title">Reset password</h1>');
      if (path === "/assets/fixture.js") return new Response("export {}");
      if (path === "/assets/__missing.js" || path === "/__missing")
        return new Response(null, { status: 404 });
      throw new Error("Unexpected artifact probe");
    }),
  );
}
it("accepts the real guest heading with accessibility and presentation attributes", async () => {
  fixture('<h1 id="landing-home-title" class="text-4xl">Run locally. Review remotely.</h1>');
  expect(await checkWeb("https://fixture.example")).toBeUndefined();
});
it.each([
  '<div id="landing-home-title">Run locally. Review remotely.</div>',
  "<h1>Private account</h1>",
  '<h1 id="landing-home-title"> </h1>',
])("rejects HTML without the public guest heading: %s", async (home) => {
  fixture(home);
  await expect(checkWeb("https://fixture.example")).rejects.toThrow(
    /Web did not render its public guest page/,
  );
});
