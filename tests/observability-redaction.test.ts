import { describe, expect, it } from "vitest"
import { redactLogData } from "@/lib/http/observability"

describe("observability redaction", () => {
  it("redacts emails, phone numbers, and sensitive ids", () => {
    const redacted = redactLogData({
      request_id: "req_12345",
      email: "doctor@hospital.sl",
      phone: "+232-77-123-456",
      patient_id: "11111111-1111-4111-8111-111111111111",
      user_id: "user_abcdef",
      nested: {
        contact_number: "0701234567",
        national_id: "A123456789",
      },
      items: [{ employee_id: "emp_00012222" }],
    })

    expect(redacted.request_id).toBe("req_12345")
    expect(redacted.email).toMatch(/\*\*\*/)
    expect(redacted.phone).toMatch(/\*\*\*/)
    expect(redacted.patient_id).toMatch(/\*\*\*/)
    expect(redacted.user_id).toMatch(/\*\*\*/)
    expect((redacted.nested as { contact_number: string }).contact_number).toMatch(/\*\*\*/)
    expect((redacted.nested as { national_id: string }).national_id).toMatch(/\*\*\*/)
    expect(((redacted.items as Array<{ employee_id: string }>)[0]).employee_id).toMatch(/\*\*\*/)
  })

  it("does not alter non-sensitive keys", () => {
    const redacted = redactLogData({
      route: "api.sync.queue.enqueue",
      status: 200,
      event_id: "evt_test_001",
      invoice_id: "inv_001",
      message: "ok",
    })

    expect(redacted.route).toBe("api.sync.queue.enqueue")
    expect(redacted.status).toBe(200)
    expect(redacted.event_id).toBe("evt_test_001")
    expect(redacted.invoice_id).toBe("inv_001")
    expect(redacted.message).toBe("ok")
  })
})
