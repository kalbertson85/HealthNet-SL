import { describe, expect, it, vi } from "vitest"
import { ApiV1ClientError, createApiV1Client } from "../lib/api/v1-client"

function makeJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("api v1 client", () => {
  it("parses meta response successfully", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1", release_channel: "beta", capabilities: ["auth.session"] },
        app: { name: "HealthNet HMS", platforms: ["web"] },
        server_time_utc: new Date().toISOString(),
      }),
    )

    const client = createApiV1Client({ fetchImpl, basePath: "/api/v1" })
    const data = await client.getMeta()

    expect(data.ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith("/api/v1/meta", expect.any(Object))
  })

  it("maps structured api errors", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse(
        {
          ok: false,
          error: {
            code: "forbidden",
            message: "Forbidden",
            request_id: "req_1",
          },
        },
        403,
      ),
    )
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getSession()).rejects.toMatchObject<ApiV1ClientError>({
      code: "forbidden",
      status: 403,
      requestId: "req_1",
    })
  })

  it("maps invalid contract responses", async () => {
    const fetchImpl = vi.fn(async () =>
      makeJsonResponse({
        ok: true,
        api: { version: "v1" },
      }),
    )
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getPatientsSummary()).rejects.toMatchObject<ApiV1ClientError>({
      code: "invalid_response",
      status: 200,
    })
  })

  it("maps network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("failed to fetch")
    })
    const client = createApiV1Client({ fetchImpl })

    await expect(client.getBillingSummary()).rejects.toMatchObject<ApiV1ClientError>({
      code: "network_error",
      status: 0,
    })
  })
})

