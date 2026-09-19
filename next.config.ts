import type { NextConfig } from "next";
import { realpathSync } from "node:fs";

// Normalize the project root to its real on-disk casing. On Windows the working
// directory can be entered with different casing than NTFS stores it (e.g.
// "Aetherai" vs the real "AetherAI"). When cwd casing and module-resolution
// casing disagree, webpack builds Next's internals twice under both spellings
// and its `node:`-scheme handler stops applying — which surfaces as the fatal
// `UnhandledSchemeError: node:crypto`. Pinning the canonical casing here keeps
// file tracing (and the module graph) on one spelling regardless of how the dev
// server was launched.
let projectRoot = process.cwd();
try {
  projectRoot = realpathSync.native(projectRoot);
} catch {
  /* keep cwd if realpath is unavailable */
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["openai"],
  webpack: (config: any, context: any) => {
    // The instrumentation hook starts the in-process position monitor, whose
    // import chain uses node-only builtins (node:sqlite, node:crypto, node:fs,
    // node:path). Next compiles `instrumentation.ts` for BOTH the Node and Edge
    // runtimes; the Edge bundler cannot read the `node:` scheme and fails the
    // whole build. The monitor never actually runs on Edge — register() is
    // guarded to `NEXT_RUNTIME === "nodejs"` — so for the Edge compilation we
    // neutralize every `node:` import: mark it external (generic, catches all)
    // and alias the known builtins to an empty module (belt and braces). It is
    // compiled away to an unreachable require; the Node runtime is untouched.
    if (context?.nextRuntime === "edge") {
      const externalizeNodeScheme = (
        { request }: { request?: string },
        cb: (err?: unknown, result?: string) => void,
      ) => (request && request.startsWith("node:") ? cb(undefined, `commonjs ${request}`) : cb());
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, externalizeNodeScheme]
        : [config.externals, externalizeNodeScheme].filter(Boolean);
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "node:crypto": false,
        "node:sqlite": false,
        "node:fs": false,
        "node:path": false,
        "node:os": false,
      };
    }
    return config;
  },
};

export default nextConfig;
