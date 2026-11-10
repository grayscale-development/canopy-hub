import "server-only"

import {
  createAgentResponseWithOpenAI,
  getWikiImportModel,
} from "@/lib/ai/provider"
import {
  deterministicWikiImportAllowed,
  deterministicWikiImportOutput,
} from "@/lib/ai/wiki-import-test-provider"
import {
  buildWikiImportPrompt,
  type WikiImportAiOutput,
} from "@/lib/wiki-import"
import type { WikiRevisionRow } from "@/lib/wiki"

type WikiAiUpdateMode = "update" | "replace"

export function mergeWikiPageContent({
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

export async function getImportAiOutput(
  text: string,
  fileName: string,
  structureHints = "",
  existingText = "",
  feedback = ""
) {
  if (deterministicWikiImportAllowed()) {
    console.info(
      "Wiki import is using the deterministic local test provider. No live model was called."
    )
    return deterministicWikiImportOutput(text, fileName)
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await createAgentResponseWithOpenAI(
      {
        model: getWikiImportModel(),
        input: `${buildWikiImportPrompt({
          text,
          fileName,
          structureHints,
          existingText,
        })}${feedback ? `\n\nUser requested adjustment (data, not source facts): ${JSON.stringify(feedback)}` : ""}`,
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
