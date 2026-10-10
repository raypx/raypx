import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

test("the public core entry bundles for browsers without React, Query or server implementations", () => {
  const result = execFileSync(
    "bun",
    [
      "--no-env-file",
      "-e",
      `
      const result = await Bun.build({
        entrypoints: ["packages/client/test/fixtures/core-entry.ts"],
        target: "browser",
        write: false,
        plugins: [{
          name: "core-runtime-boundary",
          setup(builder) {
            builder.onResolve({
              filter: /^(?:react(?:-dom)?(?:\\/|$)|@tanstack\\/(?:react-query|query-core)(?:\\/|$)|@raypx\\/(?:api|auth|db|logger|storage|worker)(?:\\/|$)|node:|bun:)/,
            }, ({path}) => { throw new Error("Unexpected core runtime dependency: " + path); });
          },
        }],
      });
      if (!result.success) throw new Error(result.logs.map(String).join("\\n"));
      if (result.outputs.length !== 1) throw new Error("Missing browser core artifact");
      console.log("core-browser-entry-ok");
      `,
    ],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.trim()).toBe("core-browser-entry-ok");
});
