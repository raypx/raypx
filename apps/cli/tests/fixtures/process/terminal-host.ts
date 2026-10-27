import { createInterface } from "node:readline";
import manifest from "../../../package.json";

const mode = process.argv[2];
const id = "8048a349-44da-476a-bd24-679b3ab77c2a";
const send = (value: unknown) => console.log(JSON.stringify(value));
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  const reply = (result: unknown) => send({ version: 1, id: request.id, result });
  if (request.method === "hello") {
    if (mode === "malformed") {
      console.log("invalid protocol with private text");
      continue;
    }
    reply({ protocol: 1, version: mode === "mismatch" ? "0.0.0" : manifest.version });
  } else if (request.method === "open") reply({ id });
  else if (request.method === "attach") {
    // Deliberately race a live event ahead of the baseline response. The
    // adapter must publish retained bytes first and avoid duplicate events.
    send({
      version: 1,
      event: "output",
      id,
      sequence: 2,
      data: Buffer.from("live").toString("base64"),
    });
    reply({
      attachment: 1,
      snapshot: { sequence: 1, status: "running", historyTruncated: false },
      history: [{ sequence: 1, data: Buffer.from("retained-").toString("base64") }],
    });
    send({ version: 1, event: "exit", id, sequence: mode === "gap" ? 4 : 3, exitCode: 7 });
  } else if (request.method === "close") reply({ cancelled: true });
}
