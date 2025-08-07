"use client"

import { CardContent } from "@raypx/ui/components/card"
import { cn } from "@raypx/ui/lib/utils"
import { useContext } from "react"
import { AuthContext } from "../../lib/auth-provider"
import type { SettingsCardProps } from "../settings/shared/settings-card"
import { SettingsCard } from "../settings/shared/settings-card"
import { InvitationCell } from "./invitation-cell"

export function OrganizationInvitationsCard({
  className,
  classNames,
  localization: localizationProp,
  ...props
}: SettingsCardProps) {
  const {
    hooks: { useActiveOrganization },
    localization: contextLocalization,
  } = useContext(AuthContext)

  const localization = { ...contextLocalization, ...localizationProp }

  const { data: activeOrganization } = useActiveOrganization()
  const invitations = activeOrganization?.invitations

  const pendingInvitations = invitations?.filter(
    (invitation) => invitation.status === "pending",
  )

  const isPending = !activeOrganization

  if (!pendingInvitations?.length) return null

  return (
    <SettingsCard
      className={className}
      classNames={classNames}
      title={localization.PENDING_INVITATIONS}
      description={localization.PENDING_INVITATIONS_DESCRIPTION}
      isPending={isPending}
      {...props}
    >
      <CardContent className={cn("grid gap-4", classNames?.content)}>
        {pendingInvitations.map((invitation) => (
          <InvitationCell
            key={invitation.id}
            classNames={classNames}
            invitation={invitation}
            localization={localization}
          />
        ))}
      </CardContent>
    </SettingsCard>
  )
}
