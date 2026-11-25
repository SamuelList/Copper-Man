import type { ShiftSession } from '@core/session/ShiftSession';
import type { ShiftConfig, ShiftSummary } from '@core/session/types';
import { useShiftStore } from '@state/shiftStore';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GameEngine } from './GameEngine';

interface Props {
  config: ShiftConfig;
  onShiftEnd(summary: ShiftSummary): void;
  className?: string;
}

/** Give up replacing the engine by itself after this many losses in quick succession. */
const MAX_QUICK_LOSSES = 3;
const QUICK_LOSS_MS = 20_000;

/**
 * React boundary for the 3D world. Creates the engine on mount and destroys it on unmount
 * (StrictMode-safe). Everything else talks to the game through the stores.
 *
 * It also keeps the shift alive when the graphics don't: a phone takes the WebGL context away
 * from a page left in the background, and may never give that one back. So a lost context
 * means a new engine (new canvas, new context) around the same shift, paused where it stopped.
 */
export function GameView({ config, onShiftEnd, className }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onEndRef = useRef(onShiftEnd);
  /** The shift in progress, for an engine that replaces the one that started it. */
  const shiftRef = useRef<{ config: ShiftConfig; session: ShiftSession } | null>(null);
  /** When the context was last lost, to notice a device that can't hold on to one. */
  const lossesRef = useRef<number[]>([]);
  /** Bumped to build a new engine around the shift in progress. */
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onEndRef.current = onShiftEnd;
  }, [onShiftEnd]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let engine: GameEngine | null = null;
    let stopWaiting = () => {};
    const underWay = shiftRef.current?.config === config ? shiftRef.current.session : undefined;

    const replaceEngine = () => {
      const now = performance.now();
      const recent = lossesRef.current.filter((at) => now - at < QUICK_LOSS_MS);
      lossesRef.current = [...recent, now];
      if (recent.length >= MAX_QUICK_LOSSES) {
        setError('The 3D graphics keep cutting out on this device.');
        return;
      }
      setAttempt((n) => n + 1);
    };

    try {
      engine = new GameEngine(host, {
        config,
        session: underWay,
        onEnd: (summary) => onEndRef.current(summary),
        onContextLost: () => {
          // A finished shift is about to leave this screen anyway.
          if (engine?.session.status !== 'running') return;
          if (!document.hidden) return replaceEngine();
          // Not until someone is looking: a hidden page may not be given a new context.
          const onVisible = () => {
            if (document.hidden) return;
            stopWaiting();
            replaceEngine();
          };
          document.addEventListener('visibilitychange', onVisible);
          stopWaiting = () => document.removeEventListener('visibilitychange', onVisible);
        },
      });
      shiftRef.current = { config, session: engine.session };
      // Taking over mid-shift: hand it back paused, so the player can find their feet.
      if (underWay && attempt > 0) useShiftStore.getState().setPaused(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
    } catch (e) {
      console.error(e);
      // Rendering failed (no WebGL, or none to spare right now); say so instead of a blank
      // screen, and don't leave a half-built canvas holding on to a context.
      for (const canvas of host.querySelectorAll('canvas')) {
        canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        canvas.remove();
      }
      setError("The game couldn't start its 3D graphics (WebGL).");
    }
    return () => {
      stopWaiting();
      engine?.destroy();
    };
  }, [config, attempt]);

  return (
    <div ref={hostRef} className={className} data-testid="game-host">
      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            display: 'grid',
            placeContent: 'center',
            justifyItems: 'center',
            gap: '1rem',
            padding: '2rem',
            textAlign: 'center',
            color: 'var(--text)',
            background: 'var(--bg)',
          }}
        >
          <p style={{ margin: 0, maxWidth: '30rem' }}>
            {error} Closing other tabs or apps that draw 3D can free it up.
          </p>
          <button
            type="button"
            onClick={() => {
              lossesRef.current = [];
              setAttempt((n) => n + 1);
            }}
            style={{
              minHeight: 44,
              padding: '0.6rem 1.4rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--copper)',
              color: '#1a1206',
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
