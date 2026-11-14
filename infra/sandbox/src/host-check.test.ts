import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it.each(["healthy", "firewall", "disk", "inodes"] as const)(
  "contains compute and closes admission on a failed %s host check",
  async (failure) => {
    const directory = await mkdtemp(join(tmpdir(), "raypx-host-check-"));
    async function executable(name: string, source: string) {
      await writeFile(join(directory, name), `#!/bin/sh\n${source}\n`, { mode: 0o700 });
    }
    try {
      await executable(
        "sha256sum",
        "cat >/dev/null; echo 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      );
      await executable(
        "check-host.sh",
        await readFile(
          new URL("../../../deploy/sandbox-host/check-host.sh", import.meta.url),
          "utf8",
        ),
      );
      await executable("systemctl", 'printf "%s\\n" "$*" >> "$CHECK_EVENTS"');
      // A failed containment hook must still close the listener through systemd.
      await executable("stop-owned.sh", 'echo contain >> "$CHECK_EVENTS"; exit 1');
      await executable("iptables", failure === "firewall" ? "exit 1" : "exit 0");
      await executable("ip6tables", "exit 0");
      await executable(
        "df",
        `echo 'Filesystem blocks used available capacity mounted'; case "$1" in -Pi) echo '/owned 100 10 90 ${failure === "inodes" ? 90 : 10}% /owned';; *) echo '/owned 100 10 90 ${failure === "disk" ? 85 : 10}% /owned';; esac`,
      );
      const events = join(directory, "events");
      const result = spawnSync("/bin/sh", [join(directory, "check-host.sh")], {
        env: {
          ...process.env,
          PATH: `${directory}:/usr/bin:/bin`,
          SANDBOX_NAMESPACE: "test-host",
          CHECK_EVENTS: events,
        },
        encoding: "utf8",
      });
      const recorded = await readFile(events, "utf8");
      const refused = failure !== "healthy";
      expect(result.status).toBe(refused ? 1 : 0);
      expect(recorded.includes("contain\nstop raypx-sandbox.service")).toBe(refused);
      expect(result.stderr.includes('"event":"sandbox.host_policy_refused"')).toBe(refused);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
