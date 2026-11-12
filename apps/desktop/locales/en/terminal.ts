export default {
  resume: "Resume terminal",
  disconnected: "Connection lost",
  openDefault: "Open terminal in this project",
  advanced: "Advanced options",
  defaultShell: "Use system default shell",
  start: "Open terminal",
  stop: "Close terminal",
  empty: "Ready when you are",
  emptyHint: "Open a terminal in this project, or choose a working directory in Advanced options.",
  running: "Session running",
  finished: "Session exited",
  permissionHint: "This process uses your operating system permissions.",
  hook: {
    symlink:
      "Your hook settings are managed by dotfiles. Add the Raypx hook to the symlink target manually; the link is preserved.",
    settingsConflict:
      "Review your agent's hook settings, then refresh this page. Raypx preserves edited or unrecognized settings.",
    busy: "Another installation is running. Wait for it to finish, then retry.",
    permission: "Raypx cannot write the hook files. Check directory permissions, then retry.",
    downgrade: "A newer hook is installed. Use the newer Desktop version to update it.",
    unsupported: "Hook installation currently requires the macOS desktop app.",
    binaryConflict:
      "The hook program was changed outside Raypx. Review the file before replacing it.",
    timeout:
      "The operation timed out and its outcome is unconfirmed. Refresh the status before retrying.",
    replace: "Back up and replace hook",
    replaceHint:
      "Raypx will preserve the changed program beside the installed file, then replace it with the trusted bundled version. Agent hook settings will be preserved.",
    replaceConfirm: "Back up and replace",
    desktopRequired:
      "Open the current Desktop version to repair this hook. The modified program cannot replace itself.",
    update: "Update hook binary",
    repair: "Repair hook",
    repairHint:
      "The hook binary is missing or cannot run. Repair it to restore terminal approvals.",
    install: "Install hook",
    uninstall: "Remove hook",
    installed: "Hook installed",
    notInstalled: "Hook not installed",
    trust:
      "After installation, review and trust Raypx in Codex /hooks. Restart the agent session to load the hook.",
  },
  settings: {
    failed: "Could not complete this action. Refresh the status before retrying.",
    cloud: "Sync terminal approvals to this account",
    cloudHint:
      "Explicitly share new requests from selected local projects. Signing in does not upload local history or enable remote execution.",
    title: "Terminal connections",
    hint: "Connect new Claude and Codex sessions. Authorize each project separately; tool inputs are stored in plain text on your selected server during private testing.",
    away: "Away mode",
    awayHint:
      "Terminal requests wait for Raypx while Away is on. This window must remain visible and not minimized, or an authorized cloud channel must be online. Disconnection or timeout returns control to the terminal.",
    wait: "Wait before returning to terminal",
    project: "Sync terminal requests for {name}",
    noProjects: "Enable a project above, then choose which terminal requests to sync.",
    upgrade: "Managed sessions remain available. Upgrade your server to enable terminal approvals.",
    save: "Save terminal settings",
    saved: "Terminal settings saved.",
  },
} as const;
