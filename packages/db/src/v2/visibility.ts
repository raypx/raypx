import { sql, type AnyColumn } from "drizzle-orm";
import { v2Projects, v2ProjectMembers, organizationMembers } from "../schema.js";
/** Read visibility mirrors resolveProjectAccessV2; parity is tested against Core. */
export function projectVisibility(actorId: string) {
  const member = sql`select 1 from ${v2ProjectMembers} where ${v2ProjectMembers.projectId} = ${v2Projects.id} and ${v2ProjectMembers.userId} = ${actorId}`;
  return sql`(
    ${v2Projects.personalOwnerId} = ${actorId}
    or (${v2Projects.personalOwnerId} is not null and exists (${member} and ${v2ProjectMembers.status} = 'active'))
    or (${v2Projects.organizationId} is not null
      and exists (select 1 from ${organizationMembers} where ${organizationMembers.organizationId} = ${v2Projects.organizationId} and ${organizationMembers.userId} = ${actorId} and ${organizationMembers.status} = 'active')
      and not exists (${member} and ${v2ProjectMembers.status} = 'removed'))
  )`;
}
export function resourceVisibility(actorId: string, projectId: AnyColumn) {
  return sql`exists (select 1 from ${v2Projects} where ${v2Projects.id} = ${projectId} and ${projectVisibility(actorId)})`;
}
