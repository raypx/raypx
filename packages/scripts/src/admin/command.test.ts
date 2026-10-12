import { parseArgs } from "citty";
import { describe, expect, it } from "vite-plus/test";

import { adminCreateArgs } from "./command.js";

describe("admin create arguments", () => {
  it.each([
    [["--email=admin@example.com", "--name", "Admin User"]],
    [["--email", "admin@example.com", "--name=Admin User"]],
  ])("parses inline and separated flags", (rawArgs) => {
    expect(parseArgs(rawArgs, adminCreateArgs)).toMatchObject({
      email: "admin@example.com",
      name: "Admin User",
    });
  });
});
