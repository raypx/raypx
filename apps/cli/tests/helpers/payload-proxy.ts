import { daemonEventLines } from "../../src/transport/daemon-stdio.js";

/** Read the archive's proxy protocol, retaining evidence if it fails or ends early. */
export async function readPayloadProxy(
  child: Bun.Subprocess<"pipe", "pipe", "pipe">,
  receive: (line: string) => boolean,
) {
  const decoder = new TextDecoder();
  let stdout = "";
  const output = child.stdout.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        stdout += decoder.decode(chunk, { stream: true });
        controller.enqueue(chunk);
      },
    }),
  );
  const stderr = new Response(child.stderr).text();
  let completed = false;
  let failure: unknown;
  const timeout = setTimeout(() => child.kill(), 90_000);
  try {
    for await (const line of daemonEventLines(output)) {
      // The daemon sends empty NDJSON heartbeat lines every five seconds.
      if (line === "\n" || line === "\r\n") continue;
      if (receive(line)) {
        completed = true;
        break;
      }
    }
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(timeout);
    try {
      await child.stdin.end();
    } catch {
      /* An early child exit can already have closed stdin. */
    }
    // Give an exiting proxy time to report its own status before forcing cleanup.
    const cleanup = setTimeout(() => child.kill(), 1_000);
    try {
      await child.exited;
    } finally {
      clearTimeout(cleanup);
    }
  }
  if (!completed)
    throw new Error(
      `Payload proxy did not complete (exit code ${child.exitCode}, signal ${child.signalCode ?? "none"})\nstdout: ${JSON.stringify(stdout + decoder.decode())}\nstderr: ${JSON.stringify(await stderr)}`,
      { cause: failure },
    );
  await stderr;
}
