# Raypx

Raypx organizes an individual developer's work around authorized projects and Agent sessions.

## Language

**Project / 项目**:
One authorized directory on one computer. Sessions, project references and project tools share this working context.
_Avoid_: Workspace as a synonym for project, multi-repository project

**Session / 会话**:
An Agent work record in a project, from the person's message through requests and process to a result. Continuing work preserves its relation to the earlier session.
_Avoid_: Task, Run, independent work goal

**Pending / 待处理**:
Requests requiring the person's answer, including permissions, questions, plans and terminal requests across projects.

**General Reference / 通用资料**:
A reference available across projects within its local or account ownership scope.

**General Plan / 通用计划**:
A local automation without a project association, available in global automation management.

**Space / 空间** (target, [spaces](docs/architecture/spaces.md)):
The authorization boundary that holds Agents, conversations, memory, routines, pages and computers. A Space can have members.
_Avoid_: Workspace, organization, team as synonyms for Space

**Agent / 智能体** (target, [domain](docs/architecture/domain.md)):
A persistent identity with instructions, a model choice, one continuing conversation and a computer.
_Avoid_: Bot, assistant, preset

**Run / 运行** (target, [execution](docs/architecture/execution.md)):
One unit of Agent work, started by a message, a routine, a trigger or another Agent. A retry or a resume adds an attempt to the same Run.

**Computer / 电脑** (target, [computers](docs/architecture/computers.md)):
The durable place where a Run's tools execute: a Docker container, a hosted sandbox or a granted device. The Agent runtime stays outside it.
_Avoid_: Sandbox as a synonym for a granted device, which gives no isolation
