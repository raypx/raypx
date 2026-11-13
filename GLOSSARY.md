# Raypx

Raypx organizes work around persistent Agents and their continuing conversations.
The [roadmap](docs/roadmap.md) distinguishes phase 1 from later capabilities.

## Language

**Agent / 智能体**:
A persistent identity in one Space, with a name, instructions and a model choice.
Each Agent has one direct Conversation. Its Space's team computer has explicit
start/stop controls; Agent tools, memory and routines arrive later.
_Avoid_: Bot, preset, or a new Agent for each request

**Conversation / 对话**:
The Agent's one continuing thread of member messages and replies. It persists in
PostgreSQL and renders in Web and Desktop. A Run is work within the conversation,
not a new conversation. Group conversations are later work.
_Avoid_: Session or task as a synonym for the new conversation

**Space / 空间**:
The authorization boundary holding Agents and conversations. Accounts receive a
private Space and can create more. Membership records exist; invitations, member
management and sharing workflows arrive later. A Space has one team computer;
memory, routines and pages arrive later.
_Avoid_: Workspace, organization or team as synonyms for Space

**Message / 消息**:
An entry sent by a Space member into a Conversation. A phase 1 message starts a
queued Run. An Agent's completed reply is stored as a reply segment. Trigger and
Agent-to-Agent messages are later capabilities.

**Run / 运行**:
One unit of Agent work within its Conversation. Phase 1 supports message-triggered
queued, running, succeeded, failed and cancelled Runs. A second message queues
another Run. Attempts, steering, leases, checkpoints and recovery arrive later.
_Avoid_: Session as a synonym for Run, or durable execution as a phase 1 claim

**Computer / 电脑**:
A Space's durable execution environment. Members can start and stop the team
computer; current Agent replies do not use tools or approvals. `@raypx/computers`
owns lifecycle and persistence, and `@raypx/providers` owns the Computer port,
an in-memory provider and the Docker supervisor adapter. `infra/sandbox` alone
holds the Docker socket. Hosted sandboxes and granted devices are later providers.
The Agent runtime and credentials stay outside the computer.
_Avoid_: Sandbox as a synonym for a granted device, which gives no isolation

**Routine / 例行任务** (later phase):
A saved prompt that starts a Run for an Agent on a schedule or inbound trigger.
It does not refer to the retained device-owned Cron implementation.

**Memory / 记忆**:
In the target, versioned knowledge with Agent or Space scope. That capability is
later work. The retained Memory screens manage earlier device/account-owned
records and do not provide context to phase 1 replies.

**Device connector / 设备连接器** (later phase):
The future role of the CLI daemon: offer granted directories and commands on one
registered device through an outbound backend connection. It will not own Agent
execution, conversation history or scheduling. The existing daemon still does.

**Account / 账号**:
A signed-in person. Deployment roles (`member`, `admin`) and Space membership
(`owner`, `member`) have distinct authority. Deployment administration grants no
implicit Space access.

**Project / 项目** (retained implementation):
An authorized directory on one computer in the earlier device-owned product.
Project/session pages are removed from Web and the Desktop renderer; CLI and
backend implementations remain until their replacement phases.

**Session / 会话** (retained implementation):
An earlier device-owned Agent work record in a project, with its existing
continuation relationships. Also used technically for an authenticated login
session; qualify the meaning when ambiguous. Neither meaning names the new
Agent's Conversation.

**Workspace / 工作区** (engineering):
A package discovered from root `package.json` workspace patterns. A feature's
workspace view is UI composition, not an authorization boundary.
