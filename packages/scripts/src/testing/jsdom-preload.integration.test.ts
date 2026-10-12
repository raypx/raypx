import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vite-plus/test";

const execute = promisify(execFile);

it("keeps real DOM focus, events and uncaught-error reporting under Bun", async () => {
  const source = `
import assert from "node:assert/strict";
import { builtinEnvironments } from ${JSON.stringify(import.meta.resolve("vite-plus/test/runtime"))};
assert.equal(process.versions.bun, "1.4.0");
console.error("runtime imported");
await assert.rejects(async () => builtinEnvironments.jsdom.setup(globalThis, { jsdom: { runScripts: "dangerously" } }), /cannot execute scripts inside jsdom/);
const environment = await builtinEnvironments.jsdom.setup(globalThis, {});
console.error("DOM setup complete");
let errors = 0;
let events = 0;
const onError = error => { assert.equal(error.message, "expected-dom-error"); errors++; };
process.on("uncaughtException", onError);
try {
  document.body.innerHTML = "<button>Focus target</button>";
  const button = document.querySelector("button");
  button.focus();
  assert.equal(document.activeElement, button);
  window.addEventListener("probe", () => { events++; });
  window.dispatchEvent(new Event("probe"));
  assert.equal(events, 1);
  window.dispatchEvent(new ErrorEvent("error", { error: new Error("expected-dom-error") }));
  assert.equal(errors, 1);
} finally {
  process.off("uncaughtException", onError);
  await environment.teardown(globalThis);
}
console.error("DOM teardown complete");
console.log(JSON.stringify({ focused: true, events, errors }));
`;
  // Asynchronous waiting keeps the runner responsive; timeout failures include
  // the child phase markers and terminate it instead of leaving a hung worker.
  const result = await execute(
    process.execPath,
    [
      "--no-env-file",
      "--no-install",
      "--preload",
      fileURLToPath(new URL("./jsdom-preload.ts", import.meta.url)),
      "--eval",
      source,
    ],
    { encoding: "utf8", timeout: 12_000 },
  );
  expect(JSON.parse(result.stdout)).toEqual({ focused: true, events: 1, errors: 1 });
}, 15_000);
