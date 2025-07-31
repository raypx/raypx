"use client"

import { deleteUser } from "@raypx/auth/client"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@raypx/ui/components/alert-dialog"
import { Button } from "@raypx/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card"
import { Input } from "@raypx/ui/components/input"
import { Label } from "@raypx/ui/components/label"
import { toast } from "@raypx/ui/components/toast"
import { AlertTriangle, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function DeleteAccount() {
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const router = useRouter()

  const handleDeleteAccount = async () => {
    if (confirmText !== "DELETE") {
      toast.error("Please type 'DELETE' to confirm account deletion")
      return
    }

    try {
      setIsDeleting(true)
      await deleteUser()
      router.push("/")
    } catch (error: any) {
      toast.error(`Failed to delete account: ${error.message}`)
    } finally {
      setIsDeleting(false)
      setIsDialogOpen(false)
      setConfirmText("")
    }
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setConfirmText("")
  }

  return (
    <Card className="border-red-200 bg-red-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </CardTitle>
        <CardDescription className="text-red-600">
          Permanently delete your account and all associated data
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-sm text-red-600">
            <p className="font-medium mb-2">This action will:</p>
            <ul className="list-disc list-inside space-y-1 text-red-600">
              <li>Permanently delete your account</li>
              <li>Remove all your personal data</li>
              <li>Disconnect all linked social accounts</li>
              <li>Cancel any active sessions</li>
            </ul>
          </div>

          <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setIsDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  Delete Account
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-3">
                  <p>
                    This action cannot be undone. This will permanently delete
                    your account and remove all your data from our servers.
                  </p>
                  <div className="space-y-2">
                    <Label
                      htmlFor="confirm-delete"
                      className="text-sm font-medium"
                    >
                      Type <strong>DELETE</strong> to confirm:
                    </Label>
                    <Input
                      id="confirm-delete"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="font-mono"
                    />
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={handleDialogClose}
                  disabled={isDeleting}
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || confirmText !== "DELETE"}
                  className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                >
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  )
}
