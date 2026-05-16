import { Box, Text, useInput } from 'ink';
import { COLORS, GLYPHS, SPACE } from '../tokens.js';
import { Frame } from '../components/Frame.js';
import { t } from '../../../i18n/strings.js';
import { loadRegistry } from '../../../server/registry.js';

/**
 * Projects screen — lists repos tracked by the daemon from daemon.json.
 * Empty state when zero repos.
 */

interface ProjectsScreenProps {
  lang: 'en' | 'es';
  agbHome: string;
  onBack: () => void;
}

export function ProjectsScreen({ lang, agbHome, onBack }: ProjectsScreenProps) {
  useInput((_input, key) => {
    if (key.escape || _input === 'q') onBack();
  });

  let repos: { path: string; lastSeenAt: string }[] = [];
  try {
    const registry = loadRegistry(agbHome);
    repos = registry.repos.map((r) => ({ path: r.displayPath ?? r.path, lastSeenAt: r.lastSeenAt }));
  } catch {
    repos = [];
  }

  return (
    <Frame
      title={t('tui.projects.title', lang)}
      agbHome={agbHome}
      footerKeys={[
        { k: 'Esc', label: t('tui.footer.back', lang) },
      ]}
    >
      {repos.length === 0 ? (
        <Box flexDirection="column" marginTop={SPACE.gap}>
          <Text color="white" bold>{t('tui.projects.empty', lang)}</Text>
          <Text color={COLORS.muted} dimColor>{t('tui.projects.empty_hint', lang)}</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginTop={SPACE.gap}>
          {repos.map((repo) => (
            <Box key={repo.path}>
              <Text color={COLORS.muted}>{GLYPHS.dot} </Text>
              <Text color="white">{repo.path}</Text>
              <Text color={COLORS.muted} dimColor>{'   '}{repo.lastSeenAt}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Frame>
  );
}
