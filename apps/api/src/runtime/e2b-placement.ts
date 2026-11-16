import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { computerE2bHomes, computers } from "@raypx/database/schema";
import { ComputerError } from "@raypx/providers/computer";
import type { E2bPlacementStore } from "@raypx/providers/computer/e2b";

export function postgresE2bPlacement(db: Database, template: string): E2bPlacementStore {
  return {
    locked(ref, spaceId, operation, run) {
      return db.transaction(async (tx) => {
        const candidates = await tx
          .select({
            spaceId: computers.spaceId,
            generation: computers.generation,
            state: computers.state,
            e2bPlaced: computers.e2bPlaced,
          })
          .from(computers)
          .where(
            and(
              eq(computers.id, ref.id),
              eq(computers.provider, "sandbox"),
              isNull(computers.supervisorUrl),
              spaceId ? eq(computers.spaceId, spaceId) : undefined,
            ),
          )
          .limit(2)
          .for("update");
        const computer = candidates[0];
        if (!computer || candidates.length !== 1) throw new ComputerError("PROVIDER_UNAVAILABLE");
        if (computer.generation !== ref.generation) throw new ComputerError("STALE_GENERATION");
        if (operation === "provision" && computer.state !== "starting")
          throw new ComputerError("NOT_RUNNING");
        if (operation === "use" && computer.state !== "running")
          throw new ComputerError("NOT_RUNNING");

        const key = and(
          eq(computerE2bHomes.spaceId, computer.spaceId),
          eq(computerE2bHomes.computerId, ref.id),
        );
        if (operation === "provision" && spaceId && !computer.e2bPlaced) {
          await tx
            .update(computers)
            .set({ e2bPlaced: true })
            .where(and(eq(computers.spaceId, spaceId), eq(computers.id, ref.id)));
          await tx
            .insert(computerE2bHomes)
            .values({
              spaceId,
              computerId: ref.id,
              template,
            })
            .onConflictDoNothing();
        }
        const [placement] = await tx
          .select({
            spaceId: computerE2bHomes.spaceId,
            template: computerE2bHomes.template,
            sandboxId: computerE2bHomes.sandboxId,
            sandboxGeneration: computerE2bHomes.sandboxGeneration,
            createKey: computerE2bHomes.createKey,
            ready: computerE2bHomes.ready,
            destroyed: computerE2bHomes.destroyed,
            homeRevision: computerE2bHomes.homeRevision,
          })
          .from(computerE2bHomes)
          .where(key);
        if (!placement) throw new ComputerError("NOT_FOUND");
        if (placement.template !== template) throw new ComputerError("PROVIDER_UNAVAILABLE");

        return run({
          placement,
          async loadHome() {
            const [row] = await tx
              .select({ archive: computerE2bHomes.archive })
              .from(computerE2bHomes)
              .where(key);
            return row?.archive;
          },
          async save(update) {
            await tx.update(computerE2bHomes).set(update).where(key);
          },
        });
      });
    },
  };
}
