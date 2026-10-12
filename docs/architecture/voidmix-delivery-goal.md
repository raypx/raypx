# VoidMix delivery goal

> Status: active product and implementation target, September 11, 2026.

VoidMix is a cross-platform AI workbench whose execution core is Pi. A user
authorizes a local project in Desktop, asks for work in natural language, and
lets PM, Dev, Designer, QA, and Data Agents collaborate through a visible
conversation. Web is the cloud-synchronised control room: it shows truthful
progress, lets a permitted teammate adjust future steps, sends remote commands,
and manages recurring work. The same project, task, Agent, event, artifact, and
permission vocabulary must work on both surfaces.

## Product outcome

The shipped loop is:

```text
Sign in → bind local folder in Desktop → choose workflow and Agent roles
→ Pi runs authorised tools/model → event stream becomes conversation + files
→ cloud stores resumable state → Web monitors, adjusts, shares, or schedules
→ Desktop receives authorised remote work → results sync back to the project
```

Pi owns sessions, model runtime, tools, cancellation, steering, and execution
events. VoidMix owns authorization, workflow orchestration, durable state,
cloud sync, device targeting, scheduling, team permissions, artifacts, and both
UI surfaces. Missing credentials, runner, IM integration, billing provider, or
device route is a visible `unavailable`/`not configured` state; preview data is
labelled and never presented as a live run.

## Scope and acceptance

### Desktop execution surface

- Authorize and revoke a canonical local project path with an explicit scope
  explanation.
- Configure a Pi provider/model, tool allowlist, local model path, resource
  limits, sync policy, and offline continuation. No secret is rendered or
  logged.
- Create, steer, pause, resume, cancel, and retry a Pi session. Show provider
  errors and unavailable runner state with recovery guidance.
- Present a dense multi-panel **Agent Signal Room**: project/task header,
  role cards, conversation-style event log, step rail, terminal/tool output,
  artifact list and preview, and a composer for user messages/files/subtasks.
- Sync resumable event summaries and artifact metadata after reconnecting.
- Pause is represented by an AgentRun entering `waiting_for_approval`; resume
  returns it to `running`. The UI must label this as “Paused / waiting for
  approval” and only offer resume to a permitted actor. This keeps the
  existing lifecycle vocabulary consistent until a dedicated scheduler owns
  cooperative checkpoints.

### Web control and collaboration surface

- Provide project and global task overviews, task detail with bounded event
  timeline, device connectivity, resource usage, artifacts, and share/export.
- Permit authenticated creation and adjustment of tasks, future-step parameters,
  workflow/prompt/Agent templates, team roles, and project visibility.
- Provide remote command creation with idempotency and target-device display;
  provide scheduled daily/weekly/monthly or cron tasks with active/running/
  paused states. Unavailable dispatch is explicit, never simulated.
- A schedule record must include an owner, project/workflow, normalized
  frequency or cron expression, timezone, target device, next-run estimate,
  enabled state, and last dispatch outcome. Creating or disabling a schedule
  is durable even when no Desktop is online; dispatch then remains queued or
  unavailable until a device connects.
- Keep Web readable at desktop, tablet, and mobile widths; collapse navigation
  and stack cards below 768px without hiding task state or actions.

### Visual deliverable

- Public/product entry screens communicate “natural language in, useful work
  out” with a short headline, clear primary/secondary CTA, restrained
  blue-violet-cyan signal, and a real product-stage preview. Include capability
  modules for AI websites, web apps, landing/H5, mini-programs, PPT, and data
  visualisation; include use cases, community/skill-market entry, trust proof,
  final CTA, and footer navigation where the surface is marketing.
- Desktop defaults to a deep void theme; Web defaults to a light cloud theme.
  Both share type, iconography, role colors, state labels, focus behavior, and
  terminology. See [the design contract](./design.md) and `DESIGN.md` for
  tokens and component states.
- The visual hierarchy is high-density but calm: structural borders and tonal
  layers at rest, limited shadows, role-colored event accents, and motion only
  for live activity, arrival, progress, or direct feedback. Every state has
  text/icon support, keyboard focus, WCAG 2.2 AA contrast, and a reduced-motion
  path.

## Delivery order

1. Keep the core contracts and Pi adapter truthful; add durable events and
   lifecycle transitions before polishing views.
2. Close Desktop local runner/sidecar and authorized-resource seams; verify
   native commands and offline/reconnect behavior.
3. Close Web task, device, remote, schedule, team, template, artifact, and
   usage surfaces against authenticated API contracts.
4. Apply the visual contract to shared primitives and page compositions; run
   responsive, keyboard, reduced-motion, and visual detector checks.
5. Run workspace checks, `bun run verify`, and available browser/native probes.
   Record unavailable external credentials or integrations as limitations.

## Definition of done

The loop above is executable with a configured Pi provider and local runner,
or visibly and safely unavailable when that configuration is absent. A reviewer
can follow one task from Desktop input through Pi events, cloud/Web status,
remote or scheduled control, and artifact sharing. The resulting UI looks like
one VoidMix system across surfaces, communicates real state at a glance, and
does not substitute fake logs, progress, or success for missing execution.

### Desktop 离线恢复同步（已实现基础闭环）

Desktop 将 Pi 运行产生的进度/产物元数据写入版本化 localStorage outbox；网络不可用时仅保留本地队列，任务本地执行不因云端不可达而停止。恢复连接后由认证同步适配器按 FIFO 发送并逐条删除成功项；失败项保留 `attempts/status/lastError`，下次连接可重试。文件内容仍需后端上传适配器配置后同步，客户端不会伪造云端完成状态。
