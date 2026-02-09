import { createFileRoute } from "@tanstack/react-router";
import { getBaseUrl } from "~/lib/request-utils";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const baseUrl = getBaseUrl(request);

        return new Response(
          `User-agent: *
Allow: /

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Disallow staging/test paths if needed
# Disallow: /test/
# Disallow: /staging/
`,
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
            },
          },
        );
      },
    },
  },
});
