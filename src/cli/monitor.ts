import { loadDotEnv } from "../lib/env";
loadDotEnv();

import { flattenAll, tickMonitor } from "../lib/monitor/tick";
import { loadKill, resetKill } from "../lib/memory/store";

async function main() {
  const arg = process.argv[2];
  if (arg === "reset") {
    console.log(JSON.stringify(resetKill(), null, 2));
    return;
  }
  if (arg === "flatten") {
    const out = await flattenAll("CLI flatten");
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  const out = await tickMonitor();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
