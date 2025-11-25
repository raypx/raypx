import { and, desc, eq, ilike, ne, sql } from "@raypx/database";
import {
  invitation as Invitation,
  member as Member,
  organization as Organization,
  user as User,
} from "@raypx/database/schemas";
import { z } from "zod/v4";

import { Errors } from "../errors";
import { protectedProcedure } from "../trpc";
import { assertExists, handleDatabaseError } from "../utils/error-handler";

/**
 * Organizations router - handles all organization-related operations
 */
export const organizationsRouter = {
  /**
   * List organizations with search and pagination
   * Returns organizations where the user is a member
   */
  list: protectedProcedure
    .input(
      z
        .object({
          q: z.string().trim().min(1).max(200).optional(),
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(100).default(10),
          sortBy: z.enum(["createdAt", "name"]).default("createdAt"),
          sortOrder: z.enum(["asc", "desc"]).default("desc"),
        })
        .partial()
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;
      const userId = ctx.session.user.id;

      const conditions = [eq(Member.userId, userId)];

      if (input.q) {
        const like = `%${input.q}%`;
        conditions.push(ilike(Organization.name, like));
      }

      const where = and(...conditions);

      const sortByCol = input.sortBy === "name" ? Organization.name : Organization.createdAt;
      const orderBy = input.sortOrder === "desc" ? desc(sortByCol) : sortByCol;

      const [items, totalRow] = await Promise.all([
        ctx.db
          .select({
            id: Organization.id,
            name: Organization.name,
            slug: Organization.slug,
            logo: Organization.logo,
            createdAt: Organization.createdAt,
            updatedAt: Organization.updatedAt,
            metadata: Organization.metadata,
            role: Member.role,
          })
          .from(Organization)
          .innerJoin(Member, eq(Organization.id, Member.organizationId))
          .where(where as any)
          .orderBy(orderBy)
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(Organization)
          .innerJoin(Member, eq(Organization.id, Member.organizationId))
          .where(where as any)
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;
      return {
        items,
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Get a single organization by ID
   * User must be a member of the organization
   */
  byId: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const org = await ctx.db
      .select({
        id: Organization.id,
        name: Organization.name,
        slug: Organization.slug,
        logo: Organization.logo,
        createdAt: Organization.createdAt,
        updatedAt: Organization.updatedAt,
        metadata: Organization.metadata,
        role: Member.role,
      })
      .from(Organization)
      .innerJoin(Member, eq(Organization.id, Member.organizationId))
      .where(and(eq(Organization.id, input.id), eq(Member.userId, userId)))
      .then((r) => r[0]);

    assertExists(org, () => Errors.resourceNotFound("Organization", input.id));

    return org;
  }),

  /**
   * Create a new organization
   * The creator automatically becomes an admin member
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(255),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
          .optional(),
        logo: z.string().url().optional().nullable(),
        metadata: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      try {
        // Generate slug from name if not provided
        const slug =
          input.slug ||
          input.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        // Check if slug already exists
        const existing = await ctx.db.query.organization.findFirst({
          where: eq(Organization.slug, slug),
        });

        if (existing) {
          throw Errors.duplicateResource("Organization", slug);
        }

        // Create organization and add creator as admin member in a transaction
        const [org] = await ctx.db
          .insert(Organization)
          .values({
            name: input.name,
            slug,
            logo: input.logo,
            metadata: input.metadata,
          })
          .returning();

        if (!org) {
          throw Errors.databaseError("create organization");
        }

        // Add creator as admin member
        await ctx.db.insert(Member).values({
          organizationId: org.id,
          userId,
          role: "admin",
        });

        return org;
      } catch (error) {
        throw handleDatabaseError(error, "create organization");
      }
    }),

  /**
   * Update an organization
   * User must be an admin member of the organization
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(255).optional(),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens")
          .optional(),
        logo: z.string().url().optional().nullable(),
        metadata: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const { id, ...updateData } = input;

      // Check if organization exists and user is admin
      const member = await ctx.db
        .select({ role: Member.role })
        .from(Member)
        .where(and(eq(Member.organizationId, id), eq(Member.userId, userId)))
        .then((r) => r[0]);

      if (!member) {
        throw Errors.resourceNotFound("Organization", id);
      }

      if (member.role !== "admin" && member.role !== "owner") {
        throw Errors.insufficientPermissions("update", "organization");
      }

      // Check slug uniqueness if provided
      if (updateData.slug) {
        const existing = await ctx.db.query.organization.findFirst({
          where: and(eq(Organization.slug, updateData.slug), ne(Organization.id, id)),
        });

        if (existing) {
          throw Errors.duplicateResource("Organization", updateData.slug);
        }
      }

      try {
        const [updated] = await ctx.db
          .update(Organization)
          .set(updateData)
          .where(eq(Organization.id, id))
          .returning();
        return updated;
      } catch (error) {
        throw handleDatabaseError(error, "update organization");
      }
    }),

  /**
   * Delete an organization
   * User must be an admin member of the organization
   */
  delete: protectedProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    // Check if organization exists and user is admin
    const member = await ctx.db
      .select({ role: Member.role })
      .from(Member)
      .where(and(eq(Member.organizationId, input), eq(Member.userId, userId)))
      .then((r) => r[0]);

    if (!member) {
      throw Errors.resourceNotFound("Organization", input);
    }

    if (member.role !== "admin" && member.role !== "owner") {
      throw Errors.insufficientPermissions("delete", "organization");
    }

    try {
      await ctx.db.delete(Organization).where(eq(Organization.id, input));
      return { success: true, deletedId: input };
    } catch (error) {
      throw handleDatabaseError(error, "delete organization");
    }
  }),

  /**
   * List members of an organization
   * User must be a member of the organization
   */
  listMembers: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is a member
      const member = await ctx.db.query.member.findFirst({
        where: and(eq(Member.organizationId, input.organizationId), eq(Member.userId, userId)),
      });

      if (!member) {
        throw Errors.resourceNotFound("Organization", input.organizationId);
      }

      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 10;
      const offset = (page - 1) * pageSize;

      const [items, totalRow] = await Promise.all([
        ctx.db
          .select({
            id: Member.id,
            userId: Member.userId,
            role: Member.role,
            createdAt: Member.createdAt,
            updatedAt: Member.updatedAt,
            user: {
              id: User.id,
              name: User.name,
              email: User.email,
              image: User.image,
            },
          })
          .from(Member)
          .innerJoin(User, eq(Member.userId, User.id))
          .where(eq(Member.organizationId, input.organizationId))
          .orderBy(desc(Member.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ value: sql<number>`count(*)::int` })
          .from(Member)
          .where(eq(Member.organizationId, input.organizationId))
          .then((r) => r[0]),
      ]);

      const total = totalRow?.value ?? 0;
      return {
        items,
        total,
        page,
        pageSize,
      };
    }),

  /**
   * Update a member's role
   * User must be an admin member of the organization
   */
  updateMemberRole: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        memberId: z.string(),
        role: z.enum(["member", "admin", "owner"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is admin
      const adminMember = await ctx.db.query.member.findFirst({
        where: and(eq(Member.organizationId, input.organizationId), eq(Member.userId, userId)),
      });

      if (!adminMember || (adminMember.role !== "admin" && adminMember.role !== "owner")) {
        throw Errors.insufficientPermissions("update member role", "organization");
      }

      // Verify member exists
      const member = await ctx.db.query.member.findFirst({
        where: and(eq(Member.id, input.memberId), eq(Member.organizationId, input.organizationId)),
      });

      assertExists(member, () => Errors.resourceNotFound("Member", input.memberId));

      try {
        const [updated] = await ctx.db
          .update(Member)
          .set({ role: input.role })
          .where(eq(Member.id, input.memberId))
          .returning();
        return updated;
      } catch (error) {
        throw handleDatabaseError(error, "update member role");
      }
    }),

  /**
   * Remove a member from an organization
   * User must be an admin member of the organization
   */
  removeMember: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        memberId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is admin
      const adminMember = await ctx.db.query.member.findFirst({
        where: and(eq(Member.organizationId, input.organizationId), eq(Member.userId, userId)),
      });

      if (!adminMember || (adminMember.role !== "admin" && adminMember.role !== "owner")) {
        throw Errors.insufficientPermissions("remove member", "organization");
      }

      // Verify member exists
      const member = await ctx.db.query.member.findFirst({
        where: and(eq(Member.id, input.memberId), eq(Member.organizationId, input.organizationId)),
      });

      assertExists(member, () => Errors.resourceNotFound("Member", input.memberId));

      // Prevent removing yourself
      if (member.userId === userId) {
        throw Errors.operationNotAllowed(
          "remove yourself",
          "You cannot remove yourself from the organization",
        );
      }

      try {
        await ctx.db.delete(Member).where(eq(Member.id, input.memberId));
        return { success: true, removedMemberId: input.memberId };
      } catch (error) {
        throw handleDatabaseError(error, "remove member");
      }
    }),

  /**
   * List invitations for an organization
   * User must be an admin member of the organization
   */
  listInvitations: protectedProcedure
    .input(
      z.object({
        organizationId: z.string(),
        status: z.enum(["pending", "accepted", "expired"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Verify user is admin
      const adminMember = await ctx.db.query.member.findFirst({
        where: and(eq(Member.organizationId, input.organizationId), eq(Member.userId, userId)),
      });

      if (!adminMember || (adminMember.role !== "admin" && adminMember.role !== "owner")) {
        throw Errors.insufficientPermissions("list invitations", "organization");
      }

      const conditions = [eq(Invitation.organizationId, input.organizationId)];

      if (input.status) {
        conditions.push(eq(Invitation.status, input.status));
      }

      const where = and(...conditions);

      const invitations = await ctx.db.query.invitation.findMany({
        where: where as any,
        orderBy: desc(Invitation.createdAt),
      });

      return invitations;
    }),
};
