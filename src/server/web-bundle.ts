import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Resolves dist/web/ relative to the compiled artifact's location.
//   dev:    src/server/web-bundle.ts → repo/dist/web (only exists after pnpm build:web)
//   build:  dist/server/web-bundle.js → repo/dist/web
//   npm:    node_modules/@jobshimo/agentboard/dist/server/web-bundle.js → package/dist/web
export function getWebBundlePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "dist", "web");
}

export function hasWebBundle(): boolean {
  return existsSync(join(getWebBundlePath(), "index.html"));
}
