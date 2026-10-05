import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { createGame } from './createGame';

interface Props {
  config: ShiftConfig;
  onShiftEnd(summary: ShiftSummary): void;
  className?: string;
}

/**
 * React boundary for the Phaser world. Creates the game on mount and destroys it on unmount
 * (StrictMode-safe). Everything else talks to the game through the stores.
 */
export function PhaserGame({ config, onShiftEnd, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onShiftEnd);

  useEffect(() => {
    onEndRef.current = onShiftEnd;
  }, [onShiftEnd]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const game = createGame(host, { config, onEnd: (summary) => onEndRef.current(summary) });
    return () => {
      game.destroy(true);
    };
  }, [config]);

  return <div ref={hostRef} className={className} data-testid="game-host" />;
}
