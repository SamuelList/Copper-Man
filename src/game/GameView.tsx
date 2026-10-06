import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';

interface Props {
  config: ShiftConfig;
  onShiftEnd(summary: ShiftSummary): void;
  className?: string;
}

/**
 * React boundary for the 3D world. Creates the engine on mount and destroys it on unmount
 * (StrictMode-safe). Everything else talks to the game through the stores.
 */
export function GameView({ config, onShiftEnd, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onShiftEnd);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEndRef.current = onShiftEnd;
  }, [onShiftEnd]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: GameEngine | null = null;
    try {
      engine = new GameEngine(host, { config, onEnd: (summary) => onEndRef.current(summary) });
    } catch (e) {
      console.error(e);
      // Rendering failed (usually no WebGL); show a message instead of a blank screen.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(
        'This game needs WebGL. Try a recent desktop browser with hardware acceleration on.',
      );
    }
    return () => engine?.destroy();
  }, [config]);

  return (
    <div ref={hostRef} className={className} data-testid="game-host">
      {error && (
        <p role="alert" style={{ color: '#fff', padding: '2rem', maxWidth: '36rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
