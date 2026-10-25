import { expect, it } from "vite-plus/test";
import { createClientIpReader } from "../../server/app/client-ip.js";

it("ignores spoofed forwarding from other containers and strips only trusted rightmost hops", () => {
  const read = createClientIpReader(["x-forwarded-for"], ["172.30.0.2/32", "203.0.113.0/24"]);
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.20" });
  expect(read("172.30.0.7", headers)).toBe("172.30.0.7");
  expect(read("::ffff:172.30.0.2", headers)).toBe("198.51.100.1");
  expect(read(undefined, headers)).toBeNull();
  expect(read("172.30.0.2", new Headers({ "x-forwarded-for": "invalid" }))).toBe("172.30.0.2");
  expect(read("198.51.100.2", headers)).toBe("198.51.100.2");
});
