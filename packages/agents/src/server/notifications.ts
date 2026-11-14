import { sql } from "drizzle-orm";
import type { Database } from "@raypx/database/connection";
import { memberNotificationsSchema } from "@raypx/core/notifications";
import { SpaceNotFound } from "@raypx/core/spaces";
import type { MemberNotificationsService } from "../notifications.js";

/** The feed is a query over authoritative sources; only read receipts are written. */
export function createMemberNotificationsService(db: Database): MemberNotificationsService {
  async function list(accountId: string) {
    const result = await db.execute(sql`
      with membership as (
        select m.space_id, s.name from space_members m join spaces s on s.id = m.space_id
        where m.account_id = ${accountId} and m.removed_at is null and s.deletion_claimed_at is null
      ), sources as (
        select a.space_id, 'approval' as kind, a.id as source_id, a.conversation_id, r.agent_id, r.id as run_id, a.created_at, 0 as priority
        from approval_requests a join membership m on m.space_id = a.space_id
        join conversation_runs r on r.space_id = a.space_id and r.conversation_id = a.conversation_id and r.id = a.run_id
        where a.member_account_id = ${accountId} and a.state = 'pending' and a.expires_at > clock_timestamp()
        union all
        select p.space_id, 'protected-input', p.id, p.conversation_id, r.agent_id, r.id, p.created_at, 0
        from protected_input_requests p join membership m on m.space_id = p.space_id
        join conversation_runs r on r.space_id = p.space_id and r.conversation_id = p.conversation_id and r.id = p.run_id
        where p.member_account_id = ${accountId} and p.state = 'pending' and p.expires_at > clock_timestamp()
        union all
        select r.space_id, case r.state when 'succeeded' then 'run-succeeded' else 'run-failed' end, r.id, r.conversation_id, r.agent_id, r.id, r.finished_at, 1
        from conversation_runs r join membership m on m.space_id = r.space_id
        where r.member_account_id = ${accountId} and r.state in ('succeeded', 'failed') and r.parent_run_id is null and r.finished_at > clock_timestamp() - interval '30 days'
        union all
        select i.space_id, 'invitation', i.id, null, null, null, i.created_at, 0
        from space_invitations i join membership m on m.space_id = i.space_id
        where i.inviter_account_id = ${accountId} and i.status = 'open' and i.expires_at > clock_timestamp()
      )
      select s.*, m.name as space_name,
        (n.read_at is null and (s.kind not in ('run-succeeded', 'run-failed') or v.viewed_at is null or v.viewed_at < s.created_at)) as unread
      from sources s join membership m on m.space_id = s.space_id
      left join member_notification_reads n on n.space_id = s.space_id and n.account_id = ${accountId} and n.kind = s.kind and n.source_id = s.source_id
      left join member_conversation_views v on v.space_id = s.space_id and v.account_id = ${accountId} and v.conversation_id = s.conversation_id
      order by s.priority, s.created_at desc, s.space_id, s.kind, s.source_id limit 101
    `);
    const rows = result as unknown as Record<string, unknown>[];
    return memberNotificationsSchema.parse({
      items: rows.slice(0, 100).map((row) => ({
        spaceId: row.space_id,
        kind: row.kind,
        sourceId: row.source_id,
        conversationId: row.conversation_id,
        agentId: row.agent_id,
        runId: row.run_id,
        spaceName: row.space_name,
        createdAt: new Date(row.created_at as string).toISOString(),
        unread: row.unread,
      })),
      truncated: rows.length > 100,
    });
  }
  return {
    list,
    async read(accountId, key) {
      // A receipt is accepted only for a currently visible, freshly admitted source.
      const current = await list(accountId);
      if (
        !current.items.some(
          (item) =>
            item.spaceId === key.spaceId &&
            item.kind === key.kind &&
            item.sourceId === key.sourceId,
        )
      )
        throw new SpaceNotFound();
      await db.execute(sql`insert into member_notification_reads (space_id, account_id, kind, source_id, read_at)
        select ${key.spaceId}, ${accountId}, ${key.kind}, ${key.sourceId}, clock_timestamp()
        from space_members m join spaces s on s.id = m.space_id where m.space_id = ${key.spaceId} and m.account_id = ${accountId} and m.removed_at is null and s.deletion_claimed_at is null
        on conflict (space_id, account_id, kind, source_id) do update set read_at = excluded.read_at`);
      return { ok: true };
    },
    async viewed(scope, conversationId) {
      await db.execute(sql`insert into member_conversation_views (space_id, account_id, conversation_id, viewed_at)
        select ${scope.spaceId}, ${scope.member.accountId}, ${conversationId}, clock_timestamp()
        from space_members m join spaces s on s.id = m.space_id join conversations c on c.space_id = m.space_id and c.id = ${conversationId}
        where m.space_id = ${scope.spaceId} and m.account_id = ${scope.member.accountId} and m.removed_at is null and s.deletion_claimed_at is null
        on conflict (space_id, account_id, conversation_id) do update set viewed_at = excluded.viewed_at`);
      return { ok: true };
    },
  };
}
