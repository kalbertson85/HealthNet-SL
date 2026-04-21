#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const auditPathArg = process.argv[2] || "artifacts/pnpm-audit-prod.json"
const auditPath = path.resolve(process.cwd(), auditPathArg)

function parseAuditJson(raw) {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // pnpm may occasionally output line-delimited JSON fragments.
  const lines = trimmed.split(/\r?\n/).filter(Boolean)
  if (lines.length === 1) {
    return JSON.parse(lines[0])
  }

  const parsedLines = []
  for (const line of lines) {
    parsedLines.push(JSON.parse(line))
  }
  return parsedLines.length === 1 ? parsedLines[0] : parsedLines
}

function normalizeSeverity(value) {
  return String(value || "").trim().toLowerCase()
}

function collectFindings(payload) {
  const findings = []

  const walk = (node) => {
    if (!node || typeof node !== "object") return

    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }

    const severity = normalizeSeverity(node.severity)
    if (["critical", "high", "moderate", "low", "info"].includes(severity)) {
      findings.push({
        severity,
        title:
          String(node.title || node.name || node.module_name || node.id || node.url || "unknown finding"),
        id: String(node.id || node.source || node.url || ""),
      })
    }

    for (const value of Object.values(node)) {
      walk(value)
    }
  }

  walk(payload)
  return findings
}

if (!fs.existsSync(auditPath)) {
  console.error(`[audit-gate] Missing audit report file: ${auditPath}`)
  process.exit(1)
}

const raw = fs.readFileSync(auditPath, "utf8")

let parsed
try {
  parsed = parseAuditJson(raw)
} catch (error) {
  console.error(`[audit-gate] Failed to parse audit JSON from ${auditPath}`)
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

const findings = collectFindings(parsed)
const highOrCritical = findings.filter((f) => f.severity === "high" || f.severity === "critical")

const severityCount = findings.reduce(
  (acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1
    return acc
  },
  { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
)

console.log(
  `[audit-gate] Findings summary: critical=${severityCount.critical}, high=${severityCount.high}, moderate=${severityCount.moderate}, low=${severityCount.low}, info=${severityCount.info}`,
)

if (highOrCritical.length > 0) {
  console.error(`[audit-gate] Failing build: ${highOrCritical.length} high/critical vulnerabilities detected.`)
  for (const finding of highOrCritical.slice(0, 20)) {
    console.error(` - [${finding.severity}] ${finding.title}${finding.id ? ` (${finding.id})` : ""}`)
  }
  process.exit(1)
}

console.log("[audit-gate] Passed: no high/critical vulnerabilities detected.")
