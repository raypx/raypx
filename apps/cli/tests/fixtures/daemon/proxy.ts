import { serveDaemonStdio } from "../../../src/transport/daemon-stdio.ts";
await serveDaemonStdio({ dataDir: process.argv[2]! });
