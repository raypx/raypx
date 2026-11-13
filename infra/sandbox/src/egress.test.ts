import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const script = fileURLToPath(new URL("../egress.sh", import.meta.url));
const bridge = "rpx0123456789";

function dryRun(args = ["--bridge", bridge, "--dry-run"]) {
  // No firewall binaries (or even uname/id) are available to the dry-run process.
  return spawnSync("/bin/sh", [script, ...args], {
    encoding: "utf8",
    env: { PATH: "/raypx-no-executables" },
  });
}

it("renders scoped host and routed rules without executing any firewall command", () => {
  const result = dryRun();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  const rules = result.stdout.split("\n").filter((line) => !line.startsWith("#") && line);
  for (const rule of rules) expect(rule).toMatch(/^(iptables|ip6tables) -w /);
  expect(rules.filter((rule) => rule.includes(" -N "))).toEqual([
    "iptables -w -N RPX_E_0123456789",
  ]);
  for (const rule of rules.filter((candidate) => !candidate.includes(" -N ")))
    expect(rule).toContain(`--comment raypx-sandbox-egress:${bridge}`);
  for (const rule of rules.filter((candidate) => candidate.includes(" -I ")))
    expect(rule).toContain(` -i ${bridge} `);
  for (const rule of rules.filter((candidate) => candidate.includes(" -A ")))
    expect(rule).toContain(" -A RPX_E_0123456789 ");
  expect(rules).toContain(
    `iptables -w -I INPUT 1 -i ${bridge} -m comment --comment raypx-sandbox-egress:${bridge} -j DROP`,
  );
  expect(rules).toContain(
    `iptables -w -I DOCKER-USER 1 -i ${bridge} -m comment --comment raypx-sandbox-egress:${bridge} -j RPX_E_0123456789`,
  );
});

it("blocks LAN, host, link-local and metadata destinations before and after DNAT while retaining public IPv4 egress", () => {
  const { stdout, status } = dryRun();
  expect(status).toBe(0);
  for (const range of [
    "10.0.0.0/8",
    "100.64.0.0/10",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/16",
  ]) {
    expect(stdout).toContain(` -d ${range} `);
    expect(stdout).toContain(` --ctorigdst ${range} `);
  }
  expect(stdout).not.toContain(" -d 0.0.0.0/0 ");
  expect(stdout).not.toContain(" -j ACCEPT");
  for (const chain of ["INPUT", "FORWARD"]) {
    expect(stdout).toContain(`ip6tables -w -I ${chain} 1 -i ${bridge} `);
  }
});

it("rejects ambiguous modes and arbitrary interface names", () => {
  for (const args of [
    ["--bridge", "eth0", "--dry-run"],
    ["--bridge", "rpx012345678Z", "--dry-run"],
    ["--bridge", "rpx0123456789;id", "--dry-run"],
    ["--bridge", bridge, "--apply", "--dry-run"],
    ["--bridge", bridge],
  ]) {
    const result = dryRun(args);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
  }
});
