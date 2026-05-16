import { Box, Text, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { COLORS, GLYPHS } from '../tokens.js';
import { Frame } from '../components/Frame.js';
import { t } from '../../../i18n/strings.js';
import { checkForUpdate } from '../../update-check.js';
import { getVersion } from '../../version.js';

/**
 * Update check screen — hits npm registry, shows result.
 */

interface UpdateScreenProps {
  lang: 'en' | 'es';
  agbHome: string;
  onBack: () => void;
}

type UpdateState =
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'newer'; latest: string }
  | { kind: 'error' };

export function UpdateScreen({ lang, agbHome, onBack }: UpdateScreenProps) {
  const [state, setState] = useState<UpdateState>({ kind: 'checking' });

  useEffect(() => {
    void checkForUpdate(getVersion()).then((result) => {
      if (result.status === 'newer' && result.latest) {
        setState({ kind: 'newer', latest: result.latest });
      } else {
        setState({ kind: 'up-to-date' });
      }
    }).catch(() => {
      setState({ kind: 'error' });
    });
  }, []);

  useInput((_input, key) => {
    if (key.escape || _input === 'q') onBack();
  });

  return (
    <Frame
      title={t('tui.update.title', lang)}
      agbHome={agbHome}
      footerKeys={[
        { k: 'Esc', label: t('tui.footer.back', lang) },
      ]}
    >
      <Box marginTop={1} flexDirection="column">
        {state.kind === 'checking' && (
          <Text color={COLORS.muted}>{GLYPHS.spinnerFrames[0]} {t('tui.update.running', lang)}</Text>
        )}
        {state.kind === 'up-to-date' && (
          <Text color={COLORS.success}>{GLYPHS.check} {t('tui.update.up_to_date', lang)}</Text>
        )}
        {state.kind === 'newer' && (
          <>
            <Text color={COLORS.warn}>
              {GLYPHS.warn} {t('tui.update.newer', lang).replace('{latest}', state.latest)}
            </Text>
            <Box marginTop={1}>
              <Text color={COLORS.muted}>{t('tui.update.install_cmd', lang)}</Text>
            </Box>
          </>
        )}
        {state.kind === 'error' && (
          <Text color={COLORS.error}>{GLYPHS.cross} {t('tui.update.error', lang)}</Text>
        )}
      </Box>
    </Frame>
  );
}
