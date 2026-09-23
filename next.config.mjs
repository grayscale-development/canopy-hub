import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright uses the loopback IP while `next dev` starts on localhost.
  // Explicitly permit that same-machine origin so development auth cookies
  // can complete their round trip in the smoke suite.
  allowedDevOrigins: ["127.0.0.1"],
  experimental: {
    // Keep this slightly above the app-level 250MB upload limit so multipart
    // overhead does not trigger a framework-level 413 first.
    proxyClientMaxBodySize: "260mb",
  },
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
