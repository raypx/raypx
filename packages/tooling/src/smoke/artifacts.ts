import { join } from "node:path";
import { probeArtifact } from "@raypx-kit/devkit/artifact";

/** Starts a relocated Nitro output under this Bun runtime on a free port and probes it. */
function probeApp(
  root: string,
  app: "api" | "web",
  environment: (base: string) => Record<string, string>,
  check: (base: string) => Promise<void>,
): Promise<void> {
  return probeArtifact({
    name: app,
    output: join(root, "apps", app, ".output"),
    // devkit names the executable `node`; the probe runs the output with Bun.
    node: process.execPath,
    environment,
    check,
    failOnOutput: ["Error in renderToReadableStream"],
  });
}

export async function probeApi(root: string): Promise<void> {
  await probeApp(
    root,
    "api",
    (base) => ({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
      AUTH_URL: base,
      AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      ALLOWED_ORIGINS: base,
    }),
    async (base) => {
      for (const path of [
        "/rpc/__missing",
        "/api/__missing",
        "/settings",
        "/assets/__missing.js",
      ]) {
        const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
        if (response.status !== 404)
          throw new Error(`API ${path} returned ${response.status}, expected 404`);
      }
      const signup = await fetch(`${base}/api/auth/sign-up/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify({
          name: "Artifact",
          email: "artifact@example.invalid",
          password: "artifact-password-123",
        }),
      });
      const unavailable = (await signup.json()) as { code?: string };
      if (signup.status !== 503 || unavailable.code !== "MAIL_NOT_CONFIGURED")
        throw new Error(
          "Unconfigured mail must reject signup before any database or delivery attempt",
        );
      await new Promise<void>((resolve, reject) => {
        const url = new URL("/relay", base);
        url.protocol = "ws:";
        const socket = new WebSocket(url);
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error("Relay WebSocket handshake timed out"));
        }, 5000);
        // An unauthenticated frame exercises the real Nitro upgrade without a database.
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "ping" })));
        socket.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("Relay WebSocket upgrade failed"));
        });
        socket.addEventListener("close", (event) => {
          clearTimeout(timer);
          if (event.code === 4001) resolve();
          else reject(new Error(`Relay rejected authentication with ${event.code}`));
        });
      });
    },
  );
  console.log("Bun API artifact probe passed (relocated output, health, 404s, mail guard, Relay)");
}

export async function probeWeb(root: string): Promise<void> {
  await probeApp(
    root,
    "web",
    () => ({ NODE_ENV: "production" }),
    async (base) => {
      // Guests receive public HTML without a session cookie or private account data.
      const home = await fetch(base, { headers: { accept: "text/html" }, redirect: "manual" });
      if (!home.ok || !(await home.text()).includes("Remote tasks and approvals"))
        throw new Error("Web did not render its public guest page");
      const admin = await fetch(`${base}/admin/settings`, { redirect: "manual" });
      if (!isSignInRedirect(admin)) throw new Error("Administrator pages must require sign-in");
      const login = await fetch(`${base}/login`, {
        headers: { accept: "text/html", "accept-language": "zh" },
      });
      const html = await login.text();
      if (!login.ok || !html.includes('<html lang="zh"') || !html.includes("欢迎回来</h2>"))
        throw new Error("Web did not server-render sign-in in the request language");
      const reset = await fetch(`${base}/forgot-password`, {
        headers: { accept: "text/html", cookie: "locale=en; theme=dark" },
      });
      if (!reset.ok || !(await reset.text()).includes("Reset password</h2>"))
        throw new Error("Web did not render deep navigation with device preferences");
      const asset = /\/assets\/[^"]+\.js/.exec(html)?.[0];
      if (!asset || !(await fetch(`${base}${asset}`)).ok)
        throw new Error("Web artifact does not serve its client assets");
      for (const path of ["/assets/__missing.js", "/__missing"]) {
        const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
        if (response.status !== 404)
          throw new Error(`Web ${path} returned ${response.status}, expected 404`);
      }
    },
  );
  console.log("Bun Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}

/** Administrator pages send signed-out visitors to the standalone login page. */
function isSignInRedirect(response: Response): boolean {
  const location = response.headers.get("location") ?? "";
  return response.status >= 300 && response.status < 400 && /\/login(?:$|\?)/.test(location);
}
