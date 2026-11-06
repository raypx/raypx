import { ProfileStorage } from "../../../src/runtime/sqlite";
import { StateStore } from "../../../src/runtime/state";
import { AgentStore } from "../../../src/runtime/agents/store";
import { TerminalStore } from "../../../src/runtime/terminal/store";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite";

process.stdout.write("ready\n");
await Bun.stdin.text();
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
