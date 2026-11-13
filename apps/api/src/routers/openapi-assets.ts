import { defineHandler } from "nitro";
import { setWebSocketHooks } from "crossws";
import { getServerRole } from "../env.js";
import { openApiAssets, openApiAssetsPath, openApiAssetStorage } from "./openapi-paths.js";

export default defineHandler(async (event) => {
  if (event.req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const rejected = new Response(null, { status: 404 });
    setWebSocketHooks(event.req, { upgrade: () => rejected });
    return rejected;
  }
  const name = event.url.pathname.slice(openApiAssetsPath.length + 1);
  const contentType = openApiAssets.get(name);
  if (getServerRole() === "relay" || !contentType)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  const { useKV } = await import("nitro/kv");
  const asset = await useKV(`assets:${openApiAssetStorage}`).getItemRaw<string | Uint8Array>(name);
  if (asset === undefined || asset === null)
    return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  return new Response(event.req.method === "HEAD" ? null : asset, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
});
