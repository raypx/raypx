export default {
  unavailableTitle: "Registration unavailable",
  registrationUnavailable: "Couldn't check whether registration is open. Try again in a moment.",
  checkingRegistration: "Checking registration availability…",
  title: "Site settings",
  intro: "Manage this deployment. Changes apply to everyone using it.",
  siteName: "Site name",
  siteNameHint: "Shown in the Web navigation. Up to 60 characters.",
  registration: "Open registration",
  registrationHint:
    "Allow new accounts to sign up. Existing accounts can still sign in when this is off.",
  cleanup: "Background cleanup",
  cleanupHint:
    "Every 15 minutes, remove sessions and verification records expired over 24 hours ago, and rate limits older than an hour.",
  jobsAvailable: "Scheduling is enabled in this deployment. This setting applies to the next run.",
  jobsDisabled:
    "Scheduling is disabled in this deployment. Set JOBS_ENABLED=true in the API environment to run cleanup. This choice will be saved.",
  save: "Save changes",
  saving: "Saving…",
  saved: "Changes saved.",
  unsaved: "Unsaved changes",
  loading: "Loading site settings",
  reload: "Load latest and keep my edits",
  forbidden: "Only a verified administrator can manage this site.",
  unavailable:
    "Site settings are unavailable. Check the API connection and database migrations, then try again.",
  conflict:
    "Another administrator changed these settings. Load the latest version before saving; your edits are still here.",
  deployment: "Deployment configuration",
  deploymentHint:
    "Database connections, secrets and administrator access are managed in the deployment environment.",
  mailReady: "Email delivery is configured.",
  mailMissing:
    "Email delivery is not configured. Registration and password reset need a mail provider.",
  closed: "Registration is closed",
  closedHint: "New accounts are not being accepted. You can still sign in to an existing account.",
} as const;
