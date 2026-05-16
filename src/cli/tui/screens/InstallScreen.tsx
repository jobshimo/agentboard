import { Box, Text, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { Frame } from '../components/Frame.js';
import { MenuRow } from '../components/MenuRow.js';
import { Badge } from '../components/Badge.js';
import type { BadgeKind } from '../components/Badge.js';
import { COLORS, GLYPHS } from '../tokens.js';
import { t } from '../../../i18n/strings.js';
import { makeClaudeCodeInstaller } from '../../../install/adapters/claude-code.js';
import { makeOpenCodeInstaller } from '../../../install/adapters/opencode.js';
import { makeCopilotInstaller } from '../../../install/adapters/copilot.js';
import type { ClientId } from '../../../install/types.js';
import { runInstall, runUninstall } from '../../install-cmd.js';

/**
 * Install / Uninstall screen — three clients with right-aligned detect badges.
 * Per-row layout: cursor [h] label            <badge>
 */

interface ClientRow {
  id: ClientId;
  displayName: string;
  hotkey: string;
  badgeKind: BadgeKind;
  badgeLabel: string;
}

interface InstallScreenProps {
  lang: 'en' | 'es';
  agbHome: string;
  mode: 'install' | 'uninstall';
  onBack: () => void;
}

const CLIENT_DEFS: { id: ClientId; displayName: string; hotkey: string }[] = [
  { id: 'claude-code', displayName: 'Claude Code',    hotkey: 'c' },
  { id: 'opencode',    displayName: 'OpenCode',        hotkey: 'o' },
  { id: 'copilot',     displayName: 'GitHub Copilot',  hotkey: 'p' },
];

function buildInstallers() {
  return [
    makeClaudeCodeInstaller(),
    makeOpenCodeInstaller(),
    makeCopilotInstaller(),
  ];
}

export function InstallScreen({ lang, agbHome, mode, onBack }: InstallScreenProps) {
  const [idx, setIdx] = useState(0);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const titleKey = mode === 'install' ? 'tui.install.title' : 'tui.uninstall.title';
  const promptKey = mode === 'install' ? 'tui.install.prompt' : 'tui.uninstall.prompt';

  // Load detect state for each client
  useEffect(() => {
    let cancelled = false;
    const installers = buildInstallers();

    void Promise.all(
      CLIENT_DEFS.map(async (def) => {
        const installer = installers.find((i) => i.id === def.id);
        if (!installer) {
          return {
            ...def,
            badgeKind: 'muted' as BadgeKind,
            badgeLabel: t('install.status.not_detected', lang),
          };
        }
        try {
          const detected = await installer.detect();
          if (!detected.clientDetected) {
            return {
              ...def,
              badgeKind: 'muted' as BadgeKind,
              badgeLabel: t('install.status.not_detected', lang),
            };
          }
          if (detected.registered) {
            return {
              ...def,
              badgeKind: 'ok' as BadgeKind,
              badgeLabel: t('install.status.registered', lang),
            };
          }
          return {
            ...def,
            badgeKind: 'warn' as BadgeKind,
            badgeLabel: t('install.status.not_registered', lang),
          };
        } catch {
          return {
            ...def,
            badgeKind: 'muted' as BadgeKind,
            badgeLabel: t('install.status.not_detected', lang),
          };
        }
      }),
    ).then((resolved) => {
      if (!cancelled) setRows(resolved);
    });

    return () => { cancelled = true; };
  }, [lang]);

  const fireInstall = (clientId: ClientId, displayName: string): void => {
    setRunning(true);
    void (async () => {
      try {
        if (mode === 'install') {
          await runInstall({ clientId, dryRun: false, lang });
          setResult(t('install.success', lang).replace('{client}', displayName));
        } else {
          await runUninstall({ clientId, dryRun: false, lang });
          setResult(t('uninstall.success', lang).replace('{client}', displayName));
        }
      } catch (e) {
        setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setRunning(false);
      }
    })();
  };

  useInput((input, key) => {
    if (running) return;
    if (result !== null) {
      // Any key returns to menu after result
      onBack();
      return;
    }
    if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
    else if (key.downArrow) setIdx((i) => Math.min(rows.length - 1, i + 1));
    else if (key.return) {
      const row = rows[idx];
      if (row) fireInstall(row.id, row.displayName);
    } else if (key.escape || input === 'q') {
      onBack();
    } else {
      const target = rows.find((r) => r.hotkey === input.toLowerCase());
      if (target) fireInstall(target.id, target.displayName);
    }
  });

  return (
    <Frame
      title={t(titleKey, lang)}
      agbHome={agbHome}
      footerKeys={[
        { k: `${GLYPHS.up}${GLYPHS.down}`, label: t('tui.footer.navigate', lang) },
        { k: GLYPHS.enter, label: t('tui.footer.select', lang) },
        { k: 'Esc', label: t('tui.footer.back', lang) },
      ]}
    >
      {running && (
        <Box marginBottom={1}>
          <Text color={COLORS.muted} dimColor>
            {mode === 'install' ? t('tui.install.running', lang) : t('tui.uninstall.running', lang)}
          </Text>
        </Box>
      )}
      {result !== null && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={COLORS.success}>{result}</Text>
          <Text color={COLORS.muted} dimColor>{t('tui.press_any_key', lang)}</Text>
        </Box>
      )}
      {result === null && !running && (
        <>
          <Text color="white" bold>{t(promptKey, lang)}</Text>
          <Box marginTop={1} flexDirection="column">
            {rows.map((row, i) => (
              <MenuRow
                key={row.id}
                focused={i === idx}
                hotkey={row.hotkey}
                label={row.displayName}
                badge={<Badge kind={row.badgeKind} label={row.badgeLabel} />}
              />
            ))}
          </Box>
        </>
      )}
    </Frame>
  );
}
