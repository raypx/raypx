import { CloudDomainError } from "@voidmix/core";
import type { CloudContext, Actor, Intent } from "./context.js";

export function cloudNotifications(context: CloudContext) {
  const { repo, now, fail, required, base, access, scopeFor, mutate } = context;
  return {
    listNotifications: (input: Actor & { limit?: number }) =>
      repo.read(async (tx) => {
        if (!(await tx.userActive(input.actorId)))
          fail("CLOUD_ACCESS_DENIED", "Account unavailable.");
        const entries = await tx.list("notifications", { actorId: input.actorId });
        const items = [];
        let unreadCount = 0;
        for (const n of entries) {
          try {
            await access(tx, input.actorId, n.scope);
            if (!n.readAt) unreadCount += 1;
            if (items.length < (input.limit ?? 50)) items.push(n);
          } catch (error) {
            if (!(error instanceof CloudDomainError && error.code === "CLOUD_ACCESS_DENIED"))
              throw error;
          }
        }
        return { items, unreadCount };
      }),
    markNotificationRead: (input: Actor & Intent & { notificationId: string }) =>
      repo.transaction(
        [`actor:${input.actorId}`, `notification:${input.notificationId}`],
        async (tx) => {
          const notification = required(await tx.get("notifications", input.notificationId));
          if (notification.recipientId !== input.actorId)
            fail("CLOUD_ACCESS_DENIED", "Notification unavailable.");
          await access(tx, input.actorId, notification.scope);
          return mutate(
            tx,
            input,
            notification.scope,
            "notification.read",
            { notificationId: input.notificationId },
            async () => {
              if (notification.readAt) return notification;
              notification.readAt = now();
              notification.updatedAt = now();
              await tx.save("notifications", notification);
              return notification;
            },
          );
        },
      ),
    getPreferences: (input: Actor) =>
      repo.read(async (tx) => {
        await access(tx, input.actorId, scopeFor(input));
        return (
          (await tx.get("preferences", input.actorId)) ?? {
            ...base(scopeFor(input)),
            id: input.actorId,
            actorId: input.actorId,
            emailEnabled: false,
            locale: "en" as const,
          }
        );
      }),
    updatePreferences: (input: Actor & Intent & { emailEnabled: boolean; locale: "en" | "zh" }) =>
      repo.transaction([`actor:${input.actorId}`], async (tx) => {
        await access(tx, input.actorId, scopeFor(input));
        return mutate(
          tx,
          input,
          scopeFor(input),
          "preferences.update",
          { emailEnabled: input.emailEnabled, locale: input.locale },
          async () => {
            const prefs = (await tx.get("preferences", input.actorId)) ?? {
              ...base(scopeFor(input)),
              id: input.actorId,
              actorId: input.actorId,
              emailEnabled: false,
              locale: "en" as const,
            };
            prefs.emailEnabled = input.emailEnabled;
            prefs.locale = input.locale;
            prefs.updatedAt = now();
            await tx.save("preferences", prefs);
            return prefs;
          },
        );
      }),
    getDeliveryContext: (input: { notificationId: string }) =>
      repo.read(async (tx) => {
        const notification = await tx.get("notifications", input.notificationId);
        if (!notification || !notification.emailEnabled || notification.emailDeliveredAt)
          return null;
        const prefs = await tx.get("preferences", notification.recipientId);
        if (!prefs?.emailEnabled) return null;
        try {
          await access(tx, notification.recipientId, notification.scope);
        } catch (error) {
          if (error instanceof CloudDomainError && error.code === "CLOUD_ACCESS_DENIED")
            return null;
          throw error;
        }
        const user = await tx.userProfile(notification.recipientId);
        return user
          ? { notification, email: user.email, name: user.displayName, locale: prefs.locale }
          : null;
      }),
    getNotificationForDelivery: (input: { notificationId: string }) =>
      repo.read(async (tx) => tx.get("notifications", input.notificationId)),
    markNotificationDelivered: (input: { notificationId: string }) =>
      repo.transaction([`notification:${input.notificationId}`], async (tx) => {
        const n = required(await tx.get("notifications", input.notificationId));
        n.emailDeliveredAt = n.emailDeliveredAt ?? now();
        n.updatedAt = now();
        await tx.save("notifications", n);
        return n;
      }),
  };
}
