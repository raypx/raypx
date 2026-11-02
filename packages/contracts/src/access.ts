import { z } from "zod";
import { applicationPermissions, authRoleNames } from "@raypx/auth/permissions";

export const accountRoleSchema = z.enum(["guest", ...authRoleNames]);
export type AccountRole = z.infer<typeof accountRoleSchema>;

export const accountPermissionSchema = z.enum(applicationPermissions);
export type AccountPermission = z.infer<typeof accountPermissionSchema>;

/** Safe authorization projection; identity and grants are always server-derived. */
export const accountAccessSchema = z.object({
  accountId: z.string().min(1).nullable(),
  role: accountRoleSchema,
  permissions: z.array(accountPermissionSchema),
});
export type AccountAccess = z.infer<typeof accountAccessSchema>;
