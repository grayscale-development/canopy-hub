const STAGING_SUPABASE_HOST = "lnzxjlsojwwnkqxzhizj.supabase.co"

export function isStagingPasswordLoginEnabled() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  return (
    process.env.NEXT_PUBLIC_ALLOW_STAGING_PASSWORD_LOGIN === "true" &&
    supabaseUrl.includes(STAGING_SUPABASE_HOST)
  )
}
