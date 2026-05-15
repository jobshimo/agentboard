import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installInstructionsBlock,
  uninstallInstructionsBlock,
  detectInstructionsBlock,
  BLOCK_VERSION,
  BLOCK_BEGIN_MARKER,
  BLOCK_END_MARKER,
} from "../instructions.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "agentboard-instructions-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("detectInstructionsBlock", () => {
  it("returns 'missing' when file does not exist", () => {
    const result = detectInstructionsBlock(join(tmpDir, "CLAUDE.md"));
    expect(result).toBe("missing");
  });

  it("returns 'missing' when file exists but has no block", () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# My instructions\n\nSome content.\n");
    const result = detectInstructionsBlock(file);
    expect(result).toBe("missing");
  });

  it("returns 'current' when file has current-version block", () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(
      file,
      `# My instructions\n\n<!-- agentboard:instructions:begin v${BLOCK_VERSION} -->\n<!-- managed-by: agentboard v${BLOCK_VERSION}; do not edit between markers; run \`agentboard install\` to refresh. -->\ncontent\n<!-- agentboard:instructions:end -->\n`,
    );
    const result = detectInstructionsBlock(file);
    expect(result).toBe("current");
  });

  it("returns 'outdated' when file has block with older version", () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(
      file,
      `# My instructions\n\n<!-- agentboard:instructions:begin v0.0.1 -->\n<!-- managed-by: agentboard v0.0.1; do not edit between markers; run \`agentboard install\` to refresh. -->\ncontent\n<!-- agentboard:instructions:end -->\n`,
    );
    const result = detectInstructionsBlock(file);
    expect(result).toBe("outdated");
  });
});

describe("installInstructionsBlock", () => {
  it("creates the file with just the block when file does not exist", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    await installInstructionsBlock(file);

    expect(existsSync(file)).toBe(true);
    const content = readFileSync(file, "utf8");
    expect(content).toContain(BLOCK_BEGIN_MARKER);
    expect(content).toContain(BLOCK_END_MARKER);
    expect(content).toContain("agentboard");
  });

  it("creates parent directories if needed", async () => {
    const file = join(tmpDir, "deep", "nested", "CLAUDE.md");
    await installInstructionsBlock(file);
    expect(existsSync(file)).toBe(true);
  });

  it("appends block to existing file that has no block", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# Existing content\n\nSome rules.\n");
    await installInstructionsBlock(file);

    const content = readFileSync(file, "utf8");
    expect(content).toContain("# Existing content");
    expect(content).toContain(BLOCK_BEGIN_MARKER);
  });

  it("is a no-op when current-version block is already present", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    const existingContent = `# Rules\n\n${BLOCK_BEGIN_MARKER}\n<!-- managed-by: agentboard v${BLOCK_VERSION}; do not edit between markers; run \`agentboard install\` to refresh. -->\ncontent\n${BLOCK_END_MARKER}\n`;
    writeFileSync(file, existingContent);

    const beforeMtime = (await import("node:fs")).statSync(file).mtimeMs;
    await installInstructionsBlock(file);
    // File should not be modified (no-op)
    const afterContent = readFileSync(file, "utf8");
    expect(afterContent).toBe(existingContent);
  });

  it("replaces an outdated block in place", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    const oldBlock = `<!-- agentboard:instructions:begin v0.0.1 -->\n<!-- managed-by: agentboard v0.0.1; do not edit between markers; run \`agentboard install\` to refresh. -->\nold content\n<!-- agentboard:instructions:end -->`;
    writeFileSync(file, `# Preamble\n\n${oldBlock}\n\n# Postamble\n`);

    await installInstructionsBlock(file);

    const content = readFileSync(file, "utf8");
    expect(content).toContain("# Preamble");
    expect(content).toContain("# Postamble");
    expect(content).toContain(BLOCK_BEGIN_MARKER);
    expect(content).not.toContain("v0.0.1");
    expect(content).not.toContain("old content");
  });

  it("creates a backup before modifying an existing file", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# Existing\n");
    const result = await installInstructionsBlock(file);
    expect(result.backupPath).not.toBeNull();
    expect(existsSync(result.backupPath!)).toBe(true);
  });

  it("does NOT create a backup when creating a new file", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    const result = await installInstructionsBlock(file);
    expect(result.backupPath).toBeNull();
  });

  it("uses atomic write (no tmp files left behind)", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    await installInstructionsBlock(file);
    const files = (await import("node:fs")).readdirSync(tmpDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp."));
    expect(tmpFiles).toHaveLength(0);
  });
});

describe("uninstallInstructionsBlock", () => {
  it("removes the block, leaving the rest of the file intact", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(
      file,
      `# Preamble\n\n${BLOCK_BEGIN_MARKER}\n<!-- managed-by: agentboard v${BLOCK_VERSION}; do not edit between markers; run \`agentboard install\` to refresh. -->\ncontent\n${BLOCK_END_MARKER}\n\n# Postamble\n`,
    );

    await uninstallInstructionsBlock(file);

    const content = readFileSync(file, "utf8");
    expect(content).toContain("# Preamble");
    expect(content).toContain("# Postamble");
    expect(content).not.toContain(BLOCK_BEGIN_MARKER);
    expect(content).not.toContain(BLOCK_END_MARKER);
  });

  it("is a no-op when no block is present", async () => {
    const file = join(tmpDir, "CLAUDE.md");
    writeFileSync(file, "# Just content\n");
    const result = await uninstallInstructionsBlock(file);
    expect(result.ok).toBe(true);
    expect(readFileSync(file, "utf8")).toBe("# Just content\n");
  });

  it("is safe when file does not exist", async () => {
    const result = await uninstallInstructionsBlock(join(tmpDir, "missing.md"));
    expect(result.ok).toBe(true);
  });
});
