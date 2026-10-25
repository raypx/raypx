import { serveDaemonStdio } from "../../../src/transport/daemon-stdio";
await serveDaemonStdio({ dataDir: process.argv[2]! });
