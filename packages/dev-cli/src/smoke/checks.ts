/** Shared acceptance behavior for relocated outputs and real deployment images. */
export async function checkApi(base: string, options: { origin?: string; gateway?: boolean } = {}) {
  for (const path of [
    "/rpc/__missing",
    "/api/__missing",
    ...(options.gateway ? [] : ["/settings", "/assets/__missing.js"]),
  ]) {
    const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    if (response.status !== 404)
      throw new Error(`API ${path} returned ${response.status}, expected 404`);
  }
  const docs = await fetch(`${base}/api/docs`);
  const assetPath = "/api/docs/assets/swagger-ui-bundle.js";
  if (!docs.ok || !(await docs.text()).includes(assetPath))
    throw new Error("API Swagger UI must reference its bundled assets");
  const asset = await fetch(`${base}${assetPath}`);
  if (
    !asset.ok ||
    !asset.headers.get("content-type")?.includes("javascript") ||
    !(await asset.text())
  )
    throw new Error("API must serve the bundled Swagger UI script");
  if ((await fetch(`${base}/api/docs/assets/package.json`)).status !== 404)
    throw new Error("API must only expose the allowlisted Swagger UI assets");
  if (!options.gateway) {
    const upgrade = { upgrade: "websocket" };
    for (const path of ["/api/docs", assetPath]) {
      if ((await fetch(`${base}${path}`, { headers: upgrade })).status !== 404)
        throw new Error(`API ${path} must reject WebSocket upgrades`);
    }
    const rejected = await fetch(`${base}/device/connect`, {
      headers: { ...upgrade, origin: "https://disallowed.example.invalid" },
    });
    if (rejected.status !== 403)
      throw new Error("Connector must enforce role and native-only Origin before upgrading");
  }
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: options.origin ?? base },
    body: JSON.stringify({
      name: "Artifact",
      email: "artifact@example.invalid",
      password: "artifact-password-123",
    }),
  });
  const unavailable = (await signup.json()) as { code?: string };
  if (signup.status !== 503 || unavailable.code !== "MAIL_NOT_CONFIGURED")
    throw new Error("Unavailable mail must reject signup before account creation");
  if ((await fetch(`${base}/device/connect`)).status !== 426)
    throw new Error("Connector transport must follow the selected role");
}

export async function checkWeb(base: string) {
  // Guests receive public HTML without a session cookie or private account data.
  const home = await fetch(base, {
    headers: { accept: "text/html", "accept-language": "en" },
    redirect: "manual",
  });
  const guestHeading = /<h1\b[^>]*\sid="landing-home-title"[^>]*>\s*[^\s<][^<]*<\/h1>/;
  if (!home.ok || !guestHeading.test(await home.text()))
    throw new Error("Web did not render its public guest page");
  const admin = await fetch(`${base}/admin/settings`, { redirect: "manual" });
  if (!isSignInRedirect(admin)) throw new Error("Administrator pages must require sign-in");
  const login = await fetch(`${base}/login`, {
    headers: { accept: "text/html", "accept-language": "zh" },
  });
  const html = await login.text();
  if (!login.ok || !html.includes('<html lang="zh"') || !html.includes("欢迎回来</h1>"))
    throw new Error("Web did not server-render sign-in in the request language");
  const reset = await fetch(`${base}/forgot-password`, {
    headers: { accept: "text/html", cookie: "locale=en; theme=dark" },
  });
  if (!reset.ok || !(await reset.text()).includes("Reset password</h1>"))
    throw new Error("Web did not render deep navigation with device preferences");
  const asset = /\/assets\/[^"]+\.js/.exec(html)?.[0];
  if (!asset || !(await fetch(`${base}${asset}`)).ok)
    throw new Error("Web artifact does not serve its client assets");
  for (const path of ["/assets/__missing.js", "/__missing"]) {
    const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    if (response.status !== 404)
      throw new Error(`Web ${path} returned ${response.status}, expected 404`);
  }
}

export async function checkDeploymentSession(
  base: string,
  fixture: {
    origin: string;
    email: string;
    password: string;
  },
) {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: fixture.origin },
    body: JSON.stringify({ email: fixture.email, password: fixture.password }),
  });
  if (!response.ok) throw new Error(`Deployment fixture login failed (${response.status})`);
  const cookies = response.headers.getSetCookie();
  const token = cookies.find((cookie) => cookie.startsWith("__Secure-better-auth.session_token="));
  if (!token || !/;\s*Secure/i.test(token) || !/;\s*HttpOnly/i.test(token))
    throw new Error("Deployment login must issue a secure HTTP-only session cookie");
  const session = await fetch(`${base}/api/auth/get-session`, {
    headers: { cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; ") },
  });
  if (
    !session.ok ||
    ((await session.json()) as { user?: { email?: string } })?.user?.email !== fixture.email
  )
    throw new Error("Deployment gateway did not preserve the authenticated session");
}

/** Administrator pages send signed-out visitors to the standalone login page. */
function isSignInRedirect(response: Response): boolean {
  const location = response.headers.get("location") ?? "";
  return response.status >= 300 && response.status < 400 && /\/login(?:$|\?)/.test(location);
}
