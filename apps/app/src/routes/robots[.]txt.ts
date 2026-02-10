import { createFileRoute } from "@tanstack/react-router";
import { getBaseUrl } from "~/lib/request-utils";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getBaseUrl(request);
        const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;

        return new Response(robotsTxt, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=86400",
          },
        });
      },
    },
  },
});
