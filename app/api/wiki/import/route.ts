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
  fetchWikiNodes,
  getWikiAssetKind,
  sanitizeWikiFileName,
  syncWikiPageTags,
  WIKI_BUCKET,
  WIKI_MANAGE_PERMISSION,
  WIKI_MAX_UPLOAD_SIZE_BYTES,
  WIKI_MAX_UPLOAD_SIZE_LABEL,
  type WikiNodeRow,
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
  isSupportedWikiImportFile,
  normalizeWikiImportText,
  WIKI_IMPORT_MAX_TEXT_LENGTH,
  type WikiImportAiOutput,
} from "@/lib/wiki-import"

export const runtime = "nodejs"
export const maxDuration = 60

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
  structureHints = ""
) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await createAgentResponseWithOpenAI(
      {
        model: getWikiImportModel(),
        input: buildWikiImportPrompt({ text, fileName, structureHints }),
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
    return NextResponse.json(
      { error: "Invalid import request." },
      { status: 400 }
    )
  }

  const fileValue = formData.get("file")
  const pastedValue = formData.get("text")
  const file = fileValue instanceof File && fileValue.size ? fileValue : null
  const pastedText = typeof pastedValue === "string" ? pastedValue : ""
  const parentIdValue = formData.get("parent_id")
  const parentId =
    typeof parentIdValue === "string" && parentIdValue.trim()
      ? parentIdValue.trim()
      : null
  const allowDuplicate = formData.get("allow_duplicate") === "1"

  if (file && pastedText.trim()) {
    return NextResponse.json(
      { error: "Choose a file or paste text, not both." },
      { status: 400 }
    )
  }
  if (!file && !pastedText.trim()) {
    return NextResponse.json(
      { error: "Drop in a file or paste the text you want to import." },
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
      { error: "Import supports PDF, DOCX, TXT, and Markdown files." },
      { status: 400 }
    )
  }

  let extractedText = pastedText
  let docxDocument: WikiExtractedDocx | null = null
  let pdfDocument: WikiExtractedPdf | null = null
  const fileName = file?.name || "Pasted text"
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
  const normalizedText = normalizeWikiImportText(extractedText)
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
          "The extracted text is too large to import. Split it into smaller documents.",
      },
      { status: 400 }
    )
  }

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("wiki_nodes")
      .select("id,type,status")
      .eq("id", parentId)
      .maybeSingle()
    if (parentError) {
      return NextResponse.json({ error: parentError.message }, { status: 400 })
    }
    if (!parent || parent.type !== "folder" || parent.status === "archived") {
      return NextResponse.json(
        { error: "Choose an active Wiki section or group." },
        { status: 400 }
      )
    }
  }

  const contentHash = createWikiImportContentHash(normalizedText)
  const duplicateQuery = supabase
    .from("wiki_nodes")
    .select("id,parent_id,slug,title,status")
    .eq("import_content_hash", contentHash)
    .neq("status", "archived")
  const { data: duplicates, error: duplicateError } = await (parentId
    ? duplicateQuery.eq("parent_id", parentId)
    : duplicateQuery.is("parent_id", null))
  if (duplicateError) {
    return NextResponse.json({ error: duplicateError.message }, { status: 400 })
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

  let aiOutput: WikiImportAiOutput | null = null
  if (!docxDocument) {
    try {
      aiOutput = await getImportAiOutput(
        normalizedText,
        fileName,
        pdfDocument ? buildWikiPdfStructureHints(pdfDocument.pages) : ""
      )
    } catch (error) {
      console.debug(
        "Wiki import AI formatting failed; using extracted text",
        error
      )
    }
  }
  const nodeId = crypto.randomUUID()
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

    const blocks =
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
    const { error: revisionError } = await supabase
      .from("wiki_page_revisions")
      .insert({
        id: revisionId,
        node_id: nodeId,
        blocks,
        plain_text: draft.plainText,
        change_note: file
          ? `Imported from ${fileName}`
          : "Imported pasted text",
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
    await syncWikiPageTags({ supabase, nodeId, tags: draft.tags })

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
      nodeId,
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
          error instanceof Error
            ? error.message
            : "Unable to create the imported draft.",
      },
      { status: 400 }
    )
  }
}
