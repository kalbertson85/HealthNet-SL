"use client"

import { Button } from "@/components/ui/button"

export function PrintButton() {
  return (
    <Button
      type="button"
      size="sm"
      onClick={() => {
        if (typeof window !== "undefined") {
          window.print()
        }
      }}
    >
      Print
    </Button>
  )
}
