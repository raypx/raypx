import { writeFileSync } from "node:fs";

process.on("SIGTERM", () => {});
writeFileSync("descendant-ready", "ready");
setInterval(() => writeFileSync("heartbeat", String(Date.now())), 5);
