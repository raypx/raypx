import { parseArgs } from "node:util";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AiError, createAiClient } from "@raypx/ai";
import { cases, promptFor, validateCases } from "./cases";
import { EvalRequestError, evaluate, promptHash } from "./harness";

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    options: {
      provider: { type: "string" },
      model: { type: "string" },
      case: { type: "string" },
      samples: { type: "string", default: "3" },
      out: { type: "string" },
      baseline: { type: "string" },
      run: { type: "boolean", default: false },
      "max-steps": { type: "string", default: "16" },
    },
  });
  const samples = Number(values.samples),
    maxSteps = Number(values["max-steps"]);
  if (
    !values.provider ||
    !values.model ||
    !Number.isSafeInteger(samples) ||
    samples < 1 ||
    samples > 100 ||
    !Number.isSafeInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > 64
  )
    throw new Error("Specify --provider and --model; samples 1..100, max-steps 1..64");
  validateCases(cases);
  const selected = cases.filter(
    (entry) => !values.case || values.case.split(",").includes(entry.id),
  );
  if (
    !selected.length ||
    (values.case && values.case.split(",").some((id) => !selected.some((entry) => entry.id === id)))
  )
    throw new Error("Unknown eval case");
  const selection = { provider: values.provider, model: values.model };
  const baseline = values.baseline
    ? (await readFile(values.baseline, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
  if (
    baseline.some(
      (row) =>
        row.model !== selection.model ||
        row.provider !== selection.provider ||
        row.type !== "result" ||
        row.schemaVersion !== 1 ||
        row.maxSteps !== maxSteps ||
        !["pass", "fail", "error"].includes(String(row.status)),
    )
  )
    throw new Error("Baseline must contain result rows from the same provider/model");
  const emit = async (row: object) => {
    const line = JSON.stringify(row) + "\n";
    if (values.out) {
      await mkdir(dirname(values.out), { recursive: true });
      await appendFile(values.out, line);
    } else process.stdout.write(line);
  };
  if (!values.run) {
    for (const entry of selected)
      await emit({
        type: "preview",
        schemaVersion: 1,
        ...selection,
        case: entry.id,
        samples,
        maxSteps,
        promptHash: promptHash(entry),
        prompt: promptFor(entry),
        source: entry.source,
      });
    return;
  }
  const client = createAiClient();
  let failures = 0;
  try {
    for (const entry of selected)
      for (let sample = 1; sample <= samples; sample++) {
        const started = performance.now();
        const base = {
          type: "result",
          schemaVersion: 1,
          ...selection,
          case: entry.id,
          sample,
          maxSteps,
          promptHash: promptHash(entry),
          source: entry.source,
        };
        try {
          const result = await evaluate(entry, selection, client, maxSteps);
          if (!result.passed) failures++;
          const previous = baseline.filter(
            (row) => row.case === entry.id && row.status !== "error",
          );
          await emit({
            ...base,
            status: result.passed ? "pass" : "fail",
            ...result,
            elapsedMs: performance.now() - started,
            baseline: previous.length
              ? {
                  samples: previous.length,
                  passed: previous.filter((row) => row.status === "pass").length,
                }
              : null,
          });
        } catch (error) {
          failures++;
          await emit({
            ...base,
            status: "error",
            code:
              error instanceof EvalRequestError || error instanceof AiError
                ? error.code
                : "EVAL_INFRASTRUCTURE_ERROR",
            ...(error instanceof EvalRequestError ? { usage: error.usage } : {}),
            elapsedMs: performance.now() - started,
          });
        }
      }
  } finally {
    client.close();
  }
  if (failures) process.exitCode = 1;
}
void main().catch(() => {
  process.stderr.write("EVAL_CONFIGURATION_ERROR: check flags and baseline file\n");
  process.exitCode = 2;
});
