import { serveDaemonStdio } from "../../../src/transport/daemon-stdio.js";
await serveDaemonStdio({ dataDir: process.argv[2]! });
