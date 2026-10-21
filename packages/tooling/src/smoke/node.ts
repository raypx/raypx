import { join } from "node:path";
import { probeArtifact } from "@raypx-kit/devkit/artifact";
import { pinnedNode } from "../repository.js";

/** Starts a relocated Node output on a free port and probes it while it runs. */
function probeApp(
  root: string,
  app: "api" | "web",
  environment: (base: string) => Record<string, string>,
  check: (base: string) => Promise<void>,
): Promise<void> {
  return probeArtifact({
    name: app,
    output: join(root, "apps", app, ".output"),
    node: pinnedNode(root),
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
      WEB_URL: base,
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
          reject(new Error("Node Relay WebSocket handshake timed out"));
        }, 5000);
        // An unauthenticated frame exercises the real Nitro upgrade without a database.
        socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "ping" })));
        socket.addEventListener("error", () => {
          clearTimeout(timer);
          reject(new Error("Node Relay WebSocket upgrade failed"));
        });
        socket.addEventListener("close", (event) => {
          clearTimeout(timer);
          if (event.code === 4001) resolve();
          else reject(new Error(`Node Relay rejected authentication with ${event.code}`));
        });
      });
    },
  );
  console.log("Node API artifact probe passed (relocated output, health, 404s, mail guard, Relay)");
}

export async function probeWeb(root: string): Promise<void> {
  await probeApp(
    root,
    "web",
    () => ({ NODE_ENV: "production" }),
    async (base) => {
      // Signed-out requests carry no session cookie, so rendering never calls the API.
      const home = await fetch(base, { headers: { accept: "text/html", "accept-language": "zh" } });
      const html = await home.text();
      if (!home.ok || !html.includes('<html lang="zh"') || !html.includes("<h1>你的账号</h1>"))
        throw new Error("Web did not server-render the account page in the request language");
      const settings = await fetch(`${base}/settings`, {
        headers: { accept: "text/html", cookie: "locale=en; theme=dark" },
      });
      if (!settings.ok || !(await settings.text()).includes("<h1>Make it yours</h1>"))
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
  console.log("Node Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}
