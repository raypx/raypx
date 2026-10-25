import { runDaemon } from "../../../src/runtime/daemon/server";
setTimeout(() => {
  void Promise.reject(new Error("private injected content"));
}, 200);
await runDaemon({ dataDir: process.argv[2]! });
