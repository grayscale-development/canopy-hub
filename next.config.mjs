import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
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
