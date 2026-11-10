import { auditLabel, type AuditData, type AuditRow } from "./wiki-tag-audit"

export const columns = [
  "tag_id",
  "tag",
  "pages",
  "sections_used_in",
  "areas_used_in",
  "created",
  "proposed_action",
  "proposed_section",
  "merge_group",
  "merge_into",
  "reason",
  "decision",
  "decision_section",
  "decision_merge_into",
] as const
type CsvRow = Record<(typeof columns)[number], string>
export type TagDecision = {
  tag_id: string
  action: "keep" | "global" | "section" | "merge" | "delete"
  section_id?: string
  target_id?: string
}

export function writeAuditCsv(rows: AuditRow[]) {
  const escape = (value: string | number) =>
    `"${String(value).replace(/"/g, '""')}"`
  return (
    [
      columns.join(","),
      ...rows.map((row) =>
        columns.map((column) => escape(row[column])).join(",")
      ),
    ].join("\n") + "\n"
  )
}

export function parseAuditCsv(csv: string): CsvRow[] {
  const records: string[][] = []
  let record: string[] = [],
    field = "",
    quoted = false,
    closed = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        quoted = false
        closed = true
      } else field += c
    } else if (c === '"' && !field && !closed) quoted = true
    else if (c === "," || c === "\n" || c === "\r") {
      record.push(field)
      field = ""
      closed = false
      if (c !== ",") {
        records.push(record)
        record = []
        if (c === "\r" && csv[i + 1] === "\n") i++
      }
    } else if (closed || c === '"') throw new Error("Invalid CSV quoting")
    else field += c
  }
  if (quoted) throw new Error("Unclosed CSV quote")
  if (field || record.length || closed) {
    record.push(field)
    records.push(record)
  }
  const header = records
    .shift()
    ?.map((s, i) => (i === 0 ? s.replace(/^\uFEFF/, "") : s))
  if (
    !header ||
    header.length !== columns.length ||
    columns.some((c, i) => c !== header[i])
  )
    throw new Error("Unexpected CSV columns")
  return records
    .filter((r) => !(r.length === 1 && r[0] === ""))
    .map((r) => {
      if (r.length !== columns.length)
        throw new Error("Wrong number of CSV columns")
      return Object.fromEntries(columns.map((c, i) => [c, r[i]])) as CsvRow
    })
}

export function validateDecisions(
  rows: CsvRow[],
  data: AuditData,
  allowPreviouslyRemoved = false
): TagDecision[] {
  const tags = new Map(data.tags.map((tag) => [tag.id, tag]))
  // A retry can include sources removed by the original run. The RPC verifies
  // every ID unless this exact decision set has already been applied.
  if (allowPreviouslyRemoved) {
    for (const row of rows) {
      const decision = row.decision.trim().toLowerCase()
      const removes =
        decision === "delete" ||
        decision === "merge" ||
        (decision === "accept" &&
          (row.proposed_action === "delete-candidate" ||
            (row.proposed_action === "merge-candidate" && !!row.merge_into)))
      if (!tags.has(row.tag_id) && removes)
        tags.set(row.tag_id, {
          id: row.tag_id,
          name: row.tag,
          scope: "global",
          section_id: null,
          created_at: row.created,
        })
    }
  }
  const sections = data.nodes.filter(
    (n) =>
      n.type === "folder" &&
      data.nodes.some(
        (root) =>
          root.id === n.parent_id &&
          root.parent_id === null &&
          root.type === "folder"
      )
  )
  const resolve = (
    value: string,
    candidates: { id: string; name: string }[],
    kind: string
  ) => {
    const matches = candidates.filter(
      (item) =>
        value === item.id ||
        value === item.name ||
        value === auditLabel(item.name, item.id)
    )
    if (matches.length !== 1)
      throw new Error(`Unknown or ambiguous ${kind}: ${value}`)
    return matches[0].id
  }
  const seen = new Set<string>()
  const decisions: TagDecision[] = []
  for (const row of rows) {
    const tag = tags.get(row.tag_id)
    if (!tag || tag.name !== row.tag)
      throw new Error(`Unknown or changed tag: ${row.tag_id}`)
    if (seen.has(row.tag_id)) throw new Error(`Duplicate tag: ${row.tag_id}`)
    seen.add(row.tag_id)
    let action = row.decision.trim().toLowerCase()
    if (!action) {
      if (row.decision_section || row.decision_merge_into)
        throw new Error(`Decision missing for ${row.tag}`)
      continue
    }
    if (action === "accept")
      action =
        row.proposed_action === "delete-candidate"
          ? "delete"
          : row.proposed_action === "merge-candidate"
            ? row.merge_into
              ? "merge"
              : "keep"
            : row.proposed_action
    if (
      !(["keep", "global", "section", "merge", "delete"] as string[]).includes(
        action
      )
    )
      throw new Error(`Invalid decision for ${row.tag}: ${action}`)
    if (action !== "section" && row.decision_section)
      throw new Error(`Unexpected section for ${row.tag}`)
    if (action !== "merge" && row.decision_merge_into)
      throw new Error(`Unexpected merge target for ${row.tag}`)
    const decision: TagDecision = {
      tag_id: row.tag_id,
      action: action as TagDecision["action"],
    }
    if (action === "section")
      decision.section_id = resolve(
        row.decision_section.trim() || row.proposed_section,
        sections.map((s) => ({ id: s.id, name: s.title })),
        "section"
      )
    if (action === "merge") {
      decision.target_id = resolve(
        row.decision_merge_into.trim() || row.merge_into,
        [...tags.values()],
        "merge target"
      )
      if (decision.target_id === row.tag_id)
        throw new Error(`Cannot merge a tag into itself: ${row.tag}`)
    }
    decisions.push(decision)
  }
  for (const decision of decisions)
    if (
      decision.target_id &&
      decisions.some(
        (other) =>
          other.tag_id === decision.target_id &&
          ["merge", "delete"].includes(other.action)
      )
    )
      throw new Error(`Merge target is also removed: ${decision.target_id}`)
  return decisions
}
