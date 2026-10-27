import { i18nCatalogs } from "@raypx/i18n/vite";
import { analyticsBuild } from "@raypx/tooling/build/analytics";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";

// Pages render inline hydration and theme scripts, so CSP limits framing, plugins,
// base URLs and form targets rather than script sources.
const securityHeaders = {
  "Content-Security-Policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
};

export default defineConfig(() => {
  const analytics = analyticsBuild();
  return {
    define: analytics.define,
    plugins: [
      nitro({
        ...nitroTarget(),
        routeRules: { "/**": { headers: securityHeaders } },
        // Trace React and React DOM together so both load the same NODE_ENV build.
        traceDeps: ["react", "react-dom"],
      }),
      tailwindcss(),
      // Visitors download the default catalog plus their own language only.
      i18nCatalogs({ catalogs: "lazy" }),
      tanstackStart(),
      react(),
    ],
    build: {
      ...analytics.build,
      rolldownOptions: {
        // Base UI marks modules "use client" for RSC; this SSR app has no server components.
        onLog(level, log, handler) {
          if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
        },
      },
    },
    // A `bun link`ed library resolves its own React copy; keep singleton peers unique.
    resolve: { dedupe: ["react", "react-dom"] },
    server: { port: 3000, strictPort: true },
  };
});
