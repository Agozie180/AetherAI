import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(): void {
  // Local .env files are the SOURCE OF TRUTH for this tool: the operator
  // configures keys by editing .env. A pre-existing shell / Machine-scope
  // variable must therefore NOT silently shadow that edit. (It did once: a
  // stale Machine-scope BITGET_API_KEY overrode a freshly-edited .env, so every
  // signed request failed Bitget code 40037 "Apikey does not exist" while the
  // .env looked correct. Hours-eating, invisible.) So .env values WIN over the
  // environment. Precedence, highest first: .env.local, then .env, then any
  // pre-existing var for keys present in neither file. On platforms with no
  // .env file (e.g. Vercel), this loop is a no-op and the dashboard-provided
  // environment is used unchanged.
  for (const name of [".env", ".env.local"]) {
    // .env first, .env.local second: the later assignment wins, so a value in
    // .env.local overrides the same key in .env.
    try {
      const text = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i < 1) continue;
        const k = line.slice(0, i).trim();
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        // Skip blank values so a placeholder-empty line (e.g. OPENAI_API_KEY=)
        // never wipes a real value supplied by the shell.
        if (v !== "") process.env[k] = v;
      }
    } catch {
      /* optional */
    }
  }
}
