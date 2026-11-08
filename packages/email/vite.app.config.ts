import { emailPreview } from "@raypx-kit/email-preview";
import { defineConfig } from "vite-plus";

// `bun run email:dev` previews the templates in src/emails; it is never built.
export default defineConfig({
  server: { host: "127.0.0.1", port: 3001, strictPort: true },
  plugins: [emailPreview({ dir: "src/emails", base: "/" })],
});
