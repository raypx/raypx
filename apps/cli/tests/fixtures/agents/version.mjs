export function exitForVersion(provider) {
  if (!process.argv.includes("--version")) return;
  console.log(provider === "codex" ? "codex-cli 0.163.0" : "2.1.302 (Claude Code)");
  process.exit(0);
}
