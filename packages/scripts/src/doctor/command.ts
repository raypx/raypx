import { defineCommand } from "citty";

import { runCliAction } from "../runtime/action.js";

export const doctorCommand = defineCommand({
  meta: { name: "doctor", description: "Check repository development prerequisites" },
  async run() {
    await runCliAction("doctor", async () => {
      const [{ createDoctorDependencies }, { renderDoctorReport }, { runDoctor }] =
        await Promise.all([import("./runtime.js"), import("./report.js"), import("./checks.js")]);
      const report = await runDoctor(createDoctorDependencies());
      console.log(renderDoctorReport(report));
      if (report.errors > 0) process.exitCode = 1;
    });
  },
});
