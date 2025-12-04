import { and, asc, desc, eq, ilike, or, sql } from "@raypx/database";
import {
  configHistory as ConfigHistory,
  configNamespaces as ConfigNamespaces,
  configs as Configs,
  user as User,
} from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Value type enum for configuration values
 */
const valueTypeEnum = z.enum(["string", "number", "boolean", "json"]);

/**
 * Helper function to check if user can access a config
 * Users can access their own configs, admins can access all configs
 */
async function canAccessConfig(
  db: typeof import("@raypx/database").db,
  userId: string,
  configUserId: string,
): Promise<boolean> {
  // Users can always access their own configs
  if (userId === configUserId) {
    return true;
  }

  // Check if current user is admin
  const currentUser = await db.query.user.findFirst({
    where: eq(User.id, userId),
    columns: { role: true },
  });
  const role = currentUser?.role;
  return role === "admin" || role === "superadmin";
}

/**
 * Configs router - handles all configuration-related operations
 */
export const configsRouter = {
  // ==================== Namespaces ====================

  /**
   * List all config namespaces for the current user with pagination and search
   */
  listNamespaces: protectedProcedure
    .input(
      z
        .object({
          q: z.string().trim().min(1).max(200).optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(12),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 12;
      const offset = (page - 1) * pageSize;

      const whereConditions = [eq(ConfigNamespaces.userId, userId)];

      if (input.q) {
        const like = `%${input.q}%`;
        const searchCondition = or(
          ilike(ConfigNamespaces.name, like),
          ilike(ConfigNamespaces.description, like),
        );
        if (searchCondition) {
          whereConditions.push(searchCondition);
        }
      }

      const where = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0]!;

      const [namespaces, totalResult] = await Promise.all([
        ctx.db.query.configNamespaces.findMany({
          where,
          orderBy: [asc(ConfigNamespaces.sortOrder), asc(ConfigNamespaces.name)],
          limit: pageSize,
          offset,
        }),
        ctx.db.select({ count: sql<number>`count(*)` }).from(ConfigNamespaces).where(where),
      ]);

      const total = Number(totalResult[0]?.count ?? 0);

      return {
        items: namespaces.map((ns) => ({
          id: ns.id,
          name: ns.name,
          description: ns.description,
          icon: ns.icon,
          sortOrder: ns.sortOrder,
          createdAt: ns.createdAt,
          updatedAt: ns.updatedAt,
        })),
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Create a new config namespace
   */
  createNamespace: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).optional(),
        icon: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        const [created] = await ctx.db
          .insert(ConfigNamespaces)
          .values({
            name: input.name,
            description: input.description ?? null,
            icon: input.icon ?? null,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create namespace"));

        return {
          id: created.id,
          name: created.name,
          description: created.description,
          icon: created.icon,
          sortOrder: created.sortOrder,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "create namespace");
      }
    }),

  /**
   * Get a single namespace by ID
   */
  getNamespaceById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const namespace = await ctx.db.query.configNamespaces.findFirst({
        where: and(eq(ConfigNamespaces.id, input.id), eq(ConfigNamespaces.userId, userId)),
      });

      assertExists(namespace, () => Errors.resourceNotFound("Namespace", input.id));

      return {
        id: namespace.id,
        name: namespace.name,
        description: namespace.description,
        icon: namespace.icon,
        sortOrder: namespace.sortOrder,
        createdAt: namespace.createdAt,
        updatedAt: namespace.updatedAt,
      };
    }),

  /**
   * Update a config namespace
   */
  updateNamespace: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).optional(),
        icon: z.string().max(50).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...updateData } = input;

      const existing = await ctx.db.query.configNamespaces.findFirst({
        where: and(eq(ConfigNamespaces.id, id), eq(ConfigNamespaces.userId, userId)),
      });

      assertExists(existing, () => Errors.resourceNotFound("Namespace", id));

      try {
        const [updated] = await ctx.db
          .update(ConfigNamespaces)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(ConfigNamespaces.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("Namespace", id));

        return {
          id: updated.id,
          name: updated.name,
          description: updated.description,
          icon: updated.icon,
          sortOrder: updated.sortOrder,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "update namespace");
      }
    }),

  /**
   * Delete a config namespace (cascades to all configs in it)
   */
  deleteNamespace: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const existing = await ctx.db.query.configNamespaces.findFirst({
      where: and(eq(ConfigNamespaces.id, input), eq(ConfigNamespaces.userId, userId)),
    });

    assertExists(existing, () => Errors.resourceNotFound("Namespace", input));

    try {
      await ctx.db.delete(ConfigNamespaces).where(eq(ConfigNamespaces.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete namespace");
    }
  }),

  // ==================== Configs ====================

  /**
   * List all configs for a namespace with pagination, search, and filtering
   */
  list: protectedProcedure
    .input(
      z.object({
        namespaceId: z.string(),
        q: z.string().trim().min(1).max(200).optional(),
        sortBy: z.enum(["createdAt", "key", "updatedAt"]).default("key"),
        sortOrder: z.enum(["asc", "desc"]).default("asc"),
        valueType: z
          .union([
            z.enum(["string", "number", "boolean", "json"]),
            z.array(z.enum(["string", "number", "boolean", "json"])),
          ])
          .optional(),
        isSecret: z.boolean().optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;

      // Verify namespace belongs to user
      const namespace = await ctx.db.query.configNamespaces.findFirst({
        where: and(eq(ConfigNamespaces.id, input.namespaceId), eq(ConfigNamespaces.userId, userId)),
      });

      assertExists(namespace, () => Errors.resourceNotFound("Namespace", input.namespaceId));

      const sortByCol =
        input.sortBy === "key"
          ? Configs.key
          : input.sortBy === "updatedAt"
            ? Configs.updatedAt
            : Configs.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : asc(sortByCol);

      const whereConditions = [eq(Configs.namespaceId, input.namespaceId)];

      if (input.q) {
        const like = `%${input.q}%`;
        const searchCondition = or(
          ilike(Configs.key, like),
          ilike(Configs.description, like),
          ilike(Configs.value, like),
        );
        if (searchCondition) {
          whereConditions.push(searchCondition);
        }
      }

      if (input.valueType) {
        if (Array.isArray(input.valueType)) {
          const typeCondition = or(...input.valueType.map((type) => eq(Configs.valueType, type)));
          if (typeCondition) {
            whereConditions.push(typeCondition);
          }
        } else {
          whereConditions.push(eq(Configs.valueType, input.valueType));
        }
      }

      if (input.isSecret !== undefined) {
        whereConditions.push(eq(Configs.isSecret, input.isSecret));
      }

      const where = whereConditions.length > 1 ? and(...whereConditions) : whereConditions[0];

      const [configs, totalResult] = await Promise.all([
        ctx.db.query.configs.findMany({
          where,
          orderBy,
          limit: pageSize,
          offset,
        }),
        ctx.db.select({ count: sql<number>`count(*)` }).from(Configs).where(where),
      ]);

      const total = Number(totalResult[0]?.count ?? 0);

      return {
        items: configs.map((config) => ({
          id: config.id,
          key: config.key,
          value: config.isSecret ? "••••••••" : config.value,
          valueType: config.valueType,
          description: config.description,
          isSecret: config.isSecret,
          metadata: config.metadata,
          namespaceId: config.namespaceId,
          createdAt: config.createdAt,
          updatedAt: config.updatedAt,
        })),
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Get a single config by ID
   * Users can access their own configs, admins can access all configs
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const config = await ctx.db.query.configs.findFirst({
      where: eq(Configs.id, input.id),
    });

    assertExists(config, () => Errors.resourceNotFound("Config", input.id));

    // Check access permission
    const hasAccess = await canAccessConfig(ctx.db, userId, config.userId);
    if (!hasAccess) {
      throw Errors.accessDenied("Config", input.id);
    }

    return {
      id: config.id,
      key: config.key,
      value: config.isSecret ? "••••••••" : config.value,
      valueType: config.valueType,
      description: config.description,
      isSecret: config.isSecret,
      metadata: config.metadata,
      namespaceId: config.namespaceId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }),

  /**
   * Get config value by namespace and key (for runtime use)
   * Users can access their own configs, admins can access all configs
   */
  getValue: protectedProcedure
    .input(
      z.object({
        namespaceId: z.string(),
        key: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const config = await ctx.db.query.configs.findFirst({
        where: and(eq(Configs.namespaceId, input.namespaceId), eq(Configs.key, input.key)),
      });

      if (!config) {
        return null;
      }

      // Check access permission
      const hasAccess = await canAccessConfig(ctx.db, userId, config.userId);
      if (!hasAccess) {
        return null; // Return null instead of throwing error for runtime use
      }

      // Parse value based on type
      let parsedValue: unknown = config.value;
      if (config.value !== null) {
        switch (config.valueType) {
          case "number":
            parsedValue = Number(config.value);
            break;
          case "boolean":
            parsedValue = config.value === "true";
            break;
          case "json":
            try {
              parsedValue = JSON.parse(config.value);
            } catch {
              parsedValue = config.value;
            }
            break;
        }
      }

      return {
        key: config.key,
        value: parsedValue,
        valueType: config.valueType,
      };
    }),

  /**
   * Create a new config
   */
  create: protectedProcedure
    .input(
      z.object({
        namespaceId: z.string(),
        key: z.string().trim().min(1).max(255),
        value: z.string().optional(),
        valueType: valueTypeEnum.default("string"),
        description: z.string().trim().max(1000).optional(),
        isSecret: z.boolean().default(false),
        metadata: z.record(z.string(), z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify namespace belongs to user
      const namespace = await ctx.db.query.configNamespaces.findFirst({
        where: and(eq(ConfigNamespaces.id, input.namespaceId), eq(ConfigNamespaces.userId, userId)),
      });

      assertExists(namespace, () => Errors.resourceNotFound("Namespace", input.namespaceId));

      // Check for duplicate key in namespace
      const existingConfig = await ctx.db.query.configs.findFirst({
        where: and(eq(Configs.namespaceId, input.namespaceId), eq(Configs.key, input.key)),
      });

      if (existingConfig) {
        throw Errors.duplicateResource("Config", input.key);
      }

      try {
        const [created] = await ctx.db
          .insert(Configs)
          .values({
            key: input.key,
            value: input.value ?? null,
            valueType: input.valueType,
            description: input.description ?? null,
            isSecret: input.isSecret,
            metadata: input.metadata ?? null,
            namespaceId: input.namespaceId,
            userId,
          })
          .returning();

        assertExists(created, () => Errors.internalError("Failed to create config"));

        return {
          id: created.id,
          key: created.key,
          value: created.isSecret ? "••••••••" : created.value,
          valueType: created.valueType,
          description: created.description,
          isSecret: created.isSecret,
          metadata: created.metadata,
          namespaceId: created.namespaceId,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "create config");
      }
    }),

  /**
   * Update a config
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        key: z.string().trim().min(1).max(255).optional(),
        value: z.string().optional(),
        valueType: valueTypeEnum.optional(),
        description: z.string().trim().max(1000).optional(),
        isSecret: z.boolean().optional(),
        metadata: z.record(z.string(), z.any()).optional(),
        changeReason: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, changeReason, ...updateData } = input;

      const existing = await ctx.db.query.configs.findFirst({
        where: eq(Configs.id, id),
      });

      assertExists(existing, () => Errors.resourceNotFound("Config", id));

      // Check access permission
      const hasAccess = await canAccessConfig(ctx.db, userId, existing.userId);
      if (!hasAccess) {
        throw Errors.accessDenied("Config", id);
      }

      try {
        // Record history if value changed
        if (updateData.value !== undefined && updateData.value !== existing.value) {
          await ctx.db.insert(ConfigHistory).values({
            configId: id,
            previousValue: existing.value,
            newValue: updateData.value,
            changedBy: userId,
            changeReason: changeReason ?? null,
          });
        }

        const [updated] = await ctx.db
          .update(Configs)
          .set({ ...updateData, updatedAt: new Date() })
          .where(eq(Configs.id, id))
          .returning();

        assertExists(updated, () => Errors.resourceNotFound("Config", id));

        return {
          id: updated.id,
          key: updated.key,
          value: updated.isSecret ? "••••••••" : updated.value,
          valueType: updated.valueType,
          description: updated.description,
          isSecret: updated.isSecret,
          metadata: updated.metadata,
          namespaceId: updated.namespaceId,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        };
      } catch (error) {
        throw handleDatabaseError(error, "update config");
      }
    }),

  /**
   * Delete a config
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const existing = await ctx.db.query.configs.findFirst({
      where: eq(Configs.id, input),
    });

    assertExists(existing, () => Errors.resourceNotFound("Config", input));

    // Check access permission
    const hasAccess = await canAccessConfig(ctx.db, userId, existing.userId);
    if (!hasAccess) {
      throw Errors.accessDenied("Config", input);
    }

    try {
      await ctx.db.delete(Configs).where(eq(Configs.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete config");
    }
  }),

  /**
   * Get config history
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        configId: z.string(),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Get config
      const config = await ctx.db.query.configs.findFirst({
        where: eq(Configs.id, input.configId),
      });

      assertExists(config, () => Errors.resourceNotFound("Config", input.configId));

      // Check access permission
      const hasAccess = await canAccessConfig(ctx.db, userId, config.userId);
      if (!hasAccess) {
        throw Errors.accessDenied("Config", input.configId);
      }

      const history = await ctx.db.query.configHistory.findMany({
        where: eq(ConfigHistory.configId, input.configId),
        orderBy: desc(ConfigHistory.createdAt),
        limit: input.limit,
      });

      return history.map((h) => ({
        id: h.id,
        previousValue: config.isSecret ? "••••••••" : h.previousValue,
        newValue: config.isSecret ? "••••••••" : h.newValue,
        changeReason: h.changeReason,
        createdAt: h.createdAt,
      }));
    }),
};
