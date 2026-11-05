import crypto from "node:crypto"

import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"

import {
  createAgentResponseWithOpenAI,
  getWikiImportModel,
} from "@/lib/ai/provider"
import { BETA_1_PERMISSION } from "@/lib/permission-codes"
import { userHasPermissionCode } from "@/lib/permissions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  buildWikiPath,
  blockNoteToPlainText,
  fetchWikiNodes,
  getWikiAssetKind,
  sanitizeWikiFileName,
  syncWikiPageTags,
  WIKI_BUCKET,
  WIKI_MANAGE_PERMISSION,
  WIKI_MAX_UPLOAD_SIZE_BYTES,
  WIKI_MAX_UPLOAD_SIZE_LABEL,
  type WikiNodeRow,
  type WikiRevisionRow,
} from "@/lib/wiki"
import {
  extractWikiDocumentText,
  extractWikiDocxDocument,
  extractWikiPdfDocument,
  isWikiDocxFile,
  type WikiExtractedDocx,
  type WikiExtractedPdf,
} from "@/lib/wiki-extract"
import {
  buildWikiImportPrompt,
  buildWikiPdfStructureHints,
  createUniqueWikiImportSlug,
  createWikiImportContentHash,
  createWikiDocxImportDraft,
  createWikiImportDraft,
  createWikiVideoImportDraft,
  isSupportedWikiImportFile,
  isFaithfulWikiImportOutput,
  isWikiImportVideoFile,
  normalizeWikiImportText,
  titleFromWikiImportFileName,
  WIKI_IMPORT_MAX_TEXT_LENGTH,
  type WikiImportAiOutput,
} from "@/lib/wiki-import"
import { archiveKnowledgeSource } from "@/lib/wiki-ai"

export const runtime = "nodejs"
export const maxDuration = 60

type WikiAiUpdateMode = "update" | "replace"

function mergeWikiPageContent({
  existingRevision,
  draft,
  mode,
}: {
  existingRevision: WikiRevisionRow | null
  draft: { blocks: Array<Record<string, unknown>>; plainText: string }
  mode: WikiAiUpdateMode
}) {
  if (mode === "replace" || !existingRevision) {
    return { blocks: draft.blocks, plainText: draft.plainText }
  }

  const existingBlocks = Array.isArray(existingRevision.blocks)
    ? existingRevision.blocks
    : []
  return {
    blocks: [...existingBlocks, ...draft.blocks],
    plainText: [existingRevision.plain_text, draft.plainText]
      .filter(Boolean)
      .join("\n\n"),
  }
}

function getResponseText(response: unknown) {
  return response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
    ? response.output_text
    : ""
}

function parseAiOutput(response: unknown): WikiImportAiOutput | null {
  const text = getResponseText(response)
    .trim()
    .replace(/^```(?:json)?\s*|\s*```$/gi, "")
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as WikiImportAiOutput
  } catch {
    return null
  }
}

function importSchema() {
  return {
    type: "json_schema" as const,
    name: "wiki_import_response",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "tags", "markdown"],
      properties: {
        title: { type: "string", maxLength: 80 },
        tags: { type: "array", items: { type: "string" }, maxItems: 5 },
        markdown: { type: "string" },
      },
    },
  }
}

async function getImportAiOutput(
  text: string,
  fileName: string,
  structureHints = "",
  existingText = ""
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await createAgentResponseWithOpenAI(
      {
        model: getWikiImportModel(),
        input: buildWikiImportPrompt({
          text,
          fileName,
          structureHints,
          existingText,
        }),
        max_output_tokens: 6_000,
        reasoning: { effort: "low" },
        store: false,
        text: { format: importSchema(), verbosity: "low" },
      },
      { signal: controller.signal }
    )
    const output = parseAiOutput(response)
    // This fixture is deliberately used to diagnose PDF-layout fidelity. Keep
    // this narrow, temporary debug trace so normal imports never log document
    // text. It records the response before validation/fallback changes it.
    if (fileName === "wiki-import-cid-text.pdf") {
      console.debug("Wiki import raw model markdown", {
        fileName,
        markdown: output?.markdown,
      })
    }
    return output
  } finally {
    clearTimeout(timeout)
  }
}

async function cleanUpImport({
  nodeId,
  storagePaths,
}: {
  nodeId?: string
  storagePaths?: string[]
}) {
  const admin = createSupabaseAdminClient()
  if (nodeId) {
    await admin.from("wiki_nodes").delete().eq("id", nodeId)
  }
  if (storagePaths?.length) {
    await admin.storage.from(WIKI_BUCKET).remove(storagePaths)
  }
}

function wikiImportImageExtension(contentType: string) {
  const extension = contentType.toLowerCase().split("/")[1]?.split("+")[0]
  return extension && /^[a-z0-9]+$/.test(extension) ? extension : "bin"
}

async function completeWikiVideoImport({
  assetId,
  nodeId,
  mode,
  isPageUpdate,
  supabase,
  userId,
}: {
  assetId: string
  nodeId: string
  mode: WikiAiUpdateMode
  isPageUpdate: boolean
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
  userId: string
}) {
  if (!assetId || !nodeId) {
    return NextResponse.json(
      { error: "Video details are required." },
      { status: 400 }
    )
  }

  const { data: asset, error: assetError } = await supabase
    .from("wiki_assets")
    .select("id,node_id,file_name,kind,status,extracted_text,created_by")
    .eq("id", assetId)
    .eq("node_id", nodeId)
    .eq("created_by", userId)
    .maybeSingle()
  if (assetError) {
    return NextResponse.json({ error: assetError.message }, { status: 400 })
  }
  if (!asset || asset.kind !== "video" || asset.status !== "active") {
    return NextResponse.json(
      { error: "Video asset not found." },
      { status: 404 }
    )
  }

  const { data: node, error: nodeError } = await supabase
    .from("wiki_nodes")
    .select("id,parent_id,type,status,created_by,current_revision_id")
    .eq("id", nodeId)
    .eq("type", "page")
    .maybeSingle()
  if (nodeError) {
    return NextResponse.json({ error: nodeError.message }, { status: 400 })
  }
  if (
    !node ||
    (!isPageUpdate && (node.status !== "draft" || node.created_by !== userId))
  ) {
    return NextResponse.json(
      { error: "Video draft not found." },
      { status: 404 }
    )
  }

  const transcript = normalizeWikiImportText(asset.extracted_text ?? "")
  if (!transcript) {
    return NextResponse.json(
      { error: "We could not create a transcript for that video." },
      { status: 400 }
    )
  }

  const draft = createWikiVideoImportDraft({
    assetId,
    fileName: asset.file_name,
    transcript,
  })
  const currentRevision =
    isPageUpdate && node.current_revision_id
      ? ((
          await supabase
            .from("wiki_page_revisions")
            .select(
              "id,node_id,blocks,plain_text,change_note,created_by,created_at"
            )
            .eq("id", node.current_revision_id)
            .maybeSingle()
        ).data as WikiRevisionRow | null)
      : null
  const content = mergeWikiPageContent({
    existingRevision: currentRevision,
    draft,
    mode,
  })
  const revisionId = crypto.randomUUID()
  const { error: revisionError } = await supabase
    .from("wiki_page_revisions")
    .insert({
      id: revisionId,
      node_id: nodeId,
      blocks: content.blocks,
      plain_text: content.plainText,
      change_note: isPageUpdate
        ? `${mode === "replace" ? "Replaced" : "Updated"} with AI from video ${asset.file_name}`
        : `Created with AI from video ${asset.file_name}`,
      created_by: userId,
    })
  if (revisionError) {
    return NextResponse.json({ error: revisionError.message }, { status: 400 })
  }

  const { error: updateError } = await supabase
    .from("wiki_nodes")
    .update(
      isPageUpdate
        ? { current_revision_id: revisionId, updated_by: userId }
        : {
            title: draft.title,
            current_revision_id: revisionId,
            updated_by: userId,
          }
    )
    .eq("id", nodeId)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  const nodes = await fetchWikiNodes(supabase)
  const completedNode = nodes.find((item) => item.id === nodeId)
  const path = completedNode ? buildWikiPath(nodes, completedNode) : ""
  revalidatePath("/wiki")
  if (path) {
    revalidatePath(`/wiki/${path}`)
  }
  return NextResponse.json({ ok: true, path: `/wiki/${path}` })
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [canAccessBeta1, canManageWiki] = await Promise.all([
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: BETA_1_PERMISSION,
    }),
    userHasPermissionCode({
      supabase,
      userId: user.id,
      code: WIKI_MANAGE_PERMISSION,
    }),
  ])
  if (!canAccessBeta1 || !canManageWiki) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 })
  }

  const fileValue = formData.get("file")
  const pastedValue = formData.get("text")
  const file = fileValue instanceof File && fileValue.size ? fileValue : null
  let pastedText = typeof pastedValue === "string" ? pastedValue : ""
  const parentIdValue = formData.get("parent_id")
  const parentId =
    typeof parentIdValue === "string" && parentIdValue.trim()
      ? parentIdValue.trim()
      : null
  const allowDuplicate = formData.get("allow_duplicate") === "1"
  const videoImport = formData.get("video_import")
  const targetPageIdValue = formData.get("target_page_id")
  const targetPageId =
    typeof targetPageIdValue === "string" && targetPageIdValue.trim()
      ? targetPageIdValue.trim()
      : null
  const modeValue = formData.get("mode")
  const mode: WikiAiUpdateMode = modeValue === "replace" ? "replace" : "update"
  const sourcePageIdValue = formData.get("source_page_id")
  const sourcePageId =
    typeof sourcePageIdValue === "string" && sourcePageIdValue.trim()
      ? sourcePageIdValue.trim()
      : null

  if (targetPageId && modeValue !== "update" && modeValue !== "replace") {
    return NextResponse.json(
      { error: "Choose an update mode." },
      { status: 400 }
    )
  }
  if (!targetPageId && modeValue) {
    return NextResponse.json(
      { error: "A target page is required for AI Update." },
      { status: 400 }
    )
  }
  if (sourcePageId && !targetPageId) {
    return NextResponse.json(
      { error: "Choose a destination page for the merge." },
      { status: 400 }
    )
  }

  let targetPage: WikiNodeRow | null = null
  let targetRevision: WikiRevisionRow | null = null
  if (targetPageId) {
    const { data, error } = await supabase
      .from("wiki_nodes")
      .select(
        "id,parent_id,type,slug,title,status,sort_order,tags,import_content_hash,current_revision_id,created_by,updated_by,created_at,updated_at"
      )
      .eq("id", targetPageId)
      .eq("type", "page")
      .maybeSingle()
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (!data) {
      return NextResponse.json(
        { error: "Wiki page not found." },
        { status: 404 }
      )
    }
    targetPage = data as WikiNodeRow
    if (targetPage.current_revision_id) {
      const { data: revision, error: revisionError } = await supabase
        .from("wiki_page_revisions")
        .select(
          "id,node_id,blocks,plain_text,change_note,created_by,created_at"
        )
        .eq("id", targetPage.current_revision_id)
        .maybeSingle()
      if (revisionError) {
        return NextResponse.json(
          { error: revisionError.message },
          { status: 400 }
        )
      }
      targetRevision = revision as WikiRevisionRow | null
    }
  }

  if (sourcePageId) {
    if (sourcePageId === targetPageId) {
      return NextResponse.json(
        { error: "Choose a different page to merge into." },
        { status: 400 }
      )
    }
    const { data: sourcePage, error: sourceError } = await supabase
      .from("wiki_nodes")
      .select("id,type,current_revision_id")
      .eq("id", sourcePageId)
      .eq("type", "page")
      .maybeSingle()
    if (sourceError) {
      return NextResponse.json({ error: sourceError.message }, { status: 400 })
    }
    if (!sourcePage?.current_revision_id) {
      return NextResponse.json(
        { error: "Source Wiki page not found." },
        { status: 404 }
      )
    }
    const { data: sourceRevision, error: sourceRevisionError } = await supabase
      .from("wiki_page_revisions")
      .select("plain_text")
      .eq("id", sourcePage.current_revision_id)
      .maybeSingle()
    if (sourceRevisionError) {
      return NextResponse.json(
        { error: sourceRevisionError.message },
        { status: 400 }
      )
    }
    pastedText = sourceRevision?.plain_text ?? ""
  }

  if (videoImport === "complete") {
    const nodeId =
      typeof formData.get("node_id") === "string"
        ? (formData.get("node_id") as string).trim()
        : ""
    if (targetPageId && nodeId !== targetPageId) {
      return NextResponse.json(
        { error: "Video update target does not match the current page." },
        { status: 400 }
      )
    }
    return completeWikiVideoImport({
      assetId:
        typeof formData.get("asset_id") === "string"
          ? (formData.get("asset_id") as string).trim()
          : "",
      nodeId,
      mode,
      isPageUpdate: Boolean(targetPageId),
      supabase,
      userId: user.id,
    })
  }

  const isVideoImportStart = videoImport === "start"
  const videoFileName =
    typeof formData.get("video_file_name") === "string"
      ? (formData.get("video_file_name") as string).trim()
      : ""
  const videoFileSize = Number(formData.get("video_file_size"))
  const videoFileType =
    typeof formData.get("video_file_type") === "string"
      ? (formData.get("video_file_type") as string)
      : ""

  if (isVideoImportStart) {
    const videoFile = new File(["x"], videoFileName, { type: videoFileType })
    if (!videoFileName || !isWikiImportVideoFile(videoFile)) {
      return NextResponse.json(
        { error: "AI Create supports MP4, MOV, and WebM video files." },
        { status: 400 }
      )
    }
    if (
      !Number.isFinite(videoFileSize) ||
      videoFileSize <= 0 ||
      videoFileSize > WIKI_MAX_UPLOAD_SIZE_BYTES
    ) {
      return NextResponse.json(
        { error: `Videos must be ${WIKI_MAX_UPLOAD_SIZE_LABEL} or smaller.` },
        { status: 400 }
      )
    }
  }

  if (file && pastedText.trim()) {
    return NextResponse.json(
      { error: "Choose a file or paste text, not both." },
      { status: 400 }
    )
  }
  if (!isVideoImportStart && !file && !pastedText.trim()) {
    return NextResponse.json(
      {
        error:
          "Drop in a file or paste the text you want to use to create a page.",
      },
      { status: 400 }
    )
  }
  if (file && file.size > WIKI_MAX_UPLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Files must be ${WIKI_MAX_UPLOAD_SIZE_LABEL} or smaller.` },
      { status: 400 }
    )
  }
  if (file && !isSupportedWikiImportFile(file)) {
    return NextResponse.json(
      {
        error: "AI Create supports PDF, DOCX, TXT, Markdown, and video files.",
      },
      { status: 400 }
    )
  }

  let extractedText = pastedText
  let docxDocument: WikiExtractedDocx | null = null
  let pdfDocument: WikiExtractedPdf | null = null
  const fileName = file?.name || "Pasted text"
  let normalizedText = ""
  if (!isVideoImportStart) {
    if (file) {
      try {
        if (isWikiDocxFile(file)) {
          docxDocument = await extractWikiDocxDocument(file)
          extractedText = docxDocument.text
        } else if (
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
        ) {
          pdfDocument = await extractWikiPdfDocument(file)
          extractedText = pdfDocument.text
        } else {
          extractedText = await extractWikiDocumentText(file)
        }
      } catch (error) {
        console.error("Wiki import document extraction failed", {
          fileName: file.name,
          fileType: file.type,
          error,
        })
        return NextResponse.json(
          {
            error:
              "We could not extract text from that file. Try a different file or paste its text instead.",
          },
          { status: 400 }
        )
      }
    }
    normalizedText = normalizeWikiImportText(extractedText)
    if (!normalizedText) {
      return NextResponse.json(
        {
          error:
            "We could not find readable text in that file. If this is a scanned PDF, paste its text instead.",
        },
        { status: 400 }
      )
    }
    if (normalizedText.length > WIKI_IMPORT_MAX_TEXT_LENGTH) {
      return NextResponse.json(
        {
          error:
            "The extracted text is too large to use for AI Create. Split it into smaller documents.",
        },
        { status: 400 }
      )
    }
  }

  if (!targetPageId && parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("wiki_nodes")
      .select("id,type")
      .eq("id", parentId)
      .maybeSingle()
    if (parentError) {
      return NextResponse.json({ error: parentError.message }, { status: 400 })
    }
    if (!parent || parent.type !== "folder") {
      return NextResponse.json(
        { error: "Choose a Wiki section or group." },
        { status: 400 }
      )
    }
  }

  if (isVideoImportStart) {
    if (targetPage) {
      const nodes = await fetchWikiNodes(supabase)
      const path = buildWikiPath(nodes, targetPage)
      return NextResponse.json({
        ok: true,
        nodeId: targetPage.id,
        path: `/wiki/${path}`,
      })
    }
    const contentHash = createWikiImportContentHash(
      `video:${sanitizeWikiFileName(videoFileName).toLocaleLowerCase()}:${videoFileSize}`
    )
    const duplicateQuery = supabase
      .from("wiki_nodes")
      .select("id,parent_id,slug,title,status")
      .eq("import_content_hash", contentHash)
      .neq("status", "archived")
    const { data: duplicates, error: duplicateError } = await (parentId
      ? duplicateQuery.eq("parent_id", parentId)
      : duplicateQuery.is("parent_id", null))
    if (duplicateError) {
      return NextResponse.json(
        { error: duplicateError.message },
        { status: 400 }
      )
    }
    if (duplicates?.[0] && !allowDuplicate) {
      const nodes = await fetchWikiNodes(supabase)
      const existing = duplicates[0] as WikiNodeRow
      return NextResponse.json(
        {
          duplicate: true,
          existing: {
            title: existing.title,
            path: `/wiki/${buildWikiPath(nodes, existing)}`,
          },
        },
        { status: 409 }
      )
    }

    const { data: siblings, error: siblingError } = await (parentId
      ? supabase.from("wiki_nodes").select("slug").eq("parent_id", parentId)
      : supabase.from("wiki_nodes").select("slug").is("parent_id", null))
    if (siblingError) {
      return NextResponse.json({ error: siblingError.message }, { status: 400 })
    }
    const nodeId = crypto.randomUUID()
    const title = titleFromWikiImportFileName(videoFileName)
    const { error: nodeError } = await supabase.from("wiki_nodes").insert({
      id: nodeId,
      parent_id: parentId,
      type: "page",
      title,
      slug: createUniqueWikiImportSlug(
        title,
        (siblings ?? []).map((sibling) => sibling.slug)
      ),
      status: "draft",
      tags: [],
      import_content_hash: contentHash,
      created_by: user.id,
      updated_by: user.id,
    })
    if (nodeError) {
      return NextResponse.json({ error: nodeError.message }, { status: 400 })
    }

    const nodes = await fetchWikiNodes(supabase)
    const node = nodes.find((item) => item.id === nodeId)
    const path = node ? buildWikiPath(nodes, node) : ""
    return NextResponse.json({ ok: true, nodeId, path: `/wiki/${path}` })
  }

  const contentHash = createWikiImportContentHash(normalizedText)
  if (!targetPage) {
    const duplicateQuery = supabase
      .from("wiki_nodes")
      .select("id,parent_id,slug,title,status")
      .eq("import_content_hash", contentHash)
      .neq("status", "archived")
    const { data: duplicates, error: duplicateError } = await (parentId
      ? duplicateQuery.eq("parent_id", parentId)
      : duplicateQuery.is("parent_id", null))
    if (duplicateError) {
      return NextResponse.json(
        { error: duplicateError.message },
        { status: 400 }
      )
    }
    if (duplicates?.[0] && !allowDuplicate) {
      const nodes = await fetchWikiNodes(supabase)
      const existing = duplicates[0] as WikiNodeRow
      return NextResponse.json(
        {
          duplicate: true,
          existing: {
            title: existing.title,
            path: `/wiki/${buildWikiPath(nodes, existing)}`,
          },
        },
        { status: 409 }
      )
    }
  }

  let aiOutput: WikiImportAiOutput | null = null
  if (!docxDocument) {
    try {
      aiOutput = await getImportAiOutput(
        normalizedText,
        fileName,
        pdfDocument ? buildWikiPdfStructureHints(pdfDocument.pages) : "",
        targetPage && mode === "update"
          ? (targetRevision?.plain_text ?? "")
          : ""
      )
    } catch (error) {
      console.debug(
        "Wiki import AI formatting failed; using extracted text",
        error
      )
    }
  }
  const nodeId = targetPage?.id ?? crypto.randomUUID()
  const revisionId = crypto.randomUUID()
  const assetId = file ? crypto.randomUUID() : null
  const storagePath =
    file && assetId
      ? `${nodeId}/${assetId}/${sanitizeWikiFileName(fileName)}`
      : null
  const importedSourceImages = docxDocument?.images ?? pdfDocument?.images ?? []
  const importedImageAssets = importedSourceImages.map((image, index) => {
    const id = crypto.randomUUID()
    const fileName = `imported-image-${index + 1}.${wikiImportImageExtension(
      image.contentType
    )}`
    return {
      ...image,
      id,
      fileName,
      storagePath: `${nodeId}/${id}/${fileName}`,
    }
  })
  const draft = docxDocument
    ? createWikiDocxImportDraft({
        html: docxDocument.html,
        text: normalizedText,
        fileName,
        imageUrls: new Map(
          importedImageAssets.map((image) => [
            image.source,
            `/api/wiki/assets/${image.id}`,
          ])
        ),
      })
    : createWikiImportDraft({
        text: normalizedText,
        fileName,
        aiOutput,
        pdfPages: pdfDocument?.pages,
        imageUrls: importedImageAssets.map(
          (image) => `/api/wiki/assets/${image.id}`
        ),
      })
  const aiMergedCurrentPage = Boolean(
    targetPage &&
    mode === "update" &&
    targetRevision &&
    draft.usedAi &&
    isFaithfulWikiImportOutput(
      targetRevision.plain_text,
      draft.markdown,
      draft.title
    )
  )
  const revisionDraft = aiMergedCurrentPage
    ? { ...draft, plainText: blockNoteToPlainText(draft.blocks) }
    : draft
  if (fileName === "wiki-import-cid-text.pdf" && aiOutput && !draft.usedAi) {
    console.warn(
      "Wiki import AI output failed fidelity or layout validation; using rule-based formatting",
      {
        fileName,
        rawMarkdown: aiOutput.markdown,
        fallbackMarkdown: draft.markdown,
      }
    )
  }

  try {
    const adminSupabase = createSupabaseAdminClient()
    if (file && storagePath) {
      const upload = await adminSupabase.storage
        .from(WIKI_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        })
      if (upload.error) {
        throw new Error(upload.error.message)
      }
    }
    for (const image of importedImageAssets) {
      const upload = await adminSupabase.storage
        .from(WIKI_BUCKET)
        .upload(image.storagePath, image.data, {
          contentType: image.contentType,
          upsert: false,
        })
      if (upload.error) {
        throw new Error(upload.error.message)
      }
    }

    if (!targetPage) {
      const { data: siblings, error: siblingError } = await (parentId
        ? supabase.from("wiki_nodes").select("slug").eq("parent_id", parentId)
        : supabase.from("wiki_nodes").select("slug").is("parent_id", null))
      if (siblingError) {
        throw new Error(siblingError.message)
      }
      const slug = createUniqueWikiImportSlug(
        draft.title,
        (siblings ?? []).map((sibling) => sibling.slug)
      )
      const { error: nodeError } = await supabase.from("wiki_nodes").insert({
        id: nodeId,
        parent_id: parentId,
        type: "page",
        title: draft.title,
        slug,
        status: "draft",
        tags: draft.tags,
        import_content_hash: contentHash,
        created_by: user.id,
        updated_by: user.id,
      })
      if (nodeError) {
        throw new Error(nodeError.message)
      }
    }

    const importedBlocks =
      file && assetId
        ? [
            ...draft.blocks,
            {
              id: `imported-file-${assetId}`,
              type: "file",
              props: { url: `/api/wiki/assets/${assetId}`, name: fileName },
              children: [],
            },
          ]
        : draft.blocks
    const content = mergeWikiPageContent({
      existingRevision: targetRevision,
      draft: { ...revisionDraft, blocks: importedBlocks },
      mode: aiMergedCurrentPage ? "replace" : mode,
    })
    const { error: revisionError } = await supabase
      .from("wiki_page_revisions")
      .insert({
        id: revisionId,
        node_id: nodeId,
        blocks: content.blocks,
        plain_text: content.plainText,
        change_note: targetPage
          ? `${mode === "replace" ? "Replaced" : "Updated"} with AI from ${file ? fileName : "pasted text"}`
          : file
            ? `Created with AI from ${fileName}`
            : "Created with AI from pasted text",
        created_by: user.id,
      })
    if (revisionError) {
      throw new Error(revisionError.message)
    }
    const { error: currentRevisionError } = await supabase
      .from("wiki_nodes")
      .update({ current_revision_id: revisionId, updated_by: user.id })
      .eq("id", nodeId)
    if (currentRevisionError) {
      throw new Error(currentRevisionError.message)
    }
    if (file && assetId && storagePath) {
      const kind = getWikiAssetKind(file)
      const { error: assetError } = await supabase.from("wiki_assets").insert({
        id: assetId,
        node_id: nodeId,
        storage_bucket: WIKI_BUCKET,
        storage_path: storagePath,
        file_name: sanitizeWikiFileName(fileName),
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        kind: kind ?? "document",
        extracted_text: normalizedText,
        created_by: user.id,
        updated_by: user.id,
      })
      if (assetError) {
        throw new Error(assetError.message)
      }
    }
    for (const image of importedImageAssets) {
      const { error: assetError } = await supabase.from("wiki_assets").insert({
        id: image.id,
        node_id: nodeId,
        storage_bucket: WIKI_BUCKET,
        storage_path: image.storagePath,
        file_name: image.fileName,
        mime_type: image.contentType,
        size_bytes: image.data.byteLength,
        kind: "image",
        extracted_text: null,
        created_by: user.id,
        updated_by: user.id,
      })
      if (assetError) {
        throw new Error(assetError.message)
      }
    }
    if (!targetPage) {
      await syncWikiPageTags({ supabase, nodeId, tags: draft.tags })
    }

    if (sourcePageId) {
      const { error: archiveError } = await supabase
        .from("wiki_nodes")
        .update({ status: "archived", updated_by: user.id })
        .eq("id", sourcePageId)
      if (archiveError) throw new Error(archiveError.message)
      await archiveKnowledgeSource({
        supabase: createSupabaseAdminClient(),
        sourceType: "wiki_page",
        sourceId: sourcePageId,
      })
    }

    const nodes = await fetchWikiNodes(supabase)
    const node = nodes.find((item) => item.id === nodeId)
    const path = node ? buildWikiPath(nodes, node) : ""
    revalidatePath("/wiki")
    if (path) {
      revalidatePath(`/wiki/${path}`)
    }
    return NextResponse.json({
      ok: true,
      path: `/wiki/${path}`,
      usedAi: draft.usedAi,
    })
  } catch (error) {
    await cleanUpImport({
      nodeId: targetPage ? undefined : nodeId,
      storagePaths: [
        ...(storagePath ? [storagePath] : []),
        ...importedImageAssets.map((image) => image.storagePath),
      ],
    }).catch((cleanupError) =>
      console.error("Wiki import cleanup failed", cleanupError)
    )
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to create draft.",
      },
      { status: 400 }
    )
  }
}
