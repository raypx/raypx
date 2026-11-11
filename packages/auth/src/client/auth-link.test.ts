import { expect, it } from "vite-plus/test";
import { readAuthLink } from "./auth-link.js";

it.each(["", "?token=%20%20", "?error=TOKEN_EXPIRED", "?token=old&error=TOKEN_EXPIRED"])(
  "rejects an unusable reset link %s",
  (search) => {
    expect(readAuthLink("reset-password", search, null).invalidReset).toBe(true);
  },
);

it("accepts a reset token until the server reports the link invalid", () => {
  expect(readAuthLink("reset-password", "?token=reset-token", null)).toMatchObject({
    token: "reset-token",
    invalidReset: false,
  });
  expect(
    readAuthLink("reset-password", "?token=reset-token", { kind: "auth", key: "invalidLink" })
      .invalidReset,
  ).toBe(true);
  expect(
    readAuthLink("reset-password", "?token=reset-token", { kind: "network" }).invalidReset,
  ).toBe(false);
});

it("only treats a successful verification return as verified", () => {
  expect(readAuthLink("verify-email", "?verified=1", null).verified).toBe(true);
  expect(readAuthLink("verify-email", "?verified=1&error=EXPIRED", null)).toMatchObject({
    verified: false,
    failed: true,
  });
  expect(readAuthLink("login", "?verified=1", null).verified).toBe(false);
});

it("keeps other modes usable when a link failed or carries a token", () => {
  expect(readAuthLink("login", "?error=EXPIRED&token=x&email=ada@example.test", null)).toEqual({
    email: "ada@example.test",
    token: "x",
    failed: true,
    invalidReset: false,
    verified: false,
  });
});
