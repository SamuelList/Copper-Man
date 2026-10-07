import { METAL_IDS, METALS } from '@core/content/metals';
import { NPCS } from '@core/content/npcs';
import { bagTotal, isBagFull } from '@core/systems/bag';
import { useShiftStore } from '@state/shiftStore';
import type { CSSProperties } from 'react';
import { clock, css, money, units } from '../format';
import {
  LOW_TIME,
  lightLabel,
  useBag,
  useDetection,
  useLight,
  useShiftClock,
  useStatus,
} from './hooks';
import { PauseButton, XpCounter } from './widgets';
import styles from './touchBar.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** Light gem, the clock and the room you're in. */
function ShiftChip() {
  const { timeLeft, day, roomName } = useShiftClock();
  const light = useLight();
  const { label, hint } = lightLabel(light);
  return (
    <div className={cx(styles.chip, styles.shift)}>
      <span
        className={styles.gem}
        style={{ '--light': light } as CSSProperties}
        data-testid="visibility"
        role="img"
        aria-label={`${label}: ${hint}`}
        title={`${label}: ${hint}`}
      />
      <span
        className={cx(styles.clock, timeLeft <= LOW_TIME && styles.low)}
        data-testid="shift-timer"
        aria-label={`Day ${day}, ${clock(timeLeft)} left`}
      >
        {clock(timeLeft)}
      </span>
      <span className={styles.room}>{roomName}</span>
    </div>
  );
}

/** How full the bag is, by metal. */
function BagChip() {
  const bag = useBag();
  if (!bag) return null;
  const full = isBagFull(bag);
  return (
    <div
      className={cx(styles.chip, styles.bag, full && styles.full)}
      data-testid="bag"
      aria-label={`Scrap bag: ${units(bagTotal(bag))} of ${units(bag.capacity)}`}
    >
      <span className={styles.bagIcon} aria-hidden>
        🎒
      </span>
      <span className={styles.bagBar}>
        {METAL_IDS.map((m) =>
          bag.contents[m] > 0 ? (
            <span
              key={m}
              style={{
                width: `${(bag.contents[m] / bag.capacity) * 100}%`,
                background: css(METALS[m].color),
              }}
            />
          ) : null,
        )}
      </span>
      <span className={styles.num}>
        {full ? (
          'Full'
        ) : (
          <>
            {units(bagTotal(bag))}
            <span className={styles.cap}>/{units(bag.capacity)}</span>
          </>
        )}
      </span>
    </div>
  );
}

/** Who's noticed you: an eye and a meter, with a word only when it matters. */
function DetectionChip() {
  const { detection, spotted, suspicious, escalation, grace, tone } = useDetection();
  const label = spotted
    ? 'Spotted!'
    : grace
      ? 'Escorted'
      : detection > 0
        ? 'Noticed'
        : suspicious
          ? 'Suspicious'
          : null;
  return (
    <div
      className={cx(styles.chip, styles.detect, spotted && styles.spotted)}
      data-tone={tone}
      role="meter"
      aria-label="Detection"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={detection}
      aria-valuetext={`${label ?? 'Blending in'}${
        escalation > 0 ? `, ${NPCS.boss.name} is faster (level ${escalation})` : ''
      }`}
    >
      <span aria-hidden>{spotted ? '🚨' : '👁'}</span>
      <span className={styles.meter}>
        <span style={{ width: `${detection * 100}%` }} />
      </span>
      {label && <span className={styles.detectLabel}>{label}</span>}
      {escalation > 0 && <span className={styles.escalation}>+{escalation}</span>}
    </div>
  );
}

/** Cash sold this shift, hearts and XP. */
function StatusChip() {
  const { earned, warnings, max } = useStatus();
  return (
    <div className={cx(styles.chip, styles.status)}>
      <span className={styles.cash} data-testid="shift-earned">
        {money(earned)}
      </span>
      <span className={styles.hearts} aria-label={`${max - warnings} of ${max} hearts left`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < max - warnings ? styles.heart : styles.heartLost}>
            ♥
          </span>
        ))}
      </span>
      <XpCounter />
    </div>
  );
}

/** Phone HUD: one slim row of glass chips across the top (two rows in portrait). */
export function TouchBar() {
  const ready = useShiftStore((s) => s.snapshot !== null);
  if (!ready) return null;
  return (
    <div className={styles.bar} data-testid="touch-bar">
      <ShiftChip />
      <BagChip />
      <DetectionChip />
      <StatusChip />
      <PauseButton />
    </div>
  );
}
