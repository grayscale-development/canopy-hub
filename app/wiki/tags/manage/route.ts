import type { NextRequest } from "next/server"

export function GET(request: NextRequest) {
  return new Response(null, {
    status: 307,
    headers: { Location: `/wiki/tags${request.nextUrl.search}` },
  })
}
