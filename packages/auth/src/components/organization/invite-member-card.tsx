"use client"

import { CardContent } from "@raypx/ui/components/card"
import { cn } from "@raypx/ui/lib/utils"
import { useContext, useState } from "react"
import { AuthContext } from "../../lib/auth-provider"
import type { SettingsCardProps } from "../settings/shared/settings-card"
import { SettingsCard } from "../settings/shared/settings-card"
import { InviteMemberDialog } from "./invite-member-dialog"
import { MemberCell } from "./member-cell"

export function InviteMemberCard({
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
  const members = activeOrganization?.members

  const isPending = !activeOrganization

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  return (
    <>
      <SettingsCard
        className={className}
        classNames={classNames}
        title={localization.MEMBERS}
        description={localization.MEMBERS_DESCRIPTION}
        instructions={localization.MEMBERS_INSTRUCTIONS}
        actionLabel={localization.INVITE_MEMBER}
        action={() => setInviteDialogOpen(true)}
        isPending={isPending}
        {...props}
      >
        {members && members.length > 0 && (
          <CardContent className={cn("grid gap-4", classNames?.content)}>
            {members.map((member) => (
              <MemberCell
                key={member.id}
                classNames={classNames}
                member={member}
                localization={localization}
              />
            ))}
          </CardContent>
        )}
      </SettingsCard>

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        classNames={classNames}
        localization={localization}
      />
    </>
  )
}
