import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("preserves tenant INPUT priority across repeated production preparation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-host-prepare-"));
  const namespace = "test-host";
  const bridge = `rpx${createHash("sha256").update(namespace).digest("hex").slice(0, 10)}`;
  const rules = join(directory, "rules");
  async function executable(name: string, source: string) {
    await writeFile(join(directory, name), `#!/bin/sh\n${source}\n`, { mode: 0o700 });
  }
  try {
    await writeFile(rules, "");
    await executable(
      "sha256sum",
      `cat >/dev/null; echo ${createHash("sha256").update(namespace).digest("hex")}`,
    );
    await executable(
      "docker",
      `case "$*" in
      *'{{.Driver}}'*) echo bridge;;
      *'raypx.supervisor'*) echo "$SANDBOX_NAMESPACE-computers";;
      *'bridge.name'*) echo "$TEST_BRIDGE";;
      *'enable_icc'*) echo false;;
    esac`,
    );
    await executable(
      "iptables",
      `case "$2" in
      -C) /usr/bin/grep -F -x -- "$*" "$TEST_RULES" >/dev/null;;
      -I) rule=$(printf '%s' "$*" | sed 's/-I INPUT 1/-C INPUT/'); old=$(cat "$TEST_RULES"); printf '%s\\n%s\\n' "$rule" "$old" > "$TEST_RULES";;
      *) exit 1;;
    esac`,
    );
    // Emulate egress.sh's strict existing-hook priority contract, without root or
    // access to the host firewall. This rejects the original control-after-egress order.
    await executable(
      "sh",
      `if [ "$1" != /opt/raypx-sandbox/current/egress.sh ]; then exit 1; fi
      if /usr/bin/grep -q tenant "$TEST_RULES"; then
        [ "$(head -n1 "$TEST_RULES")" = tenant ] || exit 1
      else
        old=$(cat "$TEST_RULES"); printf 'tenant\\n%s\\n' "$old" > "$TEST_RULES"
      fi`,
    );
    const script = new URL("../../../deploy/sandbox-host/prepare-host.sh", import.meta.url);
    const env = {
      ...process.env,
      PATH: `${directory}:/usr/bin:/bin`,
      SANDBOX_NAMESPACE: namespace,
      SANDBOX_LISTEN_ADDRESS: "10.77.0.2",
      TEST_RULES: rules,
      TEST_BRIDGE: bridge,
    };
    const results = [1, 2].map(() =>
      spawnSync("/bin/sh", [script.pathname], { env, encoding: "utf8" }),
    );
    expect(results.map((result) => ({ status: result.status, stderr: result.stderr }))).toEqual([
      { status: 0, stderr: "" },
      { status: 0, stderr: "" },
    ]);
    const final = (await readFile(rules, "utf8")).trim().split("\n").filter(Boolean);
    expect(final[0]).toBe("tenant");
    expect(final).toHaveLength(3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
