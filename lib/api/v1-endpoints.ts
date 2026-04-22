import { API_V1_CAPABILITY_MAP, type ApiV1Capability } from "@/lib/api/v1-capability-map"

function routePathToEndpoint(routePath: string): string {
  const normalized = routePath.replace(/\\/g, "/")
  const withoutPrefix = normalized.replace(/^app\/api\/v1/, "")
  return withoutPrefix.replace(/\/route\.ts$/, "")
}

const CAPABILITY_ENDPOINT_MAP = Object.fromEntries(
  API_V1_CAPABILITY_MAP.map((entry) => [entry.capability, routePathToEndpoint(entry.routePath)]),
) as Record<ApiV1Capability, string>

export function getApiV1Endpoint(capability: ApiV1Capability): string {
  return CAPABILITY_ENDPOINT_MAP[capability]
}
