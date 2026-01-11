import { defineConfig } from "vitest/config";

// Root vitest config - defines workspace projects
// Individual packages have their own vitest.config.ts files with specific configurations
export default defineConfig({
  test: {
    // Define projects for workspace mode
    // Vitest will automatically discover and use each package's vitest.config.ts
    projects: ["packages/*", "apps/*"],
  },
});
