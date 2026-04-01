import { redirect } from "next/navigation"

export default function NewQueueRedirectPage() {
  redirect("/dashboard/triage")
}
