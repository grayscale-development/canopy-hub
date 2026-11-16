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
    // Wiki saves submit the complete BlockNote document, so a short edit to a
    // large page can still exceed the framework's default 1MB action limit.
    // Keep this aligned with the proxy and app-level upload allowances above.
    serverActions: {
      bodySizeLimit: "260mb",
    },
  },
  // pdf-parse resolves its Node worker at runtime. Bundling it makes Turbopack
  // resolve the browser entry instead, which cannot load that worker on the
  // server. jsdom 30 (and html-encoding-sniffer -> @exodus/bytes) is ESM;
  // bundling it makes Turbopack emit a CJS require() that throws
  // ERR_REQUIRE_ESM on the Node 24 server runtime.
  serverExternalPackages: ["pdf-parse", "jsdom"],
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
