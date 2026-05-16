import { Box, Text, useInput } from 'ink';
import { useState, useEffect } from 'react';
import { COLORS, GLYPHS } from '../tokens.js';
import { Frame } from '../components/Frame.js';
import { t } from '../../../i18n/strings.js';
import { buildDoctorReport, formatDoctorReport } from '../../doctor-report.js';

/**
 * Doctor screen — runs the doctor report and displays the formatted output.
 */

interface DoctorScreenProps {
  lang: 'en' | 'es';
  agbHome: string;
  onBack: () => void;
}

export function DoctorScreen({ lang, agbHome, onBack }: DoctorScreenProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void buildDoctorReport({ agbHome }).then((report) => {
      setOutput(formatDoctorReport(report, lang));
    }).catch((e: unknown) => {
      setError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    });
  }, [agbHome, lang]);

  useInput((_input, key) => {
    if (key.escape || _input === 'q') onBack();
  });

  return (
    <Frame
      title={t('tui.doctor.title', lang)}
      agbHome={agbHome}
      footerKeys={[
        { k: 'Esc', label: t('tui.footer.back', lang) },
      ]}
    >
      {output === null && error === null && (
        <Box marginTop={1}>
          <Text color={COLORS.muted}>{GLYPHS.spinnerFrames[0]} {t('tui.doctor.running', lang)}</Text>
        </Box>
      )}
      {output !== null && (
        <Box marginTop={1} flexDirection="column">
          {output.split('\n').map((line, i) => (
            <Text key={String(i)}>{line}</Text>
          ))}
        </Box>
      )}
      {error !== null && (
        <Box marginTop={1}>
          <Text color={COLORS.error}>{error}</Text>
        </Box>
      )}
    </Frame>
  );
}
