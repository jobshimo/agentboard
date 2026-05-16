import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import { Frame } from '../components/Frame.js';
import { SectionHead } from '../components/SectionHead.js';
import { MenuRow } from '../components/MenuRow.js';
import { COLORS, GLYPHS } from '../tokens.js';
import { t } from '../../../i18n/strings.js';
import { getVersion } from '../../version.js';

/**
 * Main menu screen — grouped sections, dual nav (arrows + hotkeys).
 *
 * Groups:
 *   SERVER    — Start daemon, Open Web UI, List known projects
 *   CLIENT    — Install MCP, Uninstall
 *   DIAGNOSE  — Doctor, Update check
 *   REFERENCE — Language toggle, Quit
 *
 * Hotkeys are stable across languages — they are letters the user types
 * once and remembers, not characters drawn from translated copy.
 */

export type MenuAction =
  | 'start-daemon'
  | 'open-web-ui'
  | 'list-projects'
  | 'install-mcp'
  | 'uninstall'
  | 'doctor'
  | 'update-check'
  | 'language-toggle'
  | 'quit';

type MenuGroup = 'server' | 'client' | 'diagnose' | 'reference';

interface MenuRowSpec {
  value: MenuAction;
  group: MenuGroup;
  hotkey: string;
}

/* Ordering is the visual order on screen. Hotkeys are unique across the
 * full menu:
 *   s = start-daemon   o = open-web-ui   p = list-projects
 *   i = install-mcp    u = uninstall
 *   d = doctor         c = update-check
 *   l = language       q = quit
 */
const MENU_SPEC: MenuRowSpec[] = [
  { value: 'start-daemon',    group: 'server',    hotkey: 's' },
  { value: 'open-web-ui',     group: 'server',    hotkey: 'o' },
  { value: 'list-projects',   group: 'server',    hotkey: 'p' },
  { value: 'install-mcp',     group: 'client',    hotkey: 'i' },
  { value: 'uninstall',       group: 'client',    hotkey: 'u' },
  { value: 'doctor',          group: 'diagnose',  hotkey: 'd' },
  { value: 'update-check',    group: 'diagnose',  hotkey: 'c' },
  { value: 'language-toggle', group: 'reference', hotkey: 'l' },
  { value: 'quit',            group: 'reference', hotkey: 'q' },
];

interface MenuScreenProps {
  lang: 'en' | 'es';
  agbHome: string;
  onSelect: (action: MenuAction) => void;
  onSwapLang: () => void;
  onQuit: () => void;
  /** Status message to display (e.g. after firing an action). */
  statusMessage?: string;
}

function labelFor(action: MenuAction, lang: 'en' | 'es'): string {
  const key: Record<MenuAction, string> = {
    'start-daemon':    'menu.start_daemon',
    'open-web-ui':     'menu.open_web_ui',
    'list-projects':   'menu.list_projects',
    'install-mcp':     'menu.install_mcp',
    'uninstall':       'menu.uninstall',
    'doctor':          'menu.doctor',
    'update-check':    'menu.update_check',
    'language-toggle': 'menu.language_toggle',
    'quit':            'menu.quit',
  };
  return t(key[action], lang);
}

function hintFor(action: MenuAction, lang: 'en' | 'es'): string {
  const key: Record<MenuAction, string> = {
    'start-daemon':    'tui.hint.start_daemon',
    'open-web-ui':     'tui.hint.open_web_ui',
    'list-projects':   'tui.hint.list_projects',
    'install-mcp':     'tui.hint.install_mcp',
    'uninstall':       'tui.hint.uninstall',
    'doctor':          'tui.hint.doctor',
    'update-check':    'tui.hint.update_check',
    'language-toggle': 'tui.hint.language_toggle',
    'quit':            'tui.hint.quit',
  };
  return t(key[action], lang);
}

export function MenuScreen({
  lang,
  agbHome,
  onSelect,
  onSwapLang,
  onQuit,
  statusMessage,
}: MenuScreenProps) {
  const [idx, setIdx] = useState(0);

  const handleAction = (value: MenuAction): void => {
    if (value === 'quit') {
      onQuit();
    } else if (value === 'language-toggle') {
      onSwapLang();
    } else {
      onSelect(value);
    }
  };

  useInput((input, key) => {
    if (key.upArrow) setIdx((i) => Math.max(0, i - 1));
    else if (key.downArrow) setIdx((i) => Math.min(MENU_SPEC.length - 1, i + 1));
    else if (key.return) {
      const spec = MENU_SPEC[idx];
      if (spec) handleAction(spec.value);
    } else if (input === 'q' || key.escape) {
      onQuit();
    } else {
      const lower = input.toLowerCase();
      const target = MENU_SPEC.find((m) => m.hotkey.toLowerCase() === lower);
      if (target) handleAction(target.value);
    }
  });

  const groups: { id: MenuGroup; headKey: string }[] = [
    { id: 'server',    headKey: 'tui.section.server' },
    { id: 'client',    headKey: 'tui.section.client' },
    { id: 'diagnose',  headKey: 'tui.section.diagnose' },
    { id: 'reference', headKey: 'tui.section.reference' },
  ];

  const version = getVersion();

  return (
    <Frame
      title={t('tui.menu.title', lang)}
      badge={
        <Text color={COLORS.muted} dimColor>
          v{version}
        </Text>
      }
      agbHome={agbHome}
      footerKeys={[
        { k: `${GLYPHS.up}${GLYPHS.down}`, label: t('tui.footer.navigate', lang) },
        { k: GLYPHS.enter, label: t('tui.footer.select', lang) },
        { k: 'a-z', label: t('tui.footer.hotkey', lang) },
        { k: 'l', label: t('tui.footer.lang', lang) },
        { k: 'q', label: t('tui.footer.quit', lang) },
      ]}
    >
      {statusMessage !== undefined && statusMessage !== '' && (
        <Box marginBottom={1}>
          <Text color={COLORS.success}>{statusMessage}</Text>
        </Box>
      )}

      <Box>
        <Text color="white" bold>
          {t('tui.menu.prompt', lang)}
        </Text>
        <Text color={COLORS.muted} dimColor italic>
          {'  '}
          {GLYPHS.dot} {t('tui.menu.prompt_hint', lang)}
        </Text>
      </Box>

      {groups.map((g) => (
        <Box key={g.id} flexDirection="column">
          <SectionHead>{t(g.headKey, lang)}</SectionHead>
          {MENU_SPEC.filter((m) => m.group === g.id).map((spec) => {
            const globalIndex = MENU_SPEC.indexOf(spec);
            const hintText = hintFor(spec.value, lang);
            return (
              <MenuRow
                key={spec.value}
                focused={globalIndex === idx}
                hotkey={spec.hotkey}
                label={labelFor(spec.value, lang)}
                {...(hintText !== '' ? { hint: hintText } : {})}
              />
            );
          })}
        </Box>
      ))}
    </Frame>
  );
}
