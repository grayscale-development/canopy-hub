import "server-only"

import crypto from "node:crypto"

import {
  createChatResponseWithOpenAI,
  createEmbeddingsWithOpenAI,
  getChatModel,
} from "@/lib/ai/provider"
import {
  fetchBranchesDirectoryRows,
  fetchEmployeeDirectoryRows,
  type EmployeeDirectoryRow,
} from "@/lib/hub-data"
import { answerMiloQuestionWithAgent } from "@/lib/milo/agent"
import { getFeaturedReports } from "@/lib/reports"
import {
  fetchSupportDirectoryData,
  type SupportDirectorySection,
} from "@/lib/support-directory-data"
import {
  chunkKnowledgeText,
  estimateTokenCount,
  type SupabaseWikiClient,
  type WikiAssetRow,
  type WikiNodeRow,
  type WikiRevisionRow,
} from "@/lib/wiki"

function createContentHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  callback: (item: T) => Promise<unknown>
) {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex]
        nextIndex += 1
        await callback(item)
      }
    })
  )
}

export type KnowledgeSourceType =
  | "wiki_page"
  | "wiki_asset"
  | "newsletter"
  | "document"
  | "report"
  | "support"
  | "site"
  | "employee"
  | "branch"

interface IndexKnowledgeSourceInput {
  sourceType: KnowledgeSourceType
  sourceId: string
  title: string
  url: string | null
  content: string
  metadata?: Record<string, unknown>
  status?: "active" | "archived" | "error"
  errorMessage?: string | null
}

interface RetrievedChunk {
  chunk_id: string
  source_id: string
  source_type: KnowledgeSourceType
  source_title: string
  source_url: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

interface ChatCitation {
  knowledgeSourceId: string | null
  knowledgeChunkId: string | null
  title: string
  url: string | null
  snippet: string
}

export async function embedTexts(texts: string[]) {
  return createEmbeddingsWithOpenAI(texts)
}

async function createEmbeddingsIfConfigured(texts: string[]) {
  if (!process.env.OPENAI_API_KEY || !texts.length) {
    return texts.map(() => null)
  }

  try {
    return await embedTexts(texts)
  } catch {
    return texts.map(() => null)
  }
}

export async function indexKnowledgeSource(
  supabase: SupabaseWikiClient,
  input: IndexKnowledgeSourceInput
) {
  const normalizedContent = input.content.trim()
  const contentHash = createContentHash(
    JSON.stringify({
      content: normalizedContent,
      metadata: input.metadata ?? {},
      status: input.status ?? "active",
    })
  )

  const { data: existingSource, error: existingError } = await supabase
    .from("knowledge_sources")
    .select("id,content_hash")
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId)
    .maybeSingle()

  if (existingError) {
    throw new Error(existingError.message)
  }

  const unchanged =
    existingSource?.content_hash === contentHash &&
    (input.status ?? "active") === "active"

  const { data: source, error: sourceError } = await supabase
    .from("knowledge_sources")
    .upsert(
      {
        source_type: input.sourceType,
        source_id: input.sourceId,
        title: input.title,
        url: input.url,
        metadata: input.metadata ?? {},
        content_hash: contentHash,
        status: input.status ?? "active",
        last_indexed_at: new Date().toISOString(),
        error_message: input.errorMessage ?? null,
      },
      { onConflict: "source_type,source_id" }
    )
    .select("id")
    .single()

  if (sourceError) {
    throw new Error(sourceError.message)
  }

  if (unchanged && source?.id) {
    return source.id as string
  }

  const { error: deleteError } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source_id", source.id)

  if (deleteError) {
    throw new Error(deleteError.message)
  }

  if ((input.status ?? "active") !== "active") {
    return source.id as string
  }

  const chunks = chunkKnowledgeText(normalizedContent)
  if (!chunks.length) {
    return source.id as string
  }

  const embeddings = await createEmbeddingsIfConfigured(chunks)
  const rows = chunks.map((content, index) => ({
    source_id: source.id,
    chunk_index: index,
    content,
    token_count: estimateTokenCount(content),
    embedding: embeddings[index],
    metadata: {
      ...(input.metadata ?? {}),
      chunkIndex: index,
    },
  }))

  const { error: chunkError } = await supabase
    .from("knowledge_chunks")
    .insert(rows)
  if (chunkError) {
    throw new Error(chunkError.message)
  }

  return source.id as string
}

export async function archiveKnowledgeSource({
  supabase,
  sourceType,
  sourceId,
}: {
  supabase: SupabaseWikiClient
  sourceType: KnowledgeSourceType
  sourceId: string
}) {
  const { error } = await supabase
    .from("knowledge_sources")
    .update({
      status: "archived",
      last_indexed_at: new Date().toISOString(),
    })
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)

  if (error) {
    throw new Error(error.message)
  }
}

export async function indexWikiPage({
  supabase,
  node,
  revision,
  path,
  isPublished = node.status === "published",
}: {
  supabase: SupabaseWikiClient
  node: WikiNodeRow
  revision: WikiRevisionRow | null
  path: string
  isPublished?: boolean
}) {
  const content = revision?.plain_text?.trim() ?? ""
  return indexKnowledgeSource(supabase, {
    sourceType: "wiki_page",
    sourceId: node.id,
    title: node.title,
    url: `/wiki/${path}`,
    content: content || `${node.title}\n${node.status} wiki page.`,
    metadata: {
      nodeId: node.id,
      path,
      status: node.status,
      revisionId: revision?.id ?? null,
    },
    status: isPublished ? "active" : "archived",
  })
}

export async function indexWikiAsset({
  supabase,
  asset,
  pageTitle,
  pagePath,
  isPagePublished = true,
}: {
  supabase: SupabaseWikiClient
  asset: WikiAssetRow
  pageTitle: string
  pagePath: string
  isPagePublished?: boolean
}) {
  const metadataText = [
    asset.title,
    asset.description,
    asset.alt_text,
    asset.file_name,
    `${asset.kind} uploaded on ${pageTitle}`,
  ]
    .filter(Boolean)
    .join("\n")

  return indexKnowledgeSource(supabase, {
    sourceType: "wiki_asset",
    sourceId: asset.id,
    title: asset.title?.trim() || asset.file_name,
    url: `/wiki/${pagePath}`,
    content: [metadataText, asset.extracted_text].filter(Boolean).join("\n\n"),
    metadata: {
      assetId: asset.id,
      nodeId: asset.node_id,
      kind: asset.kind,
      fileName: asset.file_name,
      mimeType: asset.mime_type,
      pageTitle,
      pagePath,
    },
    status:
      asset.status === "active" && isPagePublished ? "active" : "archived",
  })
}

export async function indexCuratedSiteKnowledge(supabase: SupabaseWikiClient) {
  const reports = getFeaturedReports()
  let indexedCount = 0
  await mapWithConcurrency(reports, 6, (report) =>
    indexKnowledgeSource(supabase, {
      sourceType: "report",
      sourceId: report.id,
      title: report.title,
      url: report.href,
      content: [
        `Report: ${report.title}`,
        report.description,
        `To view this report, open ${report.href}.`,
        `Route: ${report.href}`,
      ].join("\n"),
      metadata: { reportId: report.id },
    })
  )
  indexedCount += reports.length

  const support = await fetchSupportDirectoryData()
  const supportSections = [
    support.generalHelpSection,
    ...support.rushSections,
    ...support.departments,
  ].filter((section): section is SupportDirectorySection => Boolean(section))

  await mapWithConcurrency(supportSections, 4, (section) => {
    const sectionContacts = section.items.flatMap((item) => item.contacts)
    const managerContact = section.managerName
      ? sectionContacts.find(
          (contact) =>
            contact.name.trim().toLowerCase() ===
              section.managerName?.trim().toLowerCase() && contact.phone
        )
      : null
    const managerPhone = managerContact?.phone ?? section.managerPhone
    const entries = section.items
      .map((item) => {
        const contacts = item.contacts
          .map((contact) =>
            [
              contact.name ? `Contact: ${contact.name}` : null,
              contact.role ? `Contact role: ${contact.role}` : null,
              contact.email ? `Contact email: ${contact.email}` : null,
              contact.phone ? `Contact phone: ${contact.phone}` : null,
            ]
              .filter(Boolean)
              .join("\n")
          )
          .join("\n")

        return [
          `Entry: ${item.title}`,
          item.description ? `Entry description: ${item.description}` : null,
          item.emails.length ? `Entry emails: ${item.emails.join(", ")}` : null,
          item.monitoredBy ? `Monitored by: ${item.monitoredBy}` : null,
          item.notes.length ? `Entry notes: ${item.notes.join("\n")}` : null,
          contacts,
        ]
          .filter(Boolean)
          .join("\n")
      })
      .join("\n\n")

    return indexKnowledgeSource(supabase, {
      sourceType: "support",
      sourceId: section.id,
      title: section.title,
      url: `/department-directory?query=${encodeURIComponent(section.title)}`,
      content: [
        `Department directory section: ${section.title}`,
        `Section kind: ${section.kind}`,
        section.description
          ? `Section description: ${section.description}`
          : null,
        section.managerName ? `Manager: ${section.managerName}` : null,
        managerPhone ? `Manager phone: ${managerPhone}` : null,
        section.notes.length
          ? `Section notes: ${section.notes.join("\n")}`
          : null,
        entries,
      ]
        .filter(Boolean)
        .join("\n\n"),
      metadata: { sectionId: section.id, kind: section.kind },
    })
  })
  indexedCount += supportSections.length

  const [employees, branches] = await Promise.all([
    fetchEmployeeDirectoryRows(),
    fetchBranchesDirectoryRows(),
  ])

  await mapWithConcurrency(employees, 4, (employee) =>
    indexKnowledgeSource(supabase, {
      sourceType: "employee",
      sourceId: employee.id,
      title: employee.employee,
      url: `/employee/${encodeURIComponent(employee.id)}`,
      content: [
        `Employee: ${employee.employee}`,
        employee.jobTitle ? `Job title: ${employee.jobTitle}` : null,
        employee.workEmail ? `Work email: ${employee.workEmail}` : null,
        employee.mobilePhone ? `Phone: ${employee.mobilePhone}` : null,
        employee.division ? `Division: ${employee.division}` : null,
        employee.branch ? `Branch: ${employee.branch}` : null,
        employee.branchId ? `Branch ID: ${employee.branchId}` : null,
        employee.divisionId ? `Division ID: ${employee.divisionId}` : null,
        "This employee can also be found in the People directory.",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        employeeId: employee.id,
        workEmail: employee.workEmail,
        mobilePhone: employee.mobilePhone,
        branchId: employee.branchId,
        divisionId: employee.divisionId,
      },
    })
  )
  indexedCount += employees.length

  await mapWithConcurrency(branches, 4, (branch) =>
    indexKnowledgeSource(supabase, {
      sourceType: "branch",
      sourceId: branch.id,
      title: branch.branch ?? `Branch ${branch.id}`,
      url: `/branch/${encodeURIComponent(branch.id)}`,
      content: [
        `Branch: ${branch.branch ?? branch.id}`,
        branch.accountingCode
          ? `Accounting code: ${branch.accountingCode}`
          : null,
        branch.address ? `Address: ${branch.address}` : null,
        branch.city ? `City: ${branch.city}` : null,
        branch.state ? `State: ${branch.state}` : null,
        branch.zip ? `ZIP: ${branch.zip}` : null,
        "This branch can also be found in the Branches directory.",
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        branchId: branch.id,
        accountingCode: branch.accountingCode,
      },
    })
  )
  indexedCount += branches.length

  const reportLinks = reports
    .map((report) => `- ${report.title}: ${report.href}`)
    .join("\n")
  const sitePages = [
    {
      id: "home",
      title: "Home",
      url: "/home",
      content:
        "Home is the Canopy Hub dashboard. To view the home dashboard, open /home. It includes production summaries and quick links.",
    },
    {
      id: "reports",
      title: "Reports",
      url: "/reports",
      content: [
        "Reports is the Canopy Hub reports library.",
        "To view reports, open /reports.",
        "Use /reports to choose focused views for production, turn times, file quality, specialists points, and loan program trends.",
        "Available report pages:",
        reportLinks,
      ].join("\n"),
    },
    {
      id: "pipeline",
      title: "Pipeline",
      url: "/pipeline",
      content:
        "Pipeline is the Canopy Hub pipeline page. To view pipeline information and file status, open /pipeline.",
    },
    {
      id: "support-directory",
      title: "Department Directory",
      url: "/department-directory",
      content:
        "Department Directory is the Canopy Hub support directory. To find support departments, rush contacts, monitored inboxes, emails, phone numbers, department managers, and escalation notes, open /department-directory.",
    },
    {
      id: "employee-directory",
      title: "People",
      url: "/people",
      content:
        "People is the Canopy Hub employee directory. To find employees, job titles, work emails, mobile phones, branches, and divisions, open /people.",
    },
    {
      id: "branches",
      title: "Branches",
      url: "/branches",
      content:
        "Branches is the Canopy Hub branch directory. To find branch names, branch IDs, accounting codes, and branch addresses, open /branches.",
    },
    {
      id: "wiki",
      title: "Wiki",
      url: "/wiki",
      content:
        "Wiki contains internal documentation. To view Wiki documentation, open /wiki. It is organized by Canopy Wiki, Learning Hub, and Nano Wiki repositories, sections, groups, and pages.",
    },
    {
      id: "newsletters",
      title: "Newsletters",
      url: "/newsletters",
      content:
        "Newsletters contains company newsletter PDFs. To view newsletters by month and year, open /newsletters.",
    },
    {
      id: "bridge",
      title: "Bridge",
      url: "/bridge",
      content:
        "Bridge is a Canopy Hub page for cross-system or operational handoff workflows. To view Bridge, open /bridge.",
    },
    {
      id: "file-viewer",
      title: "File Viewer",
      url: "/file-viewer",
      content:
        "File Viewer is a Canopy Hub page for finding and inspecting loan file data. To view File Viewer, open /file-viewer.",
    },
    {
      id: "file-quality-dashboard",
      title: "File Quality Dashboard",
      url: "/reports/file-quality",
      content:
        "File Quality dashboard is a Canopy Hub page for branch and division quality metrics and monthly quality review. To view the File Quality dashboard, open /reports/file-quality.",
    },
    {
      id: "points-specialists",
      title: "Points Specialists",
      url: "/reports/specialists-points",
      content:
        "Points Specialists is a Canopy Hub page for reviewing specialist point totals by month, week, organization, and user. To view Points Specialists, open /reports/specialists-points.",
    },
    {
      id: "settings",
      title: "Settings",
      url: "/settings",
      content:
        "Settings contains administrative controls, permissions, Milo indexing, and data sync status for users with access. To view settings, open /settings.",
    },
  ]

  await mapWithConcurrency(sitePages, 6, (page) =>
    indexKnowledgeSource(supabase, {
      sourceType: "site",
      sourceId: page.id,
      title: page.title,
      url: page.url,
      content: page.content,
      metadata: { pageId: page.id },
    })
  )
  indexedCount += sitePages.length

  return indexedCount
}

export async function retrieveKnowledge(
  supabase: SupabaseWikiClient,
  question: string,
  matchCount = 12
) {
  const expandedQuestion = expandKnowledgeSearchQuery(question)
  const keywordMatches = await retrieveKeywordKnowledge(
    supabase,
    expandedQuestion,
    Math.min(matchCount, 8)
  )
  const [embedding] = await embedTexts([expandedQuestion])
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    query_embedding: embedding,
    match_count: matchCount,
    source_types: null,
  })

  if (error) {
    throw new Error(error.message)
  }

  return mergeRetrievedChunks([
    ...keywordMatches,
    ...((data ?? []) as RetrievedChunk[]),
  ]).slice(0, matchCount)
}

async function retrieveKeywordKnowledge(
  supabase: SupabaseWikiClient,
  question: string,
  matchCount: number
) {
  const { data, error } = await supabase.rpc("match_knowledge_chunks_keyword", {
    search_query: question,
    match_count: matchCount,
    source_types: null,
  })

  if (error) {
    return []
  }

  return (data ?? []) as RetrievedChunk[]
}

function expandKnowledgeSearchQuery(question: string) {
  const expanded = question.replace(/\bauth\b/gi, "authorization")
  return expanded === question ? question : `${question} ${expanded}`
}

function mergeRetrievedChunks(chunks: RetrievedChunk[]) {
  const byChunkId = new Map<string, RetrievedChunk>()

  for (const chunk of chunks) {
    const existing = byChunkId.get(chunk.chunk_id)
    if (!existing || chunk.similarity > existing.similarity) {
      byChunkId.set(chunk.chunk_id, chunk)
    }
  }

  return [...byChunkId.values()]
}

function isSimpleNavigationQuestion(question: string) {
  return /\b(how|where|what|which|can|could|show|open|view|find|access|go)\b/i.test(
    question
  )
}

function isAskingForManySources(question: string) {
  return /\b(all|available|options|list|which ones|what reports|what documents|what newsletters|sources|links)\b/i.test(
    question
  )
}

function getConversationalReply(question: string) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) {
    return null
  }

  const words = normalized.split(" ")

  if (words.length > 4) {
    return null
  }

  const greetings = new Set([
    "hello",
    "hello milo",
    "hey",
    "hey milo",
    "hi",
    "hi milo",
    "howdy",
    "howdy milo",
    "good morning",
    "good afternoon",
    "good evening",
    "morning",
    "afternoon",
    "evening",
  ])
  const thanks = new Set([
    "thanks",
    "thanks milo",
    "thank you",
    "thank you milo",
    "thx",
  ])

  if (greetings.has(normalized)) {
    return "Howdy! How can I help with Canopy Hub?"
  }

  if (thanks.has(normalized)) {
    return "You're welcome."
  }

  return null
}

function normalizeLookupText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function extractEmployeeLookupName(question: string) {
  const normalized = normalizeLookupText(question)

  if (!normalized) {
    return null
  }

  const prefixed = normalized.match(
    /^(?:tell me about|what can you tell me about|who is|who's|find|look up|lookup|search for)\s+(.+)$/
  )
  const candidate = (prefixed?.[1] ?? normalized)
    .replace(/\b(?:employee|person|please)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!candidate) {
    return null
  }

  const blockedTerms = new Set([
    "branch",
    "branches",
    "dashboard",
    "document",
    "documents",
    "file",
    "files",
    "newsletter",
    "newsletters",
    "policy",
    "policies",
    "report",
    "reports",
    "support",
    "wiki",
  ])
  const words = candidate.split(" ")

  if (
    words.length < 2 ||
    words.length > 4 ||
    words.some((word) => blockedTerms.has(word))
  ) {
    return null
  }

  return candidate
}

function hasExplicitEmployeeLookupIntent(question: string) {
  return /\b(employee|person|people|people directory|user|staff|team member|contact|email|phone|mobile|job title|role|who is|who's)\b/i.test(
    question
  )
}

function findEmployeeMatches(
  employees: EmployeeDirectoryRow[],
  lookupName: string
) {
  const normalizedLookup = normalizeLookupText(lookupName)
  const lookupWords = normalizedLookup.split(" ")

  const exactMatches = employees.filter(
    (employee) => normalizeLookupText(employee.employee) === normalizedLookup
  )
  if (exactMatches.length) {
    return exactMatches
  }

  return employees.filter((employee) => {
    const normalizedName = normalizeLookupText(employee.employee)
    return lookupWords.every((word) => normalizedName.includes(word))
  })
}

function formatEmployeeAnswer(employee: EmployeeDirectoryRow) {
  const details = [
    employee.jobTitle ? `Job title: ${employee.jobTitle}` : null,
    employee.workEmail ? `Work email: ${employee.workEmail}` : null,
    employee.mobilePhone ? `Phone: ${employee.mobilePhone}` : null,
    employee.division ? `Division: ${employee.division}` : null,
    employee.branch ? `Branch: ${employee.branch}` : null,
    employee.branchId ? `Branch ID: ${employee.branchId}` : null,
  ].filter(Boolean)
  const profileUrl = `/employee/${encodeURIComponent(employee.id)}`

  return [
    `${employee.employee} is listed in the People directory.`,
    details.length ? details.join("\n") : null,
    `Profile: [${employee.employee}](${profileUrl})`,
  ]
    .filter(Boolean)
    .join("\n")
}

async function answerEmployeeLookup(question: string) {
  const lookupName = extractEmployeeLookupName(question)

  if (!lookupName) {
    return null
  }

  try {
    const employees = await fetchEmployeeDirectoryRows()
    const matches = findEmployeeMatches(employees, lookupName).slice(0, 5)
    const hasEmployeeIntent = hasExplicitEmployeeLookupIntent(question)

    if (matches.length === 1) {
      return formatEmployeeAnswer(matches[0])
    }

    if (matches.length > 1) {
      return [
        `I found ${matches.length} matching employees in the People directory:`,
        ...matches.map((employee) => {
          const profileUrl = `/employee/${encodeURIComponent(employee.id)}`
          const role = employee.jobTitle ? `, ${employee.jobTitle}` : ""
          return `- [${employee.employee}](${profileUrl})${role}`
        }),
      ].join("\n")
    }

    if (!hasEmployeeIntent) {
      return null
    }

    const hasEmployeeRows = employees.length > 0
    return hasEmployeeRows
      ? `I could not find ${lookupName} in the People directory. Open [People](/people) to search the current employee list.`
      : `I do not have employee rows available in the People directory right now, so I cannot look up ${lookupName}. Open [People](/people) after the employee data sync is populated.`
  } catch {
    return null
  }
}

function selectAnswerChunks(question: string, chunks: RetrievedChunk[]) {
  if (chunks.length <= 2) {
    return chunks
  }

  const [topChunk] = chunks
  const topSimilarity = topChunk?.similarity ?? 0
  const simpleNavigation =
    isSimpleNavigationQuestion(question) &&
    !isAskingForManySources(question) &&
    topChunk?.source_type === "site" &&
    topSimilarity >= 0.8

  if (simpleNavigation) {
    return [topChunk]
  }

  const citationLimit = isAskingForManySources(question) ? 5 : 3
  const minimumSimilarity = Math.max(0.35, topSimilarity * 0.65)

  return chunks
    .filter(
      (chunk, index) => index === 0 || chunk.similarity >= minimumSimilarity
    )
    .slice(0, citationLimit)
}

function buildChatPrompt(question: string, chunks: RetrievedChunk[]) {
  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.source_title} (${chunk.source_type})\nURL: ${
          chunk.source_url ?? "No URL"
        }\n${chunk.content}`
    )
    .join("\n\n")

  return `You are Canopy Hub's internal knowledge assistant. Answer only from the supplied context. If the context does not contain enough information, say that the knowledge base does not have enough information and suggest where to look in Canopy Hub. Keep answers concise and cite sources using bracket numbers like [1]. Use the smallest number of citations needed; for simple navigation or factual lookup questions, usually cite only one source. Do not list every related source unless the user asks for options, all links, or a list. When the question asks for a page, document, newsletter, employee, branch, email, or phone number, include the exact value and the relevant Hub URL from the context when available.\n\nContext:\n${context || "No retrieved context."}\n\nQuestion:\n${question}`
}

function getResponseText(response: unknown) {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text
  }

  return ""
}

export async function answerKnowledgeQuestion({
  supabase,
  question,
}: {
  supabase: SupabaseWikiClient
  question: string
}) {
  const conversationalReply = getConversationalReply(question)

  if (conversationalReply) {
    return {
      answer: conversationalReply,
      model: null,
      citations: [],
    }
  }

  const employeeLookupAnswer = await answerEmployeeLookup(question)

  if (employeeLookupAnswer) {
    return {
      answer: employeeLookupAnswer,
      model: null,
      citations: [],
    }
  }

  try {
    return await answerMiloQuestionWithAgent({ question })
  } catch {
    // Keep the existing RAG path as a reliable fallback if the agent/tool loop fails.
  }

  const chunks = await retrieveKnowledge(supabase, question)
  const answerChunks = selectAnswerChunks(question, chunks)
  const citations = answerChunks.map<ChatCitation>((chunk) => ({
    knowledgeSourceId: chunk.source_id,
    knowledgeChunkId: chunk.chunk_id,
    title: chunk.source_title,
    url: chunk.source_url,
    snippet: chunk.content.slice(0, 360),
  }))

  if (!chunks.length) {
    return {
      answer:
        "I could not find enough information in the Canopy Hub knowledge base to answer that.",
      model: null,
      citations,
    }
  }

  const model = getChatModel()
  const response = await createChatResponseWithOpenAI({
    model,
    input: buildChatPrompt(question, answerChunks),
  })

  return {
    answer:
      getResponseText(response) ||
      "I could not generate an answer from the retrieved knowledge.",
    model,
    citations,
  }
}
