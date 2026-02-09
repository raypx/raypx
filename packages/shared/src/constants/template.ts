/**
 * Constants Definition Template File
 *
 * This file demonstrates how to define constants according to project standards
 * In actual use, please adjust the content according to specific requirements
 */

// ==================== Import Statements ====================

import { z } from "zod";

// ==================== Type Definitions ====================

/** User role type */
export type UserRole = "admin" | "user" | "guest";

/** API response status type */
export type ApiStatus = "success" | "error" | "loading";

// ==================== Basic Constants ====================

/** Maximum retry attempts */
export const MAX_RETRY_ATTEMPTS = 3;

/** Default timeout in milliseconds */
export const DEFAULT_TIMEOUT_MS = 5000;

/** Default pagination size */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum pagination size */
export const MAX_PAGE_SIZE = 100;

// ==================== Environment Variable Constants ====================

/** API base URL, retrieved from environment variable */
export const API_BASE_URL = process.env.VITE_API_URL || "http://localhost:3000";

/** Database connection string */
export const DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/raypx";

/** JWT secret */
export const JWT_SECRET = process.env.JWT_SECRET;

// ==================== Object Constants ====================

/** User role constants */
export const UserRole = {
  /** Administrator */
  ADMIN: "admin",
  /** Regular user */
  USER: "user",
  /** Guest */
  GUEST: "guest",
} as const;

/** API status constants */
export const ApiStatus = {
  /** Success */
  SUCCESS: "success",
  /** Error */
  ERROR: "error",
  /** Loading */
  LOADING: "loading",
} as const;

/** HTTP status code constants */
export const HttpStatus = {
  /** OK */
  OK: 200,
  /** Created */
  CREATED: 201,
  /** No Content */
  NO_CONTENT: 204,
  /** Not Found */
  NOT_FOUND: 404,
  /** Internal Server Error */
  INTERNAL_SERVER_ERROR: 500,
} as const;

/** File type constants */
export const FileType = {
  /** Image */
  IMAGE: "image",
  /** Document */
  DOCUMENT: "document",
  /** Video */
  VIDEO: "video",
  /** Audio */
  AUDIO: "audio",
} as const;

// ==================== Array Constants ====================

/** Supported user roles list */
export const USER_ROLES = Object.values(UserRole);

/** Supported API statuses list */
export const API_STATUSES = Object.values(ApiStatus);

/** Supported file types list */
export const FILE_TYPES = Object.values(FileType);

/** Supported languages list */
export const SUPPORTED_LANGUAGES = ["en", "zh", "ja", "ko"] as const;

// ==================== Complex Object Constants ====================

/** Email configuration constants */
export const EmailConfig = {
  /** Default sender */
  DEFAULT_FROM: "noreply@raypx.com",
  /** Support email address */
  SUPPORT_EMAIL: "support@raypx.com",
  /** Maximum recipients count */
  MAX_RECIPIENTS: 100,
  /** Email template path */
  TEMPLATE_PATH: "/templates/emails",
} as const;

/** Cache configuration constants */
export const CacheConfig = {
  /** Default TTL in seconds */
  DEFAULT_TTL: 3600,
  /** Maximum cache size */
  MAX_SIZE: 1000,
  /** Cache key prefix */
  KEY_PREFIX: "raypx:",
} as const;

// ==================== Validation Schema Constants ====================

/** User creation validation schema */
export const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(USER_ROLES),
});

/** Pagination query validation schema */
export const PaginationSchema = z.object({
  page: z.number().min(1).default(1),
  size: z.number().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

// ==================== Type Exports ====================

/** User role value type */
export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

/** API status value type */
export type ApiStatusValue = (typeof ApiStatus)[keyof typeof ApiStatus];

/** HTTP status code value type */
export type HttpStatusValue = (typeof HttpStatus)[keyof typeof HttpStatus];

/** File type value type */
export type FileTypeValue = (typeof FileType)[keyof typeof FileType];

/** Supported language type */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Email configuration type */
export type EmailConfigValue = (typeof EmailConfig)[keyof typeof EmailConfig];

/** Cache configuration type */
export type CacheConfigValue = (typeof CacheConfig)[keyof typeof CacheConfig];

// ==================== Utility Functions ====================

/**
 * Check if user role is valid
 * @param role User role
 * @returns Whether the role is valid
 */
export const isValidUserRole = (role: unknown): role is UserRole => {
  return typeof role === "string" && USER_ROLES.includes(role as UserRole);
};

/**
 * Check if API status is valid
 * @param status API status
 * @returns Whether the status is valid
 */
export const isValidApiStatus = (status: unknown): status is ApiStatus => {
  return typeof status === "string" && API_STATUSES.includes(status as ApiStatus);
};

/**
 * Check if file type is valid
 * @param fileType File type
 * @returns Whether the file type is valid
 */
export const isValidFileType = (fileType: unknown): fileType is FileTypeValue => {
  return typeof fileType === "string" && FILE_TYPES.includes(fileType as FileTypeValue);
};

/**
 * Get user role display name
 * @param role User role
 * @returns Display name
 */
export const getUserRoleDisplayName = (role: UserRole): string => {
  const displayNames: Record<UserRole, string> = {
    admin: "Administrator",
    user: "User",
    guest: "Guest",
  };
  return displayNames[role];
};

/**
 * Get API status display name
 * @param status API status
 * @returns Display name
 */
export const getApiStatusDisplayName = (status: ApiStatus): string => {
  const displayNames: Record<ApiStatus, string> = {
    success: "Success",
    error: "Error",
    loading: "Loading",
  };
  return displayNames[status];
};
