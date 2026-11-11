export default {
  navigation: "Legal information",
  privacy: "Privacy",
  backHome: "Back to home",
  intro: "How Raypx handles data on your computer, in your account and during remote access.",
  updated: "Last updated: November 2, 2026",
  contents: "On this page",
  openSettings: "Manage preferences",
  openAccount: "Manage account sessions",
  local: {
    title: "Local work",
    body: "Desktop projects, device-owned sessions, drafts and local execution records stay on your computer. Local tools work without a Raypx account. Signing in or enabling remote access does not automatically upload that local history.",
    detail:
      "When you send work to an Agent, the Agent may send your instructions and selected project context to its model provider. Local execution does not mean that the Agent runs its model offline.",
  },
  account: {
    title: "Account information",
    body: "Creating an account stores your email address, display name and password hash. Sign-in records can include timestamps, an IP address and browser information to support authentication and session management.",
    detail:
      "Verification and password-reset emails use the deployment's configured mail service. That service receives the recipient address and the message needed to deliver the email.",
  },
  remote: {
    title: "Remote access",
    body: "Remote access requires sign-in and explicit authorization of a computer and its projects. Remote session instructions, selected references, results, status and approval records pass through the remote services so they can be shown to your account.",
    detail:
      "The server stores account-scoped views of remote work. Remote services process this content; it is not restricted to device-local storage. Sharing terminal approval requests is a separate opt-in and does not synchronize the full terminal output or session stream.",
  },
  storage: {
    title: "Cookies and device storage",
    body: "Authentication uses session cookies. Theme and language preferences use cookies and device storage so they can be restored before the page renders. Diagnostics choices are also stored on the device.",
    detail:
      "Web drafts and temporary sign-in handoffs use browser storage. Signing out preserves local preferences and device-owned work. Clearing browser storage does not delete records already held by a remote deployment.",
  },
  diagnostics: {
    title: "Optional diagnostics",
    body: "Usage statistics and error reports are separate choices, both off by default. If configured for the deployment and enabled by you, diagnostics are sent to PostHog. Statistics can associate feature usage with your internal account ID; error reports are anonymous when statistics are off.",
    detail:
      "Diagnostics exclude session content, files, local paths, terminal output and credentials. Error reports use safe error codes and application code locations. Session replay and automatic interaction capture are disabled. Turning diagnostics off stops new collection; it does not delete reports already delivered.",
  },
  providers: {
    title: "Service providers",
    body: "The operator of your Raypx deployment configures its hosting, database, email and optional analytics services. The Agent or model provider you run or configure processes the inputs you send to it under its own data terms.",
    detail:
      "Which providers receive data depends on the deployment and your choices. Review their privacy information before sending project context or other sensitive content to them.",
  },
  controls: {
    title: "Your choices and retention",
    body: "Manage theme, language and diagnostics in Settings. Use Account to review and revoke other sign-in sessions. Remote authorization can be disabled or revoked separately from local work.",
    detail:
      "Signing out or revoking access does not erase stored history. Server retention, backups and deletion are managed by the operator of the deployment you use. Contact that operator about data access, deletion or privacy questions.",
  },
} as const;
