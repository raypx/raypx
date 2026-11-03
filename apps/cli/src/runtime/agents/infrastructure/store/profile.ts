import { z } from "zod";
import { eq } from "drizzle-orm";
import { agentProviderSchema, agentProviders, type AgentProvider } from "@raypx/core/tasks";
import type { LocalDatabase } from "../../../sqlite";
import { storedRecord } from "../../../sqlite/records";
import { agentMeta, projects } from "../../../sqlite/schema";

/** Profile-level agent settings: enabled providers per project and device identity per binding. */
export class ProfileSettings {
  constructor(private readonly database: LocalDatabase) {}

  projects(): { id: string; providers: AgentProvider[] }[] {
    return this.database
      .select()
      .from(projects)
      .orderBy(projects.id)
      .all()
      .map((row) => ({
        id: row.id,
        providers: storedRecord(
          z.array(agentProviderSchema).max(agentProviders.length),
          row.providers,
        ),
      }));
  }
  configure(id: string, providers: AgentProvider[]) {
    this.database
      .insert(projects)
      .values({ id, providers: JSON.stringify(providers) })
      .onConflictDoUpdate({ target: projects.id, set: { providers: JSON.stringify(providers) } })
      .run();
  }
  deviceId(binding: string) {
    const key = `device:${binding}`;
    this.database
      .insert(agentMeta)
      .values({ id: key, value: crypto.randomUUID() })
      .onConflictDoNothing()
      .run();
    return this.database
      .select({ value: agentMeta.value })
      .from(agentMeta)
      .where(eq(agentMeta.id, key))
      .get()!.value;
  }
}
