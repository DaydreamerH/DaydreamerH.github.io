import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const astroBin = join(root, "node_modules", "astro", "astro.js");
const args = process.argv.slice(2);

const result = spawnSync(process.execPath, [astroBin, ...args], {
  cwd: root,
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1"
  },
  stdio: "inherit"
});

process.exit(result.status ?? 1);
