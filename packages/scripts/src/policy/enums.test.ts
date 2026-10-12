import { describe, expect, it } from "vite-plus/test";
import {
  projectStagesV2,
  projectMemberRolesV2,
  organizationRolesV2,
  membershipStatusesV2,
  taskStatusesV2,
  reviewStatusesV2,
  type CloudTaskStatus,
  type CloudRunStatus,
  type CloudToolExecution,
  type CloudCommand,
} from "@voidmix/core";
import {
  projectStageV2Schema,
  projectMemberRoleV2Schema,
  organizationRoleV2Schema,
  projectMemberV2Schema,
  organizationMemberV2Schema,
  projectTaskStatusV2Schema,
  reviewStatusV2Schema,
  cloudTaskStatusSchema,
  cloudRunStatusSchema,
  cloudToolExecutionSchema,
  cloudCommandSchema,
} from "@voidmix/contracts";
import {
  projectStageEnum,
  v2ProjectMemberRoleEnum,
  organizationRoleEnum,
  v2ProjectMemberStatusEnum,
  organizationMembershipStatusEnum,
  projectTaskStatusEnum,
  v2ReviewStatusEnum,
  cloudTaskStatusEnum,
  cloudRunStatusEnum,
  cloudToolStatusEnum,
  cloudCommandStatusEnum,
} from "@voidmix/db/schema";
const cloudTasks = {
  open: true,
  in_progress: true,
  waiting_input: true,
  review: true,
  completed: true,
  cancelled: true,
} satisfies Record<CloudTaskStatus, true>;
const cloudRuns = {
  queued: true,
  running: true,
  needs_input: true,
  succeeded: true,
  failed: true,
  cancelled: true,
} satisfies Record<CloudRunStatus, true>;
const cloudTools = {
  running: true,
  succeeded: true,
  failed: true,
  cancelled: true,
} satisfies Record<CloudToolExecution["status"], true>;
const cloudCommands = { pending: true, applied: true, rejected: true } satisfies Record<
  CloudCommand["status"],
  true
>;
describe("Core/Contracts/PostgreSQL enum parity", () => {
  it.each([
    ["project stage", projectStagesV2, projectStageV2Schema.options, projectStageEnum.enumValues],
    [
      "project role",
      projectMemberRolesV2,
      projectMemberRoleV2Schema.options,
      v2ProjectMemberRoleEnum.enumValues,
    ],
    [
      "organization role",
      organizationRolesV2,
      organizationRoleV2Schema.options,
      organizationRoleEnum.enumValues,
    ],
    [
      "project membership",
      membershipStatusesV2,
      projectMemberV2Schema.shape.status.options,
      v2ProjectMemberStatusEnum.enumValues,
    ],
    [
      "organization membership",
      membershipStatusesV2,
      organizationMemberV2Schema.shape.status.options,
      organizationMembershipStatusEnum.enumValues,
    ],
    [
      "task status",
      taskStatusesV2,
      projectTaskStatusV2Schema.options,
      projectTaskStatusEnum.enumValues,
    ],
    [
      "review status",
      reviewStatusesV2,
      reviewStatusV2Schema.options,
      v2ReviewStatusEnum.enumValues,
    ],
    [
      "cloud task",
      Object.keys(cloudTasks),
      cloudTaskStatusSchema.options,
      cloudTaskStatusEnum.enumValues,
    ],
    [
      "cloud run",
      Object.keys(cloudRuns),
      cloudRunStatusSchema.options,
      cloudRunStatusEnum.enumValues,
    ],
    [
      "cloud tool",
      Object.keys(cloudTools),
      cloudToolExecutionSchema.shape.status.options,
      cloudToolStatusEnum.enumValues,
    ],
    [
      "cloud command",
      Object.keys(cloudCommands),
      cloudCommandSchema.shape.status.options,
      cloudCommandStatusEnum.enumValues,
    ],
  ])("keeps %s identical", (_name, core, contract, db) => {
    expect(new Set(contract)).toEqual(new Set(core));
    expect(new Set(db)).toEqual(new Set(core));
  });
});
