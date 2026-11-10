import { readFileSync } from "node:fs"
import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { buildTagAuditReport, type AuditData } from "@/lib/wiki-tag-audit"
import {
  parseAuditCsv,
  validateDecisions,
  writeAuditCsv,
} from "@/lib/wiki-tag-audit-csv"
import { readAuditData } from "@/scripts/wiki-tag-audit"

const fixture = JSON.parse(
  readFileSync("tests/fixtures/db/wiki-tag-audit.json", "utf8")
) as AuditData

describe("tag audit report", () => {
  it("reports every tag, adjacent lexical groups, scopes and root pages", () => {
    const rows = buildTagAuditReport(fixture)
    expect(rows).toHaveLength(260)
    const closing = rows.filter((row) =>
      ["Closing", "closing", "Closings"].includes(row.tag)
    )
    expect(closing).toHaveLength(3)
    expect(new Set(closing.map((row) => row.merge_group)).size).toBe(1)
    expect(
      rows
        .filter((row) => row.merge_group === closing[0].merge_group)
        .every((row) => row.proposed_action === "merge-candidate")
    ).toBe(true)
    expect(
      rows.find((row) => row.tag === "Unused Topic")?.proposed_action
    ).toBe("delete-candidate")
    expect(rows.some((row) => row.proposed_action === "section")).toBe(true)
    expect(
      rows.some(
        (row) =>
          row.proposed_action === "global" &&
          row.reason.includes("outside a section")
      )
    ).toBe(true)
    expect(
      rows.some(
        (row) =>
          row.proposed_action === "global" && row.sections_used_in.includes(";")
      )
    ).toBe(true)
    expect(rows.every((row) => row.decision === "")).toBe(true)
    const positions = closing
      .map((row) => rows.indexOf(row))
      .sort((a, b) => a - b)
    expect(positions[2] - positions[0]).toBe(2)
  })

  it("round trips quoted CSV and validates reviewed decisions", () => {
    const rows = buildTagAuditReport(fixture)
    const original = rows.find((r) => r.proposed_action === "section")!
    const special = { ...original, reason: 'He said "hello",\nthen left' }
    const parsed = parseAuditCsv(writeAuditCsv([special]))
    expect(parsed[0].reason).toBe(special.reason)
    expect(validateDecisions(parsed, fixture)).toEqual([])
    parsed[0].decision = "accept"
    expect(validateDecisions(parsed, fixture)).toEqual([
      {
        tag_id: original.tag_id,
        action: "section",
        section_id: expect.any(String),
      },
    ])
    expect(() => validateDecisions([parsed[0], parsed[0]], fixture)).toThrow(
      "Duplicate"
    )
    expect(() =>
      validateDecisions([{ ...parsed[0], tag_id: "missing" }], fixture)
    ).toThrow("Unknown")
    expect(() =>
      validateDecisions(
        [{ ...parsed[0], decision_section: "missing" }],
        fixture
      )
    ).toThrow("Unknown")
    expect(() => parseAuditCsv('tag_id\n"unclosed')).toThrow()
    const one = rows.find((r) => r.merge_into)!
    const merge = parseAuditCsv(writeAuditCsv([one]))[0]
    merge.decision = "accept"
    expect(validateDecisions([merge], fixture)[0].action).toBe("merge")
    const target = fixture.tags.find((t) =>
      one.merge_into.endsWith(`[${t.id}]`)
    )!
    const targetRow = parseAuditCsv(
      writeAuditCsv([rows.find((r) => r.tag_id === target.id)!])
    )[0]
    targetRow.decision = "delete"
    expect(() => validateDecisions([merge, targetRow], fixture)).toThrow(
      "also removed"
    )
    const afterMerge = {
      ...fixture,
      tags: fixture.tags.filter((tag) => tag.id !== merge.tag_id),
    }
    expect(() => validateDecisions([merge], afterMerge)).toThrow("Unknown")
    expect(validateDecisions([merge], afterMerge, true)).toEqual(
      validateDecisions([merge], fixture)
    )
  })

  it("uses only select queries and paginates the live reader", async () => {
    const calls: string[] = []
    const client = {
      from(table: string) {
        calls.push(`from:${table}`)
        return {
          select(fields: string) {
            calls.push(`select:${fields}`)
            return {
              order() {
                return this
              },
              async range(start: number) {
                return {
                  data: start
                    ? []
                    : table === "wiki_tags"
                      ? fixture.tags
                      : table === "wiki_nodes"
                        ? fixture.nodes
                        : fixture.pageTags,
                  error: null,
                }
              },
            }
          },
        }
      },
    } as unknown as SupabaseClient
    expect(await readAuditData(client)).toEqual(fixture)
    expect(calls.filter((call) => call.startsWith("select:"))).toHaveLength(3)
    expect(calls.filter((call) => call.startsWith("from:"))).toEqual([
      "from:wiki_tags",
      "from:wiki_page_tags",
      "from:wiki_nodes",
    ])
  })
})
