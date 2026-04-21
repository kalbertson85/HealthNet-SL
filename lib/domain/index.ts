export {
  canCreateBillingForVisit,
  canCreatePrescriptionForVisit,
  canCreateVisitForPatient,
  canDispensePrescription,
  doesVisitBelongToPatient,
  isCrossFacilityAccessDenied,
  isVisitTerminal,
  normalizeVisitStatus,
} from "@/lib/workflow-integrity"

export {
  applySuggestedLinkageWithRollback,
  summarizeLinkageSuggestions,
  type LinkageSuggestion,
} from "@/lib/billing/linkage-bulk"

export { createApiV1Client, ApiV1ClientError } from "@/lib/api/v1-client"
