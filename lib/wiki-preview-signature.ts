import { createHmac, timingSafeEqual } from "node:crypto"

export interface WikiPreviewClaim {
  userId: string
  targetPageId: string
  baseRevisionId: string | null
  mode: "update" | "replace"
  sourcePageId: string | null
  blocks: unknown[]
}

function signingKey() {
  return (
    process.env.WIKI_PREVIEW_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  )
}

export function signWikiPreview(claim: WikiPreviewClaim) {
  const key = signingKey()
  if (!key) {
    throw new Error("Preview signing is not configured.")
  }
  const signedPreview = JSON.stringify(claim)
  const previewSignature = createHmac("sha256", key)
    .update(signedPreview)
    .digest("base64url")
  return { signedPreview, previewSignature }
}

export function readSignedWikiPreview(
  signedPreview: string,
  previewSignature: string
): WikiPreviewClaim {
  const key = signingKey()
  if (!key) {
    throw new Error("Preview signing is not configured.")
  }
  const expected = createHmac("sha256", key)
    .update(signedPreview)
    .digest("base64url")
  const actualBuffer = Buffer.from(previewSignature)
  const expectedBuffer = Buffer.from(expected)
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("This review does not match. Look again before saving.")
  }
  let parsed: Partial<WikiPreviewClaim>
  try {
    parsed = JSON.parse(signedPreview) as Partial<WikiPreviewClaim>
  } catch {
    throw new Error("This review does not match. Look again before saving.")
  }
  if (
    !parsed ||
    typeof parsed.userId !== "string" ||
    typeof parsed.targetPageId !== "string" ||
    (parsed.baseRevisionId !== null &&
      typeof parsed.baseRevisionId !== "string") ||
    (parsed.mode !== "update" && parsed.mode !== "replace") ||
    (parsed.sourcePageId !== null && typeof parsed.sourcePageId !== "string") ||
    !Array.isArray(parsed.blocks)
  ) {
    throw new Error("This review does not match. Look again before saving.")
  }
  return {
    userId: parsed.userId,
    targetPageId: parsed.targetPageId,
    baseRevisionId: parsed.baseRevisionId ?? null,
    mode: parsed.mode,
    sourcePageId: parsed.sourcePageId ?? null,
    blocks: parsed.blocks,
  }
}
