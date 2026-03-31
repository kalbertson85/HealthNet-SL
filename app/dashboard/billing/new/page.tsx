"use client"

import type React from "react"
import { useState, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Trash2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

interface InvoiceItem {
  description: string
  quantity: number
  unit_price: number
  amount: number
}

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const supabase = useMemo(() => createClient(), [])

  const [patientId, setPatientId] = useState(searchParams.get("patient_id") || "")
  const [notes, setNotes] = useState("")
  const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, unit_price: 0, amount: 0 }])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, amount: 0 }])
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const updated = [...items]
    updated[index] = { ...updated[index], [field]: value }

    // Calculate amount if quantity or unit_price changes
    if (field === "quantity" || field === "unit_price") {
      updated[index].amount = updated[index].quantity * updated[index].unit_price
    }

    setItems(updated)
  }

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Generate a simple human-readable invoice number
      const generatedInvoiceNumber = `INV-${Date.now().toString().slice(-6)}`

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push("/auth/login")
        return
      }

      // Look up patient by patient_number (PT- style identifier) and use UUID id for invoice
      const { data: patient, error: patientError } = await supabase
        .from("patients")
        .select("id, patient_number")
        .eq("patient_number", patientId)
        .maybeSingle()

      if (patientError) {
        throw patientError
      }

      if (!patient) {
        throw new Error("No patient found with that patient number.")
      }

      // Create invoice using the resolved patient UUID
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .insert({
          invoice_number: generatedInvoiceNumber,
          patient_id: patient.id,
          total_amount: totalAmount,
          paid_amount: 0,
          notes,
          status: "pending",
          created_by: user.id,
        })
        .select()
        .single()

      if (invoiceError) throw invoiceError

      // Create invoice items
      const invoiceItems = items.map((item) => ({
        invoice_id: invoice.id,
        ...item,
      }))

      const { error: itemsError } = await supabase.from("invoice_items").insert(invoiceItems)

      if (itemsError) throw itemsError

      try {
        await supabase.from("billing_audit_logs").insert({
          invoice_id: invoice.id,
          actor_user_id: user.id,
          action: "created",
          old_status: null,
          new_status: "pending",
          amount: totalAmount,
        })
      } catch (auditError) {
        console.error("[v0] Error logging invoice creation:", auditError)
      }

      router.push(`/dashboard/billing/${invoice.id}`)
    } catch (error) {
      console.error(
        "[v0] Error creating invoice:",
        error instanceof Error ? error.message : JSON.stringify(error),
      )
      alert("Error creating invoice. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Billing
            </Link>
          </Button>
          <div>
            <h1 className="text-balance text-3xl font-bold tracking-tight">Create New Invoice</h1>
            <p className="text-pretty text-muted-foreground">Generate invoice for patient services</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Invoice Details</CardTitle>
            <CardDescription>Select patient and add general notes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="patient_id">Patient Number *</Label>
              <Input
                id="patient_id"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                placeholder="Enter patient number (e.g., PT-000123)"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Invoice Items</CardTitle>
                <CardDescription>Add services and charges</CardDescription>
              </div>
              <Button type="button" onClick={addItem} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {items.map((item, index) => (
              <div key={index} className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Item {index + 1}</h3>
                  {items.length > 1 && (
                    <Button type="button" onClick={() => removeItem(index)} variant="ghost" size="sm">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Description *</Label>
                    <Input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      placeholder="e.g., Consultation fee"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", Number.parseInt(e.target.value) || 0)}
                      min="1"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Unit Price (Le) *</Label>
                    <Input
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, "unit_price", Number.parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      required
                    />
                  </div>

                  <div className="space-y-2 md:col-span-4">
                    <Label>Amount</Label>
                    <p className="text-lg font-bold">Le {item.amount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end border-t pt-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">Le {totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard/billing">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Invoice"}
          </Button>
        </div>
      </form>
    </div>
  )
}
