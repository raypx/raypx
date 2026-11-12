import { expect, it, vi } from "vitest";
import type { Auth } from "@raypx/auth/server";
import { bootstrapAdministrators } from "./administration/bootstrap.js";

function fixture() {
  const users = [
    {
      id: "a",
      name: "A",
      email: "a@example.test",
      emailVerified: true,
      role: "member",
      banned: false,
    },
    {
      id: "b",
      name: "B",
      email: "b@example.test",
      emailVerified: true,
      role: "admin",
      banned: false,
    },
  ];
  const updateUser = vi.fn(async () => {});
  const auth = {
    $context: Promise.resolve({
      internalAdapter: {
        findUserByEmail: async (email: string) => {
          const user = users.find((candidate) => candidate.email === email);
          return user ? { user } : null;
        },
        updateUser,
      },
    }),
  } as unknown as Pick<Auth, "$context">;
  return { auth, users, updateUser };
}

it("initializes explicit verified accounts and leaves existing administrators alone", async () => {
  const f = fixture();
  expect(
    await bootstrapAdministrators(f.auth, ["a@example.test", "a@example.test", "b@example.test"]),
  ).toEqual({ updated: 1 });
  expect(f.updateUser).toHaveBeenCalledExactlyOnceWith("a", { role: "admin" });
});

it("validates all selected accounts before making any changes", async () => {
  const f = fixture();
  await expect(bootstrapAdministrators(f.auth, [])).rejects.toThrow("ADMIN_EMAILS_REQUIRED");
  await expect(
    bootstrapAdministrators(f.auth, ["a@example.test", "missing@example.test"]),
  ).rejects.toThrow("VERIFIED_ACCOUNTS_REQUIRED");
  f.users[1]!.emailVerified = false;
  await expect(
    bootstrapAdministrators(f.auth, ["a@example.test", "b@example.test"]),
  ).rejects.toThrow("VERIFIED_ACCOUNTS_REQUIRED");
  f.users[1]!.emailVerified = true;
  f.users[1]!.banned = true;
  await expect(bootstrapAdministrators(f.auth, ["b@example.test"])).rejects.toThrow(
    "VERIFIED_ACCOUNTS_REQUIRED",
  );
  expect(f.updateUser).not.toHaveBeenCalled();
});
