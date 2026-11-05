import { readStandardInput } from "@raypx/runtime-node/process";
import { ProfileStorage } from "../../../src/runtime/sqlite/index.ts";
import { StateStore } from "../../../src/runtime/state/index.ts";
import { AgentStore } from "../../../src/runtime/agents/store.ts";
import { TerminalStore } from "../../../src/runtime/terminal/store.ts";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository.ts";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite.ts";

process.stdout.write("ready\n");
await readStandardInput();
const directory = process.argv[2]!;
const storage = new ProfileStorage(directory);
const state = new StateStore(storage);
const agents = new AgentStore(storage.database);
const terminal = new TerminalStore(storage.database);
const memory = new SqliteContextRepository(storage.database);
const pi = new SqlitePiContextStore(storage.database, "migration-test");
try {
  terminal.sessions();
  await memory.list("device");
  console.log(JSON.stringify({ streamId: agents.streamId, revision: state.revision() }));
} finally {
  pi.close();
  storage.close();
}
