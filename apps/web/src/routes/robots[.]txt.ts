import { createFileRoute } from "@tanstack/react-router";
import { env } from "../env";
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          `User-agent: *\nAllow: /\nDisallow: /chat\nDisallow: /tasks\nDisallow: /projects\nDisallow: /settings\nDisallow: /notifications\nDisallow: /admin\n${env.VITE_SITE_URL ? `Sitemap: ${new URL("/sitemap.xml", env.VITE_SITE_URL).href}\n` : ""}`,
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        ),
    },
  },
});
