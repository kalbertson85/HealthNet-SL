"use client"

import { useState } from "react"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2 } from "lucide-react"

interface LineItem {
  description: string
  quantity: number
  unit_price: number
  item_type?: string
}

interface InvoiceLineItemsProps {
  initialItems: LineItem[]
}

export function InvoiceLineItems({ initialItems }: InvoiceLineItemsProps) {
  const [items, setItems] = useState<LineItem[]>(
    initialItems.length > 0
      ? initialItems
      : [
          { description: "", quantity: 1, unit_price: 0 },
          { description: "", quantity: 1, unit_price: 0 },
        ],
  )

  const addItem = () => {
    setItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, item_type: "billable" }])
  }

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const updateItem = (index: number, field: keyof LineItem, value: string) => {
    setItems((prev) => {
      const next = [...prev]
      if (field === "quantity" || field === "unit_price") {
        next[index] = {
          ...next[index],
          [field]: Number(value || 0),
        }
      } else {
        next[index] = {
          ...next[index],
          [field]: value,
        }
      }
      return next
    })
  }

  return (
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Add one or more services and medicines. You can add extra rows as needed; empty rows will be ignored.
        </p>
        <Button type="button" onClick={addItem} size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add line item
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="space-y-2 rounded-md border p-3 md:grid md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end md:gap-3"
          >
            <div className="space-y-1">
              <Label htmlFor={`item_description_${index}`}>Description</Label>
              <Input
                id={`item_description_${index}`}
                name="item_description"
                value={item.description}
                onChange={(e) => updateItem(index, "description", e.target.value)}
                placeholder="Consultation, Lab test, Medication, etc."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`item_quantity_${index}`}>Qty</Label>
              <Input
                id={`item_quantity_${index}`}
                name="item_quantity"
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) => updateItem(index, "quantity", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`item_unit_price_${index}`}>Unit price</Label>
              <Input
                id={`item_unit_price_${index}`}
                name="item_unit_price"
                type="number"
                min={0}
                value={item.unit_price}
                onChange={(e) => updateItem(index, "unit_price", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`item_type_${index}`}>Type</Label>
              <select
                id={`item_type_${index}`}
                name="item_type"
                className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={item.item_type || "billable"}
                onChange={(e) => updateItem(index, "item_type", e.target.value)}
              >
                <option value="billable">Normal billable</option>
                <option value="fhc_covered">FHC-covered (zero to patient)</option>
              </select>
            </div>
            <div className="flex items-end justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={items.length <= 1}
                onClick={() => removeItem(index)}
                aria-label="Remove line item"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </CardContent>
  )
}
