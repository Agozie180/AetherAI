import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadDotEnv(): void {
  for (const name of [".env.local", ".env"]) {
    try {
      const text = readFileSync(resolve(process.cwd(), name), "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const i = line.indexOf("=");
        if (i < 1) continue;
        const k = line.slice(0, i).trim();
        let v = line.slice(i + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      /* optional */
    }
  }
}
