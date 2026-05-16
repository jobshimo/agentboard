import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import { COLORS, GLYPHS } from '../tokens.js';
import { probeForExistingDaemon } from '../../spawn-daemon.js';
import { loadRegistry } from '../../../server/registry.js';

/**
 * Global status bar — always shown at the top of every Frame.
 *
 * Shows (in order, separated by · in muted color):
 *   daemon :7733  (green if running, gray "stopped" if not)
 *   N projects    (count from the registry)
 *
 * Lazy-loads on mount via useEffect. Shows a spinning glyph during probe.
 */

const DAEMON_PORT = 7733;
const SPINNER_INTERVAL_MS = 80;

interface StatusBarProps {
  agbHome: string;
}

type DaemonState =
  | { kind: 'checking' }
  | { kind: 'running'; port: number }
  | { kind: 'stopped' };

export function StatusBar({ agbHome }: StatusBarProps) {
  const [daemon, setDaemon] = useState<DaemonState>({ kind: 'checking' });
  const [projectCount, setProjectCount] = useState<number | null>(null);
  const [spinnerIdx, setSpinnerIdx] = useState(0);

  // Spinner tick
  useEffect(() => {
    if (daemon.kind !== 'checking') return;
    const id = setInterval(() => {
      setSpinnerIdx((i) => (i + 1) % GLYPHS.spinnerFrames.length);
    }, SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [daemon.kind]);

  // Probe daemon + load registry
  useEffect(() => {
    let cancelled = false;

    void probeForExistingDaemon(DAEMON_PORT, agbHome).then((result) => {
      if (cancelled) return;
      if ('alreadyRunning' in result && result.alreadyRunning) {
        setDaemon({ kind: 'running', port: result.port });
      } else {
        setDaemon({ kind: 'stopped' });
      }
    }).catch(() => {
      if (!cancelled) setDaemon({ kind: 'stopped' });
    });

    try {
      const registry = loadRegistry(agbHome);
      if (!cancelled) setProjectCount(registry.repos.length);
    } catch {
      if (!cancelled) setProjectCount(0);
    }

    return () => { cancelled = true; };
  }, [agbHome]);

  const spinner = GLYPHS.spinnerFrames[spinnerIdx] ?? GLYPHS.spinnerFrames[0] ?? '⠋';

  return (
    <Box>
      {/* Daemon segment */}
      {daemon.kind === 'checking' && (
        <Text color={COLORS.muted}>{spinner} daemon checking</Text>
      )}
      {daemon.kind === 'running' && (
        <Text>
          <Text color={COLORS.success}>daemon :{daemon.port}</Text>
        </Text>
      )}
      {daemon.kind === 'stopped' && (
        <Text color={COLORS.muted}>daemon stopped</Text>
      )}

      {/* Separator */}
      {daemon.kind !== 'checking' && projectCount !== null && (
        <Text color={COLORS.muted} dimColor>{`   ${GLYPHS.dot}   `}</Text>
      )}

      {/* Project count */}
      {projectCount !== null && (
        <Text color={COLORS.muted}>
          {projectCount === 1 ? '1 project' : `${projectCount} projects`}
        </Text>
      )}
    </Box>
  );
}
