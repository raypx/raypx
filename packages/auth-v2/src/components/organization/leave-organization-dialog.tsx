"use client"

import { Button } from "@raypx/ui/components/button"
import { Card } from "@raypx/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@raypx/ui/components/dialog"
import { Loader2 } from "@raypx/ui/components/icons"
import { cn } from "@raypx/ui/lib/utils"
import type { Organization } from "better-auth/plugins/organization"
import { type ComponentProps, useContext, useState } from "react"
import { AuthContext } from "../../lib/auth-provider"
import { getLocalizedError } from "../../lib/utils"
import type { AuthLocalization } from "../../localization/auth-localization"
import type { SettingsCardClassNames } from "../settings/shared/settings-card"
import { OrganizationView } from "./organization-view"

export interface LeaveOrganizationDialogProps
  extends ComponentProps<typeof Dialog> {
  className?: string
  classNames?: SettingsCardClassNames
  localization?: AuthLocalization
  organization: Organization
}

export function LeaveOrganizationDialog({
  organization,
  className,
  classNames,
  localization: localizationProp,
  onOpenChange,
  ...props
}: LeaveOrganizationDialogProps) {
  const {
    authClient,
    hooks: { useActiveOrganization, useListOrganizations },
    localization: contextLocalization,
    toast,
  } = useContext(AuthContext)

  const localization = { ...contextLocalization, ...localizationProp }

  const { data: activeOrganization, refetch: refetchActiveOrganization } =
    useActiveOrganization()
  const { refetch: refetchOrganizations } = useListOrganizations()

  const [isLeaving, setIsLeaving] = useState(false)

  const handleLeaveOrganization = async () => {
    setIsLeaving(true)

    try {
      await authClient.organization.leave({
        organizationId: organization.id,
        fetchOptions: {
          throw: true,
        },
      })

      toast({
        variant: "success",
        message: localization.LEAVE_ORGANIZATION_SUCCESS,
      })

      if (activeOrganization?.id === organization.id) {
        refetchActiveOrganization?.()
      }

      await refetchOrganizations?.()

      onOpenChange?.(false)
    } catch (error) {
      toast({
        variant: "error",
        message: getLocalizedError({ error, localization }),
      })
    }

    setIsLeaving(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} {...props}>
      <DialogContent
        className={classNames?.dialog?.content}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader className={classNames?.dialog?.header}>
          <DialogTitle className={cn("text-lg md:text-xl", classNames?.title)}>
            {localization.LEAVE_ORGANIZATION}
          </DialogTitle>

          <DialogDescription
            className={cn("text-xs md:text-sm", classNames?.description)}
          >
            {localization.LEAVE_ORGANIZATION_CONFIRM}
          </DialogDescription>
        </DialogHeader>

        <Card className={cn("my-2 flex-row p-4", className, classNames?.cell)}>
          <OrganizationView
            organization={organization}
            localization={localization}
          />
        </Card>

        <DialogFooter className={classNames?.dialog?.footer}>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            className={cn(classNames?.button, classNames?.outlineButton)}
            disabled={isLeaving}
          >
            {localization.CANCEL}
          </Button>

          <Button
            type="button"
            variant="destructive"
            onClick={handleLeaveOrganization}
            className={cn(classNames?.button, classNames?.destructiveButton)}
            disabled={isLeaving}
          >
            {isLeaving && <Loader2 className="animate-spin" />}

            {localization.LEAVE_ORGANIZATION}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
