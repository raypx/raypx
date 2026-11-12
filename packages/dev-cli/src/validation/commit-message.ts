import { readFileSync } from "node:fs";

const conventionalSubject =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9][a-z0-9-]*\))?!?: \S/;
const generatedSubject = /^(?:(?:Merge|amend!|fixup!|squash!) \S|Revert ".+"$)/;

const messageFile = process.argv[2];
if (!messageFile) {
  console.error("Expected the path to a Git commit message file.");
  process.exit(1);
}

const message = readFileSync(messageFile, "utf8");
const subject = message.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
if (!conventionalSubject.test(subject) && !generatedSubject.test(subject)) {
  console.error("Use type(scope)!: summary, for example fix(cli): restore terminal input.");
  console.error("See CONTRIBUTING.md#commit-messages for allowed types and examples.");
  process.exitCode = 1;
}
