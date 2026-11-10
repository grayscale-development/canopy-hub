import { readFile, writeFile, unlink } from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import { client, createReport, csv, readData } from "./wiki-link-audit"

type Report = ReturnType<typeof createReport>
type Receipt = {
  run_id: string | null
  pages: number
  revisions_before: number
  revisions_after: number
  changed_pages: number
  new_revisions: { node_id: string; new_revision_id: string }[]
}

async function main(args: string[]) {
  const file = args.shift()
  if (!file?.endsWith(".json"))
    throw new Error(
      "Usage: wiki-link-apply.ts report.json [--dry-run | --apply --i-have-approval | --verify]"
    )
  const flags = args.join(" ")
  if (
    !["", "--dry-run", "--apply --i-have-approval", "--verify"].includes(flags)
  )
    throw new Error(
      "Use --dry-run, --verify, or both --apply --i-have-approval"
    )
  const report = JSON.parse(await readFile(file, "utf8")) as Report
  if (report.version !== 1 || !report.siteHost)
    throw new Error("Invalid report")
  const prefix = file.slice(0, -5)
  if ((await readFile(`${prefix}.csv`, "utf8")) !== csv(report.rows))
    throw new Error("CSV differs from the reviewed JSON report")
  const db = client()
  const data = await readData(db)
  if (flags === "--verify") {
    const receipt = JSON.parse(
      await readFile(`${prefix}.receipt.json`, "utf8")
    ) as Receipt
    const post = createReport(data, report.siteHost)
    const remaining = post.rows.filter(
      (row) => row.current && row.status === "resolvable"
    )
    if (
      remaining.length ||
      post.pageCount !== report.pageCount ||
      post.revisionCount !== report.revisionCount + report.changes.length ||
      receipt.pages !== report.pageCount ||
      receipt.revisions_before !== report.revisionCount ||
      receipt.revisions_after !== post.revisionCount ||
      receipt.changed_pages !== report.changes.length ||
      receipt.new_revisions.length !== report.changes.length
    )
      throw new Error(
        `Verification failed: ${remaining.length} resolvable old current links, ${post.pageCount} pages, ${post.revisionCount} revisions`
      )
    for (const change of report.changes) {
      const node = data.nodes.find((n) => n.id === change.node_id)
      const id = receipt.new_revisions.find(
        (r) => r.node_id === change.node_id
      )?.new_revision_id
      const revision = data.revisions.find(
        (r) => r.id === id && r.node_id === change.node_id
      )
      if (
        !id ||
        node?.current_revision_id !== id ||
        !revision ||
        revision.change_note !== "Updated internal links" ||
        revision.plain_text !== change.plain_text ||
        !isDeepStrictEqual(revision.blocks, change.blocks)
      )
        throw new Error(`Verification failed for page ${change.node_id}`)
    }
    await writeFile(`${prefix}.after.csv`, csv(post.rows), { flag: "wx" })
    console.log(
      `Verified: ${post.pageCount} pages, ${report.revisionCount} -> ${post.revisionCount} revisions; ${report.changes.length} new revisions; zero resolvable old current links. Wrote ${prefix}.after.csv`
    )
    return
  }
  const live = createReport(data, report.siteHost)
  if (!isDeepStrictEqual(report, live))
    throw new Error(
      "Data or report changed since preview; generate and review a new report"
    )
  const docs = report.rows.filter(
    (r) => r.location === "release-note" && r.status === "resolvable"
  )
  if (docs.length)
    throw new Error(
      `Update ${docs.length} resolvable links in docs/releases, then generate and review a new report`
    )
  console.log(
    `${flags === "--apply --i-have-approval" ? "Applying" : "Dry run:"} ${report.changes.length} pages; ${report.rows.filter((r) => r.status === "unresolvable").length} unresolved links remain in the report`
  )
  if (!flags || flags === "--dry-run") return
  if (!report.changes.length) {
    const receipt: Receipt = {
      run_id: null,
      pages: report.pageCount,
      revisions_before: report.revisionCount,
      revisions_after: report.revisionCount,
      changed_pages: 0,
      new_revisions: [],
    }
    await writeFile(
      `${prefix}.receipt.json`,
      JSON.stringify(receipt, null, 2) + "\n",
      { flag: "wx" }
    )
    console.log("No pages need changes; run --verify to complete the check.")
    return
  }
  const nodeSnapshot = data.nodes.map(
    ({
      id,
      parent_id,
      slug,
      short_id,
      type,
      title,
      status,
      current_revision_id,
    }) => ({
      id,
      parent_id,
      slug,
      short_id,
      type,
      title,
      status,
      current_revision_id,
    })
  )
  const receiptFile = `${prefix}.receipt.json`
  await writeFile(
    receiptFile,
    "Apply started; if interrupted, see recovery in docs/wiki-link-rewrite.md.\n",
    { flag: "wx" }
  )
  const { data: receipt, error } = await db.rpc("apply_wiki_link_rewrite", {
    p_nodes: nodeSnapshot,
    p_revision_count: report.revisionCount,
    p_changes: report.changes,
  })
  if (error) {
    await unlink(receiptFile)
    throw new Error(error.message)
  }
  await writeFile(receiptFile, JSON.stringify(receipt, null, 2) + "\n")
  console.log(
    `Applied run ${receipt.run_id}; saved ${receiptFile}. Run --verify before considering the job complete.`
  )
}
main(process.argv.slice(2)).catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
