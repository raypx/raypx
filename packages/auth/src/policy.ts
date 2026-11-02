/** Shared limits for credential endpoints and account forms. Passwords are never trimmed. */
export const authPolicy = {
  nameMaxLength: 80,
  passwordMinLength: 8,
  passwordMaxLength: 128,
} as const;
