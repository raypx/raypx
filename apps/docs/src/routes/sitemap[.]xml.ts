import { createFileRoute } from "@tanstack/react-router";
import { getBaseUrl } from "~/lib/request-utils";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { source } = await import("~/lib/source");

        const baseUrl = getBaseUrl(request);
        const timestamp = new Date().toISOString();

        try {
          const pages = source.getPages();
          const urls = pages.map(
            (page) => `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <lastmod>${timestamp}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page.url === "/docs" ? "1.0" : "0.7"}</priority>
  </url>`,
          );

          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/docs</loc>
    <lastmod>${timestamp}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>${urls.join("")}
</urlset>`,
            {
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
              },
            },
          );
        } catch (error) {
          console.error("Error generating sitemap:", error);
          return new Response(
            `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/docs</loc>
    <lastmod>${timestamp}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`,
            {
              status: 200,
              headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, max-age=3600",
              },
            },
          );
        }
      },
    },
  },
});
