import { describe, expect, it } from "vitest";
import { demoStage, isPreviewStep, nextStep, previewSteps } from "./demo-playback.js";

describe("homepage demo playback", () => {
  it("cycles through the steps in order", () => {
    expect(previewSteps.map(nextStep)).toEqual(["review", "result", "session"]);
    expect(isPreviewStep("review")).toBe(true);
    expect(isPreviewStep("deploy")).toBe(false);
  });

  it("shows complete still frames, with review still waiting for an answer", () => {
    for (const step of previewSteps) {
      expect(demoStage(step, null, 12)).toEqual({
        typed: 12,
        agent: "done",
        approval: "waiting",
        resultRows: 2,
      });
    }
  });

  it("types the prompt before the agent works and finishes", () => {
    expect(demoStage("session", 0, 10)).toMatchObject({ typed: 0, agent: "hidden" });
    expect(demoStage("session", 0.2, 10)).toMatchObject({ typed: 5, agent: "hidden" });
    expect(demoStage("session", 0.6, 10)).toMatchObject({ typed: 10, agent: "working" });
    expect(demoStage("session", 1, 10)).toMatchObject({ typed: 10, agent: "done" });
  });

  it("presses approve before showing the approved state", () => {
    expect(demoStage("review", 0.3, 10).approval).toBe("waiting");
    expect(demoStage("review", 0.6, 10).approval).toBe("pressing");
    expect(demoStage("review", 0.9, 10).approval).toBe("approved");
  });

  it("reveals result rows one at a time", () => {
    expect([0, 0.2, 0.5].map((progress) => demoStage("result", progress, 10).resultRows)).toEqual([
      0, 1, 2,
    ]);
  });
});
