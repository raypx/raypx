# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Individual developers who work across authorized local projects, Agent sessions, project references, automations and terminals. Desktop is their complete workspace; Web provides optional remote access, including from phone browsers. Each local profile has one Owner and one execution Host. A first sign-in binds the local instance to one account and server origin. Registered instances continue offline without an active account session.

## Product Purpose

Raypx is a project-centered personal development workbench. The primary flow is open a project, start or continue a session, answer requests, and inspect the result. A project represents one authorized directory on one computer. Desktop restores the most recent valid local project or guides the person through directory authorization, Agent detection and their first message. Opening a page or restoring a draft never starts execution. Web opens authorized remote projects after login; account details have their own page.

## Positioning

Local work stays on the device unless that person explicitly opts a host in. Device-owned tasks and drafts are never uploaded automatically, including when remote access is enabled. The account registers the instance and separately connects computers and remote approvals. Registration uploads only device identity metadata and never transfers local work.

## Operating Context

Web runs in desktop and phone browsers. Desktop runs on macOS and Windows through a system web view and the bundled CLI. Linux keeps the CLI without a claim of complete Desktop acceptance. People authorize local directories, run Cron automations and terminals, and run local or opted-in remote Claude and Codex tasks. Device-owned Pi tasks run through Desktop and the public task CLI. Remote Agent tasks and approvals synchronize between Web and opted-in hosts. The local setup guide authorizes a project, checks installed agent capabilities, and opens the task editor without starting work.

## Capabilities and Constraints

Email and password accounts, verification and reset, theme, English and Chinese, local files, Cron automations, terminals, and local or opted-in remote Claude and Codex tasks are in this release. Local Pi tasks add model selection, device defaults, approved file/command tools and deliberate model changes between Runs. Verified administrators can manage site identity, registration, background cleanup and the fixed member/admin account assignments in Web. Administrators cannot change their own role.

Guests can browse, change preferences, and prepare session drafts. Local projects, sessions, requests and tools require first-time instance registration. After registration they remain usable offline and after online logout. Remote history, computer connections, execution and approvals require login. After login, return to the original page and restore drafts without sending them. Local runtime state and device preferences survive logout.

New Desktop local tasks and drafts belong to the current device workspace across login and logout. Another account or server origin cannot take over that profile. Old account-owned local workspaces and automatic data migration are unsupported. Memory and task templates have explicit device or account ownership and immutable versions. Tasks use only user-selected references and keep their captured context after later edits.

macOS and Windows Desktop Quit leaves the independent CLI daemon and Agent tasks running. Explicit logout or revoke cancels affected remote work and preserves device-owned tasks. Stopping the daemon cancels owned work. Recovery after a host or OS restart is a separate capability.

macOS can install Claude and Codex terminal hooks. Per-project Away mode forwards validated Bash approvals to a registered local Desktop without an active online session. The visible, unminimized Desktop holds a 15-second approval lease. Hidden, minimized, or Quit releases it. Cloud terminal sharing needs a separate explicit project scope inside the local scope. A qualified cloud channel can continue while Desktop is closed. Timeout or unavailability returns control to the terminal. This release does not support simultaneous native-terminal answers. Terminal outputs and full session streams are not synchronized. This remains a plaintext private test feature until content protection is complete.

The CLI, application features, and shared contracts use Bun and TypeScript. Desktop uses a MyGo policy host and system WKWebView or WebView2. Native development and packaging require Go 1.27.3. The standalone CLI retains its embedded Bun runtime. macOS and Windows Desktop builds are checked in CI. Windows terminal hooks still await a packaged acceptance run.

Retired business projects, research, cloud file delivery, and custom role definitions stay outside this scope. Configuration sync, local Web, a standalone Server, native mobile, team ownership, and additional providers remain separate deliveries. Signing in enables none of them. Shared packages are added only when a real consumer needs them.

Show real execution, permission failures, and retry state. Never fabricate data.

## Brand Commitments

The product name is Raypx. Keep the original brand mark and the neutral light and dark visual system.

## Evidence on Hand

The working Web and Desktop interfaces, their copy, and the original logo are in this repository. There are no testimonials, case studies, press mentions, or pricing claims to reuse. Do not invent them.

## Product Principles

- Organize work by project and describe Agent work records as sessions in the interface. Existing execution and parent/child continuation semantics remain unchanged.
- An execution target includes ownership scope, computer and project. Missing authorization or an offline computer is an explicit state, never a reason to switch directories.
- Keep unsent text and selected reference revisions isolated by project and owner. List pagination filters the project before limiting records.
- Project tools default to that authorized directory. General references are explicitly labelled; unassigned automations remain available in global management.
- Register each local instance once. Keep its signed identity and local history through logout; permit offline work. Remote data and Host grants require a separate online session. Instance revocation blocks and cancels local execution after a successful sync.
- Device-owned work stays on the device. Nothing local is uploaded automatically.
- Show real execution, failures, and retry state. Never fabricate data.
- Tasks keep the references and context the user selected. Later edits do not rewrite that capture.
- Add a shared package only when a real consumer needs it.

## Accessibility & Inclusion

English and Chinese are both first-class. Web layouts must remain usable in phone browsers, with long copy in either language.
