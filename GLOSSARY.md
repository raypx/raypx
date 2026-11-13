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

**Space / 空间** (planned, [ADR 0065](docs/architecture/0065-spaces-and-sandbox-computers.md)):
The authorization boundary that holds projects, sessions, memory, automations and computers. A device Space belongs to one local profile; a shared Space belongs to the server and has members.
_Avoid_: Workspace, organization, team as synonyms for Space

**Computer / 电脑** (planned, [ADR 0065](docs/architecture/0065-spaces-and-sandbox-computers.md)):
The place where a Run's tools execute: the registered device, a Docker container or a hosted sandbox. The Agent runtime stays outside it.
_Avoid_: Sandbox as a synonym for the host path, which gives no isolation
