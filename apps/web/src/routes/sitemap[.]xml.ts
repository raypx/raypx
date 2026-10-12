import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";
function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
}
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        if (!env.VITE_SITE_URL) return new Response("Site URL is not configured.", { status: 503 });
        const urls = ["/", "/docs", "/privacy", "/contact"]
          .map((path) => `<url><loc>${xml(new URL(path, env.VITE_SITE_URL).href)}</loc></url>`)
          .join("");
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
          { headers: { "Content-Type": "application/xml; charset=utf-8" } },
        );
      },
    },
  },
});
