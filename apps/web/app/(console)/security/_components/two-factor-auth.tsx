"use client"

import { Alert, AlertDescription } from "@raypx/ui/components/alert"
import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { Input } from "@raypx/ui/components/input"
import { Label } from "@raypx/ui/components/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@raypx/ui/components/tabs"
import { toast } from "@raypx/ui/components/toast"
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  RefreshCw,
  Shield,
  Smartphone,
} from "lucide-react"
import Image from "next/image"
import { useEffect, useState } from "react"

interface TwoFactorStatus {
  enabled: boolean
  backupCodes: string[]
  qrCode?: string
  secret?: string
}

export function TwoFactorAuth() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [verificationCode, setVerificationCode] = useState("")
  const [setupLoading, setSetupLoading] = useState(false)
  const [disableLoading, setDisableLoading] = useState(false)

  useEffect(() => {
    fetchTwoFactorStatus()
  }, [])

  const fetchTwoFactorStatus = async () => {
    try {
      const response = await fetch("/api/auth/2fa/status")
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load 2FA status",
      )
    } finally {
      setLoading(false)
    }
  }

  const enableTwoFactor = async () => {
    setSetupLoading(true)
    try {
      const response = await fetch("/api/auth/2fa/enable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: verificationCode,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setStatus(data)
        setVerificationCode("")
        toast.success("Two-factor authentication enabled successfully")
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to enable 2FA")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setSetupLoading(false)
    }
  }

  const disableTwoFactor = async () => {
    setDisableLoading(true)
    try {
      const response = await fetch("/api/auth/2fa/disable", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: verificationCode,
        }),
      })

      if (response.ok) {
        setStatus({ enabled: false, backupCodes: [] })
        setVerificationCode("")
        toast.success("Two-factor authentication disabled")
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to disable 2FA")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setDisableLoading(false)
    }
  }

  const generateNewBackupCodes = async () => {
    try {
      const response = await fetch("/api/auth/2fa/backup-codes", {
        method: "POST",
      })

      if (response.ok) {
        const data = await response.json()
        setStatus((prev) =>
          prev ? { ...prev, backupCodes: data.backupCodes } : null,
        )
        toast.success("New backup codes generated")
      } else {
        toast.error("Failed to generate backup codes")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    }
  }

  const copyToClipboard = (text: string | undefined) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    toast.success("Copied to clipboard")
  }

  if (loading) {
    return <div>Loading 2FA settings...</div>
  }

  if (!status) {
    return <div>Failed to load 2FA settings</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4" />
          <span className="font-medium">Status:</span>
        </div>
        <Badge variant={status.enabled ? "default" : "secondary"}>
          {status.enabled ? (
            <>
              <CheckCircle className="h-3 w-3 mr-1" />
              Enabled
            </>
          ) : (
            <>
              <AlertTriangle className="h-3 w-3 mr-1" />
              Disabled
            </>
          )}
        </Badge>
      </div>

      {!status.enabled ? (
        <Tabs defaultValue="setup" className="w-full">
          <TabsList>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>
          <TabsContent value="setup" className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Two-factor authentication adds an extra layer of security to
                your account. You'll need an authenticator app like Google
                Authenticator or Authy.
              </AlertDescription>
            </Alert>

            {status.qrCode && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-block p-4 bg-white rounded-lg">
                    <Image
                      src={status.qrCode}
                      alt="QR Code for 2FA setup"
                      className="w-48 h-48"
                    />
                  </div>
                </div>

                {status.secret && (
                  <div className="space-y-2">
                    <Label>Manual Entry Key</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-muted px-3 py-2 rounded">
                        {status.secret}
                      </code>
                      <Button
                        disabled={!status.secret}
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(status.secret)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="verificationCode">
                    Enter the verification code from your authenticator app
                  </Label>
                  <Input
                    id="verificationCode"
                    type="text"
                    placeholder="000000"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                  />
                </div>

                <Button
                  onClick={enableTwoFactor}
                  disabled={setupLoading || verificationCode.length !== 6}
                >
                  {setupLoading
                    ? "Verifying..."
                    : "Enable Two-Factor Authentication"}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-6">
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Two-factor authentication is enabled and protecting your account.
            </AlertDescription>
          </Alert>

          <Tabs defaultValue="disable" className="w-full">
            <TabsList>
              <TabsTrigger value="disable">Disable</TabsTrigger>
              <TabsTrigger value="backup">Backup Codes</TabsTrigger>
            </TabsList>

            <TabsContent value="disable" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="disableCode">
                  Enter a verification code to disable 2FA
                </Label>
                <Input
                  id="disableCode"
                  type="text"
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                />
              </div>

              <Button
                variant="destructive"
                onClick={disableTwoFactor}
                disabled={disableLoading || verificationCode.length !== 6}
              >
                {disableLoading
                  ? "Disabling..."
                  : "Disable Two-Factor Authentication"}
              </Button>
            </TabsContent>

            <TabsContent value="backup" className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Backup codes can be used to access your account if you lose
                  your authenticator device. Store them in a safe place.
                </AlertDescription>
              </Alert>

              {status.backupCodes.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {status.backupCodes.map((code, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-muted p-2 rounded"
                      >
                        <code className="text-sm">{code}</code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    onClick={generateNewBackupCodes}
                    className="w-full"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Generate New Backup Codes
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  )
}
