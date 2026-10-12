import { createRequire } from "node:module";
import { builtinEnvironments } from "vite-plus/test/runtime";

const require = createRequire(import.meta.url);
const viteRuntime = require.resolve("vite-plus/test/runtime");
const runnerRuntime = createRequire(viteRuntime).resolve("vitest/runtime");
const runnerRequire = createRequire(runnerRuntime);
let prepared = false;

/** Bun cannot preserve jsdom 30's private Window brands through node:vm WindowProxy. */
function prepareJsdom(): void {
  if (prepared) return;
  const jsdom = runnerRequire("jsdom") as {
    JSDOM: new (html?: string, options?: Record<string, unknown>) => object;
  };
  jsdom.JSDOM = new Proxy(jsdom.JSDOM, {
    construct(target, args, constructor) {
      const [html, options] = args as [string | undefined, Record<string, unknown> | undefined];
      const settings = { ...options };
      delete settings.runScripts;
      return Reflect.construct(target, [html, settings], constructor);
    },
  });
  prepared = true;
}

const environment = builtinEnvironments.jsdom;
const setup = environment.setup;
environment.setup = (global, options) => {
  const jsdom = options.jsdom as { runScripts?: unknown } | undefined;
  if (jsdom?.runScripts !== undefined)
    throw new Error(
      "Bun DOM tests cannot execute scripts inside jsdom's VM; use a browser test for that behavior.",
    );
  prepareJsdom();
  // Keep Vitest's DOM globals, request adapters, uncaught-error handling and cleanup.
  return setup(global, options);
};
