import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

function readPackageJson(): { version: string; name: string } {
  // Resolved at runtime — works from both src/ (tests) and dist/ (published)
  const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "../../package.json");
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string; name: string };
  } catch {
    return { version: "0.0.0", name: "@jobshimo/agentboard" };
  }
}

export function getVersion(): string {
  return readPackageJson().version;
}
