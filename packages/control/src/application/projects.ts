import type { TaskContextTarget } from "@raypx/core/tasks";
import type { ControlRepository } from "../ports.js";
import { required, ControlError } from "../records.js";
export class ControlProjects {
  constructor(private readonly repository: ControlRepository) {}
  validateContextProject(userId: string, target: TaskContextTarget) {
    return this.repository.read(userId, async (tx) => {
      const device = required(await tx.get("device", target.deviceId));
      if (device.revoked) throw new ControlError("DEVICE_REVOKED");
      required(await tx.get("project", `${device.id}:${target.projectId}`));
    });
  }
}
