import * as runner from "vitest";
const { describe } = runner;
import { computerConformance } from "../helpers/computer.js";
import { createMemoryComputerProvider } from "../../src/computer/index.js";
import { createDockerComputerProvider } from "../../src/computer/docker.js";
computerConformance("in-memory computer", createMemoryComputerProvider, runner);
describe.runIf(process.env.RAYPX_TEST_DOCKER === "1")("prepared Docker supervisor (opt-in)", () => {
  computerConformance(
    "Docker computer",
    () =>
      createDockerComputerProvider({
        url: process.env.SANDBOX_SUPERVISOR_URL ?? "",
        token: process.env.SANDBOX_SUPERVISOR_TOKEN ?? "",
      }),
    runner,
  );
});
