"use client"

import { Badge } from "@raypx/ui/components/badge"
import { Button } from "@raypx/ui/components/button"
import { toast } from "@raypx/ui/components/toast"
import { format } from "date-fns"
import {
  Calendar,
  DollarSign,
  Download,
  ExternalLink,
  FileText,
  RefreshCw,
} from "lucide-react"
import { useEffect, useState } from "react"

interface Invoice {
  id: string
  number: string
  status: "paid" | "pending" | "failed" | "draft"
  amount: number
  currency: string
  description: string
  periodStart: string
  periodEnd: string
  createdAt: string
  paidAt?: string
  dueDate: string
  downloadUrl?: string
  hostedUrl?: string
}

export function BillingHistory() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchBillingHistory()
  }, [])

  const fetchBillingHistory = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/billing/invoices")
      if (response.ok) {
        const data = await response.json()
        setInvoices(data.invoices || [])
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load billing history",
      )
    } finally {
      setLoading(false)
    }
  }

  const downloadInvoice = async (invoiceId: string) => {
    setDownloadingIds((prev) => new Set(prev).add(invoiceId))

    try {
      const response = await fetch(
        `/api/billing/invoices/${invoiceId}/download`,
      )

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `invoice-${invoiceId}.pdf`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)

        toast.success("Invoice downloaded successfully")
      } else {
        toast.error("Failed to download invoice")
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(invoiceId)
        return next
      })
    }
  }

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100) // Assuming amount is in cents
  }

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "paid":
        return "default"
      case "pending":
        return "secondary"
      case "failed":
        return "destructive"
      case "draft":
        return "outline"
      default:
        return "secondary"
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "text-green-600"
      case "pending":
        return "text-yellow-600"
      case "failed":
        return "text-red-600"
      case "draft":
        return "text-gray-600"
      default:
        return "text-gray-600"
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading billing history...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Recent Invoices</span>
          <Badge variant="secondary">{invoices.length}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={fetchBillingHistory}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="flex-shrink-0">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">#{invoice.number}</span>
                  <Badge
                    variant={getStatusVariant(invoice.status)}
                    className="text-xs"
                  >
                    {invoice.status.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  {invoice.description}
                </p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {format(new Date(invoice.periodStart), "MMM dd")} -{" "}
                      {format(new Date(invoice.periodEnd), "MMM dd, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    <span className={getStatusColor(invoice.status)}>
                      {formatAmount(invoice.amount, invoice.currency)}
                    </span>
                  </div>
                </div>
                {invoice.paidAt && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Paid on {format(new Date(invoice.paidAt), "MMM dd, yyyy")}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {invoice.hostedUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(invoice.hostedUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}

              {invoice.status === "paid" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadInvoice(invoice.id)}
                  disabled={downloadingIds.has(invoice.id)}
                >
                  {downloadingIds.has(invoice.id) ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </div>
        ))}

        {invoices.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No invoices found</p>
            <p className="text-xs mt-1">
              Your billing history will appear here
            </p>
          </div>
        )}
      </div>

      {invoices.length > 0 && (
        <div className="text-xs text-muted-foreground text-center pt-2 border-t">
          Need help with billing?{" "}
          <Button variant="link" className="h-auto p-0 text-xs">
            Contact support
          </Button>
        </div>
      )}
    </div>
  )
}
