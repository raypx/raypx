import { expect, it } from "vite-plus/test";
import { runFailureLabel } from "./labels";
it("never renders arbitrary provider error text or inherited object properties", () => {
  const translate = (key: string) => key;
  expect(runFailureLabel("MODEL_UNAVAILABLE", translate)).toBe("modelUnavailable");
  expect(runFailureLabel("provider failure includes secret-token", translate)).toBe("failed");
  expect(runFailureLabel("toString", translate)).toBe("failed");
});
