import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { PrintButton } from "@/components/print-button"

export const revalidate = 0

export default async function PatientCardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const supabase = await createServerClient()
  const { id } = await params

  const { data: patient, error } = await supabase
    .from("patients")
    .select("id, full_name, patient_number, date_of_birth, gender, phone_number, address, company_id")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[records] Error loading patient card:", error.message || error)
  }

  if (!patient) {
    notFound()
  }

  const formatDate = (value?: string | null) => {
    if (!value) return "-"
    try {
      return new Date(value).toLocaleDateString()
    } catch {
      return "-"
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-4">
      <div className="mb-4 flex w-full max-w-md items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/records">Back to Records</Link>
        </Button>
        <PrintButton />
      </div>
      <Card className="w-full max-w-md bg-white print:shadow-none print:border print:border-slate-300">
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex items-baseline justify-between border-b pb-2">
            <div>
              <p className="text-xs uppercase text-muted-foreground">Patient card</p>
              <p className="text-lg font-semibold">{patient.full_name || "Unknown patient"}</p>
            </div>
            <div className="text-right text-xs">
              <p className="font-mono">{patient.patient_number || "-"}</p>
              <p>DOB: {formatDate(patient.date_of_birth)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Gender</p>
              <p className="text-sm capitalize">{patient.gender || "-"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Phone</p>
              <p className="text-sm">{patient.phone_number || "-"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[11px] font-medium text-muted-foreground">Address</p>
              <p className="text-sm">{patient.address || "-"}</p>
            </div>
          </div>

          <p className="mt-2 text-[10px] text-muted-foreground">
            Please attach this card to the patient file or folder. Records staff should ensure the patient number is
            clearly visible on all documents.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
