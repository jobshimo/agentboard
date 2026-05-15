import { describe, expect, it } from "vitest";
import { t, en, es } from "../strings.js";

describe("i18n strings", () => {
  it("t() returns English string when lang=en", () => {
    expect(t("menu.start_daemon", "en")).toBe(en["menu.start_daemon"]);
  });

  it("t() returns Spanish string when lang=es", () => {
    expect(t("menu.start_daemon", "es")).toBe(es["menu.start_daemon"]);
  });

  it("t() returns the key itself when the key does not exist", () => {
    expect(t("nonexistent.key", "en")).toBe("nonexistent.key");
    expect(t("nonexistent.key", "es")).toBe("nonexistent.key");
  });

  it("every key in `en` has a matching key in `es`", () => {
    const enKeys = Object.keys(en);
    const esKeys = new Set(Object.keys(es));
    const missing = enKeys.filter((k) => !esKeys.has(k));
    expect(missing).toEqual([]);
  });

  it("t() returns different strings for en vs es", () => {
    // At least one key must have a different translation
    const atLeastOneDifferent = Object.keys(en).some(
      (k) => en[k as keyof typeof en] !== es[k as keyof typeof es],
    );
    expect(atLeastOneDifferent).toBe(true);
  });
});
