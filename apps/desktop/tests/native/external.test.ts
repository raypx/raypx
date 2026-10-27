import { expect, it } from "vite-plus/test";
import { externalUrl } from "../../native/external";

it("only opens credential-free web links", () => {
  expect(externalUrl("https://example.test/path")).toBe("https://example.test/path");
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:key@example.test",
    "https://example.test/\n",
  ])
    expect(externalUrl(value)).toBeNull();
});
