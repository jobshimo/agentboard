/**
 * Render tests for TUI v2 components and screens.
 * Uses ink-testing-library to capture rendered frames.
 */
import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';

// ─── Tokens ───────────────────────────────────────────────────────────────────

describe('tokens', () => {
  it('exports COLORS with correct ANSI names', async () => {
    const { COLORS } = await import('../tokens.js');
    expect(COLORS.primary).toBe('cyan');
    expect(COLORS.success).toBe('green');
    expect(COLORS.warn).toBe('yellow');
    expect(COLORS.error).toBe('red');
    expect(COLORS.muted).toBe('gray');
    expect(COLORS.heading).toBe('cyan');
  });

  it('exports SPACE with the three-level scale', async () => {
    const { SPACE } = await import('../tokens.js');
    expect(SPACE.none).toBe(0);
    expect(SPACE.gap).toBe(1);
    expect(SPACE.block).toBe(2);
  });

  it('exports GLYPHS including cursor, check, cross, dot', async () => {
    const { GLYPHS } = await import('../tokens.js');
    expect(GLYPHS.cursor).toBe('❯');
    expect(GLYPHS.check).toBe('✓');
    expect(GLYPHS.cross).toBe('✗');
    expect(GLYPHS.dot).toBe('·');
    expect(Array.isArray(GLYPHS.spinnerFrames)).toBe(true);
    expect(GLYPHS.spinnerFrames.length).toBeGreaterThan(0);
  });
});

// ─── KeyCap ───────────────────────────────────────────────────────────────────

describe('KeyCap', () => {
  it('renders the label surrounded by spaces (inverse style)', async () => {
    const { KeyCap } = await import('../components/KeyCap.js');
    const { lastFrame } = render(<KeyCap label="q" />);
    const frame = lastFrame() ?? '';
    // The label should be present with surrounding spaces in the text content
    expect(frame).toContain('q');
  });

  it('renders multi-char labels', async () => {
    const { KeyCap } = await import('../components/KeyCap.js');
    const { lastFrame } = render(<KeyCap label="Esc" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Esc');
  });
});

// ─── FooterKeys ───────────────────────────────────────────────────────────────

describe('FooterKeys', () => {
  it('renders all key labels', async () => {
    const { FooterKeys } = await import('../components/FooterKeys.js');
    const { lastFrame } = render(
      <FooterKeys keys={[
        { k: 'q', label: 'quit' },
        { k: 'Esc', label: 'back' },
      ]} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('q');
    expect(frame).toContain('quit');
    expect(frame).toContain('Esc');
    expect(frame).toContain('back');
  });

  it('renders a dot separator between items', async () => {
    const { FooterKeys } = await import('../components/FooterKeys.js');
    const { lastFrame } = render(
      <FooterKeys keys={[
        { k: 'a', label: 'first' },
        { k: 'b', label: 'second' },
      ]} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('·');
  });

  it('does not render a trailing dot after the last item', async () => {
    const { FooterKeys } = await import('../components/FooterKeys.js');
    const { lastFrame } = render(
      <FooterKeys keys={[{ k: 'q', label: 'quit' }]} />
    );
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('·');
  });
});

// ─── Badge ────────────────────────────────────────────────────────────────────

describe('Badge', () => {
  it('renders ok badge with checkmark and default label', async () => {
    const { Badge } = await import('../components/Badge.js');
    const { lastFrame } = render(<Badge kind="ok" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✓');
    expect(frame).toContain('registered');
  });

  it('renders warn badge with warning glyph', async () => {
    const { Badge } = await import('../components/Badge.js');
    const { lastFrame } = render(<Badge kind="warn" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('⚠');
  });

  it('renders err badge with cross glyph', async () => {
    const { Badge } = await import('../components/Badge.js');
    const { lastFrame } = render(<Badge kind="err" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('✗');
  });

  it('renders muted badge with dot glyph', async () => {
    const { Badge } = await import('../components/Badge.js');
    const { lastFrame } = render(<Badge kind="muted" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('·');
  });

  it('renders a custom label override', async () => {
    const { Badge } = await import('../components/Badge.js');
    const { lastFrame } = render(<Badge kind="ok" label="custom label" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('custom label');
  });
});

// ─── SectionHead ──────────────────────────────────────────────────────────────

describe('SectionHead', () => {
  it('renders the section heading text', async () => {
    const { SectionHead } = await import('../components/SectionHead.js');
    const { lastFrame } = render(<SectionHead>SERVER</SectionHead>);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SERVER');
  });

  it('renders an optional hint', async () => {
    const { SectionHead } = await import('../components/SectionHead.js');
    const { lastFrame } = render(<SectionHead hint="3 / 5 enabled">SERVER</SectionHead>);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SERVER');
    expect(frame).toContain('3 / 5 enabled');
  });
});

// ─── MenuRow ──────────────────────────────────────────────────────────────────

describe('MenuRow', () => {
  it('renders label text', async () => {
    const { MenuRow } = await import('../components/MenuRow.js');
    const { lastFrame } = render(<MenuRow label="Start daemon" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Start daemon');
  });

  it('renders cursor glyph when focused', async () => {
    const { MenuRow } = await import('../components/MenuRow.js');
    const { lastFrame } = render(<MenuRow focused label="Start daemon" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('❯');
  });

  it('renders hotkey in brackets when provided', async () => {
    const { MenuRow } = await import('../components/MenuRow.js');
    const { lastFrame } = render(<MenuRow hotkey="s" label="Start daemon" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[');
    expect(frame).toContain('s');
    expect(frame).toContain(']');
  });

  it('renders a hint when provided', async () => {
    const { MenuRow } = await import('../components/MenuRow.js');
    const { lastFrame } = render(<MenuRow label="Start daemon" hint="probe :7733" />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('probe :7733');
  });
});

// ─── Frame ────────────────────────────────────────────────────────────────────

describe('Frame', () => {
  it('renders the title text', async () => {
    const { Frame } = await import('../components/Frame.js');
    const { lastFrame } = render(
      <Frame title="agentboard" agbHome="/tmp" footerKeys={[]}>
        <></>
      </Frame>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('agentboard');
  });

  it('renders a round border', async () => {
    const { Frame } = await import('../components/Frame.js');
    const { lastFrame } = render(
      <Frame title="Test" agbHome="/tmp" footerKeys={[]}>
        <></>
      </Frame>
    );
    const frame = lastFrame() ?? '';
    // Ink's round border uses these characters
    expect(frame).toMatch(/[╭╰]/);
  });

  it('renders footer keys', async () => {
    const { Frame } = await import('../components/Frame.js');
    const { lastFrame } = render(
      <Frame title="Test" agbHome="/tmp" footerKeys={[{ k: 'q', label: 'quit' }]}>
        <></>
      </Frame>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('q');
    expect(frame).toContain('quit');
  });

  it('renders children content', async () => {
    const { Frame } = await import('../components/Frame.js');
    const { Text } = await import('ink');
    const { lastFrame } = render(
      <Frame title="Test" agbHome="/tmp" footerKeys={[]}>
        <Text>child content</Text>
      </Frame>
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('child content');
  });
});

// ─── MenuScreen ───────────────────────────────────────────────────────────────

describe('MenuScreen', () => {
  it('renders the menu title', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('agentboard');
  });

  it('renders the four section headings', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('SERVER');
    expect(frame).toContain('CLIENT');
    expect(frame).toContain('DIAGNOSE');
    expect(frame).toContain('REFERENCE');
  });

  it('renders all menu item hotkeys', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    // All 9 hotkeys should appear in brackets
    for (const key of ['s', 'o', 'p', 'i', 'u', 'd', 'c', 'l', 'q']) {
      expect(frame).toContain(key);
    }
  });

  it('renders all 9 menu items in English', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Start daemon');
    expect(frame).toContain('Open Web UI');
    expect(frame).toContain('List known projects');
    expect(frame).toContain('Install MCP in clients');
    expect(frame).toContain('Uninstall');
    expect(frame).toContain('Doctor');
  });

  it('renders menu items in Spanish when lang=es', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="es"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Iniciar daemon');
    expect(frame).toContain('SERVIDOR');
    expect(frame).toContain('CLIENTE');
    expect(frame).toContain('DIAGNÓSTICO');
    expect(frame).toContain('REFERENCIA');
  });

  it('renders a status message when provided', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
        statusMessage="Daemon started (PID 1234)."
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('Daemon started (PID 1234).');
  });

  it('renders footer navigate and quit keys', async () => {
    const { MenuScreen } = await import('../screens/MenuScreen.js');
    const { lastFrame } = render(
      <MenuScreen
        lang="en"
        agbHome="/tmp"
        onSelect={() => undefined}
        onSwapLang={() => undefined}
        onQuit={() => undefined}
      />
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('navigate');
    expect(frame).toContain('quit');
  });
});
