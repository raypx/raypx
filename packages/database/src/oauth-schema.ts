import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export function oauthTables(user: { id: AnyPgColumn }, session: { id: AnyPgColumn }) {
  const jwks = pgTable("jwks", {
    id: text().primaryKey(),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: date("created_at").notNull(),
    expiresAt: date("expires_at"),
    alg: text(),
    crv: text(),
  });
  const oauthClient = pgTable(
    "oauth_client",
    {
      id: text().primaryKey(),
      clientId: text("client_id").notNull().unique(),
      clientSecret: text("client_secret"),
      clientDiscoveryId: text("client_discovery_id"),
      disabled: boolean().default(false),
      skipConsent: boolean("skip_consent"),
      enableEndSession: boolean("enable_end_session"),
      subjectType: text("subject_type"),
      scopes: text().array(),
      clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
      userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
      createdAt: date("created_at"),
      updatedAt: date("updated_at"),
      name: text(),
      uri: text(),
      icon: text(),
      contacts: text().array(),
      tos: text(),
      policy: text(),
      softwareId: text("software_id"),
      softwareVersion: text("software_version"),
      softwareStatement: text("software_statement"),
      redirectUris: text("redirect_uris").array().notNull(),
      postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
      backchannelLogoutUri: text("backchannel_logout_uri"),
      backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
      tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
      applicationType: text("application_type"),
      jwks: text(),
      jwksUri: text("jwks_uri"),
      grantTypes: text("grant_types").array(),
      responseTypes: text("response_types").array(),
      requirePKCE: boolean("require_pkce"),
      dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
      referenceId: text("reference_id"),
      metadata: jsonb(),
    },
    (table) => [index("oauth_client_user_idx").on(table.userId)],
  );
  const oauthResource = pgTable("oauth_resource", {
    id: text().primaryKey(),
    identifier: text().notNull().unique(),
    name: text().notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes").array(),
    customClaims: jsonb("custom_claims"),
    dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
    disabled: boolean().default(false),
    createdAt: date("created_at"),
    updatedAt: date("updated_at"),
    policyVersion: integer("policy_version").default(1),
    metadata: jsonb(),
  });
  const client = () =>
    text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" });
  const oauthClientResource = pgTable(
    "oauth_client_resource",
    {
      id: text().primaryKey(),
      clientId: client(),
      resourceId: text("resource_id")
        .notNull()
        .references(() => oauthResource.identifier, { onDelete: "cascade" }),
      metadata: jsonb(),
      createdAt: date("created_at"),
    },
    (table) => [
      uniqueIndex("oauth_client_resource_pair_idx").on(table.clientId, table.resourceId),
      index("oauth_client_resource_resource_idx").on(table.resourceId),
    ],
  );
  const tokenFields = () => ({
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: client(),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text().array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: date("expires_at").notNull(),
    createdAt: date("created_at").notNull(),
    revoked: date("revoked"),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  });
  const oauthRefreshToken = pgTable(
    "oauth_refresh_token",
    {
      ...tokenFields(),
      userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      rotatedAt: date("rotated_at"),
      rotationReplayResponse: text("rotation_replay_response"),
      rotationReplayExpiresAt: date("rotation_replay_expires_at"),
      authTime: date("auth_time"),
    },
    (table) => [
      index("oauth_refresh_token_client_idx").on(table.clientId),
      index("oauth_refresh_token_session_idx").on(table.sessionId),
      index("oauth_refresh_token_user_idx").on(table.userId),
      index("oauth_refresh_token_code_idx").on(table.authorizationCodeId),
    ],
  );
  const oauthAccessToken = pgTable(
    "oauth_access_token",
    {
      ...tokenFields(),
      userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
      refreshId: text("refresh_id").references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    },
    (table) => [
      index("oauth_access_token_client_idx").on(table.clientId),
      index("oauth_access_token_session_idx").on(table.sessionId),
      index("oauth_access_token_user_idx").on(table.userId),
      index("oauth_access_token_code_idx").on(table.authorizationCodeId),
      index("oauth_access_token_refresh_idx").on(table.refreshId),
      index("oauth_access_token_expiry_idx").on(table.expiresAt),
    ],
  );
  const oauthConsent = pgTable(
    "oauth_consent",
    {
      id: text().primaryKey(),
      clientId: client(),
      userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
      referenceId: text("reference_id"),
      resources: text().array(),
      requestedUserInfoClaims: text("requested_user_info_claims").array(),
      scopes: text().array().notNull(),
      createdAt: date("created_at"),
      updatedAt: date("updated_at"),
    },
    (table) => [
      index("oauth_consent_client_user_idx").on(table.clientId, table.userId),
      index("oauth_consent_user_idx").on(table.userId),
    ],
  );
  const oauthClientAssertion = pgTable("oauth_client_assertion", {
    id: text().primaryKey(),
    expiresAt: date("expires_at").notNull(),
  });
  return {
    jwks,
    oauthClient,
    oauthResource,
    oauthClientResource,
    oauthAccessToken,
    oauthRefreshToken,
    oauthConsent,
    oauthClientAssertion,
  };
}
