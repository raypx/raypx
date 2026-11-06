# Raypx context

- Application: a composition root under apps, never imported by another workspace.
- Library: a private ESM package with explicit public exports and platform metadata.
- Tooling: development/test automation excluded from production import graphs.
- API: Bun-hosted Hono/oRPC application composed by Nitro.
- Local engine: the bundled CLI runtime with device-local SQLite state. On macOS/Windows an independent daemon owns execution, scheduling and remote connections; Desktop is its private IPC client.
- Registered instance: a local profile bound once to one account and API origin; its signed identity permits offline work after online logout. Remote Host opt-in is separate.
- Desktop: a Tauri Rust host around the React SPA, system WebView and native policy; it launches the bundled CLI by absolute path.
- Relay: an independent ingress service that routes device messages through the private Redis broker; API owns remote read projections.
- Root grant: an opaque identifier for an explicitly authorized local directory.
- Project: one authorized directory on one computer, the working context for sessions and project tools.
- Session: an Agent work record within a project, including its request, process and result. Continuation retains the existing parent/child relation; internal AgentTask and tasks APIs keep their names.
- Automation: a five-field Cron schedule with an IANA timezone and a local action.
- Terminal: an interactive process/PTY, stopped when its owning runtime stops; GUI Quit leaves the independent daemon running.

Current [architecture](docs/architecture/README.md) defines the runtime boundaries and accepted decisions.
