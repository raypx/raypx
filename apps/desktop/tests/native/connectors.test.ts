import { expect, it } from "vite-plus/test";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repairConnector } from "../../native/connectors";
it("repairs through the trusted executable with only validated provider and native directories", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-native-repair-")),
    binary = join(directory, "cli"),
    receipt = join(directory, "receipt");
  writeFileSync(
    binary,
    `#!${process.execPath}\nawait Bun.write(${JSON.stringify(receipt)},JSON.stringify(process.argv.slice(2)));console.log(JSON.stringify({installed:true}));`,
    { mode: 0o700 },
  );
  try {
    expect(
      await repairConnector(
        binary,
        ["--data-dir", directory],
        { provider: "claude", recoverModified: true, configDirs: { claude: "/untrusted" } },
        { claude: directory },
      ),
    ).toEqual({ installed: true });
    const args = JSON.parse(readFileSync(receipt, "utf8"));
    expect(args.slice(0, 3)).toEqual(["connectors", "repair", "claude"]);
    expect(JSON.parse(args[3]).configDirs).toEqual({ claude: directory });
    await expect(repairConnector(binary, [], { provider: "../../other" }, {})).rejects.toThrow(
      /Invalid|provider/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
