import { expect, it, vi } from "vitest";
import { checkApi, checkWeb } from "./checks.js";

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

function apiFixture(
  options: {
    status?: number;
    emailVerified?: boolean;
    emailVerificationSkipped?: boolean;
    session?: boolean;
  } = {},
) {
  let email = "";
  const emails: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/api/docs")
        return new Response('<script src="/api/docs/assets/swagger-ui-bundle.js"></script>');
      if (path === "/api/docs/assets/swagger-ui-bundle.js")
        return new Response("export {}", { headers: { "content-type": "text/javascript" } });
      if (path === "/api/auth/sign-up/email") {
        if (typeof init?.body !== "string") throw new Error("Expected a JSON signup body");
        email = (JSON.parse(init.body) as { email: string }).email;
        emails.push(email);
        return Response.json(
          {
            user: {
              email,
              emailVerified: options.emailVerified ?? false,
              emailVerificationSkipped: options.emailVerificationSkipped ?? true,
            },
          },
          { status: options.status ?? 200, headers: { "set-cookie": "fixture-session=value" } },
        );
      }
      if (path === "/api/auth/get-session") {
        const cookie = new Headers(init?.headers).get("cookie");
        return Response.json(
          options.session === false || cookie !== "fixture-session=value"
            ? null
            : { user: { email } },
        );
      }
      if (path === "/device/connect") return new Response(null, { status: 426 });
      return new Response(null, { status: 404 });
    }),
  );
  return emails;
}

it("accepts usable unverified no-mail signups and uses distinct accounts for repeated probes", async () => {
  const emails = apiFixture();
  await checkApi("https://fixture.example", { gateway: true });
  await checkApi("https://fixture.example", { gateway: true });
  expect(new Set(emails).size).toBe(2);
});

it.each([{ status: 503 }, { emailVerified: true }, { emailVerificationSkipped: false }])(
  "rejects incorrect no-mail admission: %j",
  async (options) => {
    apiFixture(options);
    await expect(checkApi("https://fixture.example", { gateway: true })).rejects.toThrow(
      "No-mail signup must create an unverified account with verification skipped",
    );
  },
);

it("rejects a no-mail signup whose cookie does not establish an admitted session", async () => {
  apiFixture({ session: false });
  await expect(checkApi("https://fixture.example", { gateway: true })).rejects.toThrow(
    "No-mail signup must issue an immediately usable session",
  );
});
