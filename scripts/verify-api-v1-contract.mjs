#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"

const ROOT = process.cwd()

const CAPABILITIES_FILE = path.join(ROOT, "lib", "api", "v1.ts")
const MAP_FILE = path.join(ROOT, "lib", "api", "v1-capability-map.ts")
const DOC_FILE = path.join(ROOT, "API_CONTRACT_V1.md")
const CLIENT_FILE = path.join(ROOT, "lib", "api", "v1-client.ts")

function fail(message) {
  console.error(`api-v1-contract verify failed: ${message}`)
  process.exit(1)
}

function unique(values) {
  return new Set(values).size === values.length
}

function toEndpoint(routePath) {
  const normalized = routePath.replace(/\\/g, "/")
  const withoutPrefix = normalized.replace(/^app\/api\/v1/, "")
  return withoutPrefix.replace(/\/route\.ts$/, "")
}

async function readFileSafe(filePath) {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch (error) {
    fail(`unable to read ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const [capabilitiesSource, mapSource, docSource, clientSource] = await Promise.all([
  readFileSafe(CAPABILITIES_FILE),
  readFileSafe(MAP_FILE),
  readFileSafe(DOC_FILE),
  readFileSafe(CLIENT_FILE),
])

const capabilitiesBlockMatch = capabilitiesSource.match(/API_V1_CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const/)
if (!capabilitiesBlockMatch) {
  fail("could not parse API_V1_CAPABILITIES block")
}

const declaredCapabilities = Array.from(capabilitiesBlockMatch[1].matchAll(/"([^"]+)"/g)).map((m) => m[1])
if (declaredCapabilities.length === 0) {
  fail("API_V1_CAPABILITIES is empty")
}
if (!unique(declaredCapabilities)) {
  fail("API_V1_CAPABILITIES contains duplicate entries")
}

const mapEntryRegex =
  /capability:\s*"([^"]+)"[\s\S]*?routePath:\s*"([^"]+)"[\s\S]*?clientMethod:\s*"([^"]+)"[\s\S]*?docHeader:\s*"([^"]+)"/g
const mapEntries = Array.from(mapSource.matchAll(mapEntryRegex)).map((m) => ({
  capability: m[1],
  routePath: m[2],
  clientMethod: m[3],
  docHeader: m[4],
}))

if (mapEntries.length !== declaredCapabilities.length) {
  fail(`capability map size mismatch (${mapEntries.length} vs ${declaredCapabilities.length})`)
}

const mappedCapabilities = mapEntries.map((entry) => entry.capability)
if (!unique(mappedCapabilities)) {
  fail("capability map contains duplicate capability entries")
}

for (const capability of declaredCapabilities) {
  if (!mappedCapabilities.includes(capability)) {
    fail(`capability missing from map: ${capability}`)
  }
}

const endpoints = mapEntries.map((entry) => toEndpoint(entry.routePath))
if (!unique(endpoints)) {
  fail("capability map resolves to duplicate endpoint paths")
}

for (const entry of mapEntries) {
  const routeAbsolutePath = path.join(ROOT, entry.routePath)
  try {
    await fs.access(routeAbsolutePath)
  } catch {
    fail(`route file missing for ${entry.capability}: ${entry.routePath}`)
  }

  if (!docSource.includes(entry.docHeader)) {
    fail(`doc header missing for ${entry.capability}: ${entry.docHeader}`)
  }

  if (!clientSource.includes(`async ${entry.clientMethod}(`)) {
    fail(`client method missing for ${entry.capability}: ${entry.clientMethod}`)
  }

  if (!clientSource.includes(`endpoint("${entry.capability}")`)) {
    fail(`client endpoint resolver call missing for ${entry.capability}`)
  }
}

console.log(`api-v1-contract verify passed (${mapEntries.length} capabilities)`)
