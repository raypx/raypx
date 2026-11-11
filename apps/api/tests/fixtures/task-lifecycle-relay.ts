import { relayFixture } from "../helpers/relay.js";

if (!process.send) throw new Error("Task lifecycle fixture requires a parent test process");

const relay = await relayFixture(["views://main"]);
process.on("message", (command: unknown) => {
  if (command === "pause") relay.pauseRelay(true);
  if (command === "resume") relay.pauseRelay(false);
});
process.once("disconnect", () => void relay.close());
process.send(relay.base);
