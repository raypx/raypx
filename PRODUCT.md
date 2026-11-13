# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

The Desktop renderer uses the web UI stack. Desktop and CLI are the primary surfaces for local Pi sessions. Browser Web provides optional remote access for supported workflows, including from phones.

## Users

Individual developers who use an agent to inspect and change projects on their own computer. Each local profile has one Owner and one execution Host. A first sign-in binds the local instance to one account and server origin. Registered instances continue offline without an active account session.

## Product Purpose

Raypx is a personal workbench for running Pi in local projects. The primary flow is to open an authorized project, choose a model, start or continue a Pi session, respond to approval requests, and inspect the result. A project represents one authorized directory on one computer. Desktop restores the most recent valid local project or guides the person through directory authorization, Agent detection and their first message. Opening a page or restoring a draft never starts execution. Web opens authorized remote projects after login; account details have their own page.

## Positioning

Pi is the primary agent for new capabilities. Prioritize model setup, controlled project tools, review of project changes and durable session continuation on Desktop and CLI. Claude and Codex support local and opted-in remote workflows. See the [product roadmap](docs/roadmap.md) for delivery order.

The device owns Pi execution and local history. Model requests go to the endpoint selected for the Run. Device-owned tasks and drafts are never uploaded to Raypx automatically, including when remote access is enabled. The account registers the instance and separately connects computers and remote approvals. Registration uploads only device identity metadata.

## Operating Context

Web runs in desktop and phone browsers. Desktop targets macOS 13.5+ and Windows through a system web view and the bundled CLI. Linux keeps the CLI without a claim of complete Desktop acceptance. People authorize local directories, run Cron automations and terminals, and run local or opted-in remote Claude and Codex tasks. Device-owned Pi tasks run through Desktop and the public task CLI. Remote Agent tasks and approvals synchronize between Web and opted-in hosts. The local setup guide authorizes a project, checks installed agent capabilities, and opens the task editor without starting work.

## Capabilities and Constraints

Email and password accounts, verification and reset, theme, English and Chinese, local files, Cron automations, terminals, and local or opted-in remote Claude and Codex tasks are in this release. Local Pi tasks add model selection, device defaults, approved file/command tools and deliberate model changes between Runs. A finished local Pi Run shows read-only project changes from Git snapshots taken before and after it. Local Pi automations start a session from a Cron schedule, a Webhook, authenticated inbound email, a GitHub repository event or a project file change. Missed occurrences are skipped.

Accounts can also sign in with Google or GitHub when the deployment configures them, with a passkey, or with an emailed single-use code. People can link or unlink providers and protect password login with an authenticator app and backup codes. Desktop signs in and renews Host authorization through the system browser, where the person reviews the computer and the active Web account. The CLI keeps instance enrollment. Organization accounts and enterprise SSO are outside this release.

Remote session editors in Web and Desktop can attach UTF-8 text files once an administrator configures object storage. Desktop's offline session path stays device-local. Web can be installed as an app that opens the projects page. Offline, it shows a retry page and keeps no cached data.

Verified administrators can manage site identity, registration, email delivery, object storage, background cleanup and the fixed member/admin account assignments in Web. The user list supports name and email search. Administrators cannot change their own role. Web has a dedicated administration area with UTC account registration statistics, current-instance dependency status and durable role/configuration audit, including failures and refusals. Audit history is retained indefinitely; missing audit storage blocks management writes.

Guests can browse, change preferences, and prepare session drafts. Local projects, sessions, requests and tools require first-time instance registration. After registration they remain usable offline and after online logout. Remote history, computer connections, execution and approvals require login. After login, return to the original page and restore drafts without sending them. Local runtime state and device preferences survive logout.

New Desktop local tasks and drafts belong to the current device workspace across login and logout. Another account or server origin cannot take over that profile. Old account-owned local workspaces and automatic data migration are unsupported. Memory and task templates have explicit device or account ownership and immutable versions. Tasks use only user-selected references and keep their captured context after later edits.

macOS and Windows Desktop checks for active Agent tasks on Quit. The user can keep them running in the independent CLI daemon, stop the checked tasks and exit, or cancel quitting. Explicit logout or revoke cancels affected remote work and preserves device-owned tasks. Stopping the daemon cancels owned work. Recovery after a host or OS restart is a separate capability.

macOS can install Claude and Codex terminal hooks. Per-project Away mode forwards validated Bash approvals to a registered local Desktop without an active online session. The visible, unminimized Desktop holds a 15-second approval lease. Hidden, minimized, or Quit releases it. Cloud terminal sharing needs a separate explicit project scope inside the local scope. A qualified cloud channel can continue while Desktop is closed. Timeout or unavailability returns control to the terminal. This release does not support simultaneous native-terminal answers. Terminal outputs and full session streams are not synchronized. This remains a plaintext private test feature until content protection is complete.

The CLI, application features, and shared contracts use Bun and TypeScript. Desktop uses a MyGo policy host and system WKWebView or WebView2. Native development and packaging require Go 1.27.3. The standalone CLI retains its embedded Bun runtime. macOS and Windows Desktop builds are checked in CI. Windows terminal hooks still await a packaged acceptance run.

Retired business projects, research, cloud file delivery, and custom role definitions stay outside this scope. Configuration sync, local Web, a standalone Server, the complete native mobile workbench, team ownership, and additional providers remain separate deliveries. Signing in enables none of them. This document describes the earlier device-owned product that the code on this branch still implements. The [target architecture](docs/architecture/README.md) replaces it phase by phase. The Expo Mobile workspace currently implements the account/login baseline. Shared packages are added only when a real consumer needs them.

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
