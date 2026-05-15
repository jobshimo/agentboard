/**
 * Read/write the `language` field from/to ~/.agentboard/config.yaml.
 * The rest of the config is preserved (merge, not overwrite).
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

type Lang = "en" | "es";

const SUPPORTED: ReadonlySet<string> = new Set(["en", "es"]);

/** Read the persisted language preference. Returns "en" if unset or unknown. */
export function readLanguage(configDir: string): Lang {
  const configPath = join(configDir, "config.yaml");

  if (!existsSync(configPath)) {
    return "en";
  }

  const raw = yaml.load(readFileSync(configPath, "utf8")) as Record<string, unknown> | null;

  if (!raw || typeof raw !== "object") return "en";

  const lang = raw["language"];
  if (typeof lang === "string" && SUPPORTED.has(lang)) {
    return lang as Lang;
  }

  return "en";
}

/** Persist the language preference to config.yaml, keeping all other keys intact. */
export function writeLanguage(configDir: string, lang: Lang): void {
  const configPath = join(configDir, "config.yaml");

  // Ensure the directory exists.
  mkdirSync(configDir, { recursive: true });

  let existing: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const raw = yaml.load(readFileSync(configPath, "utf8"));
    if (raw && typeof raw === "object") {
      existing = raw as Record<string, unknown>;
    }
  }

  existing["language"] = lang;

  writeFileSync(configPath, yaml.dump(existing), "utf8");
}
