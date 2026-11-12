import { permissionsForRoles, type AuthRole } from "@raypx/auth/access";
import type { AccountPermission } from "@raypx/account/access";
import { Badge } from "@raypx/ui/components/ui/badge";
import { useTranslations } from "../../../i18n.js";

function PermissionList({
  title,
  permissions,
}: {
  title: string;
  permissions: readonly AccountPermission[];
}) {
  const t = useTranslations("users");
  return (
    <section className="flex flex-col gap-1">
      <h3 className="font-medium">{title}</h3>
      {permissions.length ? (
        <ul className="list-disc pl-5 text-muted-foreground">
          {permissions.map((permission) => (
            <li key={permission}>{t(`permissions.${permission}`)}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("noPermissions")}</p>
      )}
    </section>
  );
}

export function RolePermissions({
  roles,
  proposedRole,
}: {
  roles: readonly AuthRole[];
  proposedRole: AuthRole | null | undefined;
}) {
  const t = useTranslations("users");
  const current = permissionsForRoles(roles);
  const next = proposedRole ? permissionsForRoles([proposedRole]) : current;
  const added = next.filter((permission) => !current.includes(permission));
  const removed = current.filter((permission) => !next.includes(permission));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t("currentRole")}</span>
        {roles.length ? (
          [...new Set(roles)].map((role) => (
            <Badge key={role} variant={role === "admin" ? "secondary" : "outline"}>
              {t(role)}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">{t("unknown")}</span>
        )}
      </div>
      {proposedRole === undefined ? (
        <PermissionList title={t("grantedPermissions")} permissions={current} />
      ) : (
        <div aria-live="polite" className="flex flex-col gap-3">
          {proposedRole && !added.length && !removed.length && (
            <p className="text-muted-foreground">{t("noPermissionChanges")}</p>
          )}
          {added.length > 0 && <PermissionList title={t("addedPermissions")} permissions={added} />}
          {removed.length > 0 && (
            <PermissionList title={t("removedPermissions")} permissions={removed} />
          )}
        </div>
      )}
    </div>
  );
}
