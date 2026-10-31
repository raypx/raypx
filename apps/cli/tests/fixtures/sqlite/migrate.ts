import { StateStore } from "../../../src/runtime/state";
import { AgentStore } from "../../../src/runtime/agents/store";
import { TerminalStore } from "../../../src/runtime/terminal/store";
import { SqliteContextRepository } from "../../../src/runtime/memory/repository";
import { SqlitePiContextStore } from "../../../src/runtime/agents/harness/context/sqlite";

process.stdout.write("ready\n");
await Bun.stdin.text();
const directory = process.argv[2]!;
const state = new StateStore(directory);
const agents = new AgentStore(directory);
const terminal = new TerminalStore(directory);
const memory = new SqliteContextRepository(directory);
const pi = new SqlitePiContextStore(directory, "migration-test");
try {
  console.log(JSON.stringify({ streamId: agents.streamId, revision: state.revision() }));
} finally {
  pi.close();
  memory.close();
  terminal.close();
  agents.close();
  state.close();
}
