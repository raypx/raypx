import { expect, it } from "bun:test";
import { processAccounting } from "./attribution";

it("defers the check schema but rejects absent measured process accounting", () => {
  expect(processAccounting({ kind: "check" }, true).status).toBe("deferred");
  expect(processAccounting({ kind: "experiment" }, true).status).toBe("uncertain");
});

it("allows an unregistered window without a daemon and requires it for a workbench", () => {
  const result = {
    variants: [{ role: "head", process_set: { by_program: { Raypx: 1, "WebKit.WebContent": 1 } } }],
  };
  expect(processAccounting(result, false).status).toBe("verified");
  expect(processAccounting(result, true).issues).toContain(
    "head: owned daemon absent from measured process set",
  );
  result.variants[0]!.process_set.by_program.Raypx = 2;
  expect(processAccounting(result, true).status).toBe("verified");
});
