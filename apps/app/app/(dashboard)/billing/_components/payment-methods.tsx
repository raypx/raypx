"use client"

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
import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@raypx/ui/components/dialog"
import { toast } from "@raypx/ui/components/toast"
import { Check, CreditCard, Edit3, Plus, Shield, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"

interface PaymentMethod {
  id: string
  type: "card"
  brand: string
  last4: string
  expiryMonth: number
  expiryYear: number
  isDefault: boolean
  billingAddress?: {
    name: string
    line1: string
    city: string
    state: string
    postalCode: string
    country: string
  }
}

export function PaymentMethods() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [addingCard, setAddingCard] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    fetchPaymentMethods()
  }, [])

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/billing/payment-methods")
      if (response.ok) {
        const data = await response.json()
        setPaymentMethods(data.paymentMethods || [])
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load payment methods",
      )
    } finally {
      setLoading(false)
    }
  }

  const addPaymentMethod = async () => {
    setAddingCard(true)
    try {
      const response = await fetch("/api/billing/payment-methods", {
        method: "POST",
      })

      if (response.ok) {
        const data = await response.json()
        if (data.setupUrl) {
          window.location.href = data.setupUrl
        } else {
          await fetchPaymentMethods()
          toast.success("Payment method added successfully")
        }
      } else {
        toast.error("Failed to add payment method")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setAddingCard(false)
    }
  }

  const setDefaultPaymentMethod = async (paymentMethodId: string) => {
    try {
      const response = await fetch(
        `/api/billing/payment-methods/${paymentMethodId}/default`,
        {
          method: "POST",
        },
      )

      if (response.ok) {
        await fetchPaymentMethods()
        toast.success("Default payment method updated")
      } else {
        toast.error("Failed to update default payment method")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    }
  }

  const deletePaymentMethod = async (paymentMethodId: string) => {
    setDeletingId(paymentMethodId)
    try {
      const response = await fetch(
        `/api/billing/payment-methods/${paymentMethodId}`,
        {
          method: "DELETE",
        },
      )

      if (response.ok) {
        setPaymentMethods((prev) =>
          prev.filter((pm) => pm.id !== paymentMethodId),
        )
        toast.success("Payment method deleted")
      } else {
        toast.error("Failed to delete payment method")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setDeletingId(null)
    }
  }

  const getCardBrandIcon = (brand: string) => {
    switch (brand) {
      case "visa":
        return <CreditCard className="h-5 w-5" />
      case "mastercard":
        return <CreditCard className="h-5 w-5" />
      default:
        return <CreditCard className="h-5 w-5" />
    }
  }

  const formatCardBrand = (brand: string) => {
    return brand.charAt(0).toUpperCase() + brand.slice(1)
  }

  const isExpired = (month: number, year: number) => {
    const now = new Date()
    const expiry = new Date(year, month - 1)
    return expiry < now
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading payment methods...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Payment Methods</span>
          <Badge variant="secondary">{paymentMethods.length}</Badge>
        </div>
        <Button onClick={addPaymentMethod} disabled={addingCard} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          {addingCard ? "Adding..." : "Add Card"}
        </Button>
      </div>

      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className={`flex items-center justify-between p-4 border rounded-lg ${
              method.isDefault ? "border-primary bg-primary/5" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {getCardBrandIcon(method.brand)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {formatCardBrand(method.brand)} •••• {method.last4}
                  </span>
                  {method.isDefault && (
                    <Badge variant="default" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Default
                    </Badge>
                  )}
                  {isExpired(method.expiryMonth, method.expiryYear) && (
                    <Badge variant="destructive" className="text-xs">
                      Expired
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Expires {method.expiryMonth.toString().padStart(2, "0")}/
                  {method.expiryYear}
                </p>
                {method.billingAddress && (
                  <p className="text-xs text-muted-foreground">
                    {method.billingAddress.name} • {method.billingAddress.city},{" "}
                    {method.billingAddress.state}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!method.isDefault && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDefaultPaymentMethod(method.id)}
                >
                  Set Default
                </Button>
              )}

              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Payment Method Details</DialogTitle>
                    <DialogDescription>
                      View details for your {formatCardBrand(method.brand)} card
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-4 border rounded-lg">
                      {getCardBrandIcon(method.brand)}
                      <div>
                        <div className="font-medium">
                          {formatCardBrand(method.brand)} •••• {method.last4}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Expires{" "}
                          {method.expiryMonth.toString().padStart(2, "0")}/
                          {method.expiryYear}
                        </div>
                      </div>
                    </div>

                    {method.billingAddress && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Billing Address</h4>
                        <div className="text-sm text-muted-foreground space-y-1">
                          <div>{method.billingAddress.name}</div>
                          <div>{method.billingAddress.line1}</div>
                          <div>
                            {method.billingAddress.city},{" "}
                            {method.billingAddress.state}{" "}
                            {method.billingAddress.postalCode}
                          </div>
                          <div>{method.billingAddress.country}</div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Shield className="h-4 w-4" />
                      <span>Payment information is securely encrypted</span>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {!method.isDefault && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === method.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Payment Method</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this payment method?
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deletePaymentMethod(method.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        ))}

        {paymentMethods.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No payment methods found</p>
            <p className="text-xs mt-1">
              Add a payment method to manage your subscription
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
