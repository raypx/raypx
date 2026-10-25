import { localParams } from "@raypx/contracts/local";

/** Run the trusted bundled executable, never the modified installation. */
export async function repairConnector(
  binary: string,
  args: string[],
  input: unknown,
  configDirs: { claude?: string; codex?: string },
) {
  const { provider } = localParams["connectors.install"].parse(input);
  const child = Bun.spawn(
    [binary, "connectors", "repair", provider, JSON.stringify({ configDirs }), "--json", ...args],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe" },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 20_000);
  const read = async (stream: ReadableStream<Uint8Array>) => {
    let result = "",
      bytes = 0;
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      bytes += chunk.byteLength;
      if (bytes > 256 * 1024) throw new Error("INSTALLATION_FAILED");
      result += decoder.decode(chunk, { stream: true });
    }
    return result + decoder.decode();
  };
  try {
    const [out, err, code] = await Promise.all([
      read(child.stdout),
      read(child.stderr),
      child.exited,
    ]);
    if (timedOut) throw new Error("INSTALLATION_TIMEOUT");
    if (code !== 0) {
      const codes = new Set([
        "INSTALLATION_BUSY",
        "INSTALLATION_CONFLICT",
        "HOST_DOWNGRADE",
        "HOST_UPDATE_REQUIRED",
        "UNSUPPORTED_PLATFORM",
        "EACCES",
        "EPERM",
      ]);
      for (const line of err.split("\n"))
        try {
          const value: unknown = JSON.parse(line);
          if (
            value &&
            typeof value === "object" &&
            "code" in value &&
            typeof value.code === "string" &&
            codes.has(value.code)
          )
            throw Object.assign(new Error(value.code), { code: value.code });
        } catch (error) {
          if (error instanceof Error && codes.has(error.message)) throw error;
        }
      throw new Error("INSTALLATION_FAILED");
    }
    return JSON.parse(out) as unknown;
  } finally {
    clearTimeout(timer);
    child.kill();
    await child.exited;
  }
}
