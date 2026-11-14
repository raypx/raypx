import { expect, it, vi } from "vitest";
import type { Database } from "@raypx/database/connection";
import type { SpaceScope } from "@raypx/spaces/server";
import { createDeviceComputersRepository } from "./devices-postgres.js";

it("cannot issue or authenticate a connector without a canonical deployment origin", async () => {
  const transaction = vi.fn();
  const select = vi.fn();
  const repository = createDeviceComputersRepository(
    { transaction, select } as unknown as Database,
    "",
  );
  const scope = {} as SpaceScope;
  await expect(repository.createPairing(scope)).rejects.toThrow("ACCESS_DENIED");
  await expect(repository.claim({ code: "pair-code", deviceName: "Machine" })).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(
    repository.confirm({ claimId: "claim", claimToken: "a".repeat(64) }),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(repository.authenticate("a".repeat(64))).rejects.toThrow("ACCESS_DENIED");
  expect(transaction).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
