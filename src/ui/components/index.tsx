import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import styles from './components.module.css';

type Variant = 'default' | 'primary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'normal' | 'small';
}

export function Button({ variant = 'default', size = 'normal', className, ...rest }: ButtonProps) {
  const classes = [
    styles.button,
    variant !== 'default' && styles[variant],
    size === 'small' && styles.small,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button type="button" className={classes} {...rest} />;
}

export function Panel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={[styles.panel, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

/** A 1–`max` stat shown as pips, e.g. Speed ●●●. */
export function StatBar({
  label,
  value,
  max = 3,
  color,
}: {
  label: string;
  value: number;
  max?: number;
  color?: string;
}) {
  return (
    <div
      className={styles.statRow}
      role="meter"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <span>{label}</span>
      <span
        className={styles.pips}
        style={color ? ({ '--accent': color } as CSSProperties) : undefined}
      >
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={[styles.pip, i < value && styles.pipOn].filter(Boolean).join(' ')}
          />
        ))}
      </span>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}

/** Remaining hearts filled, lost hearts faded. */
export function Hearts({ warnings, max }: { warnings: number; max: number }) {
  const left = Math.max(0, max - warnings);
  return (
    <span className={styles.hearts} role="img" aria-label={`${left} of ${max} hearts`}>
      {'♥'.repeat(left)}
      <span className={styles.heartLost}>{'♥'.repeat(Math.max(0, max - left))}</span>
    </span>
  );
}

/** Level chip with a progress bar toward the next level. */
export function LevelBadge({
  level,
  xp,
  next,
  points = 0,
}: {
  level: number;
  xp: number;
  next: number;
  points?: number;
}) {
  return (
    <span className={styles.level} data-testid="level">
      <span className={styles.levelNum}>Lv {level}</span>
      <span
        className={styles.xpTrack}
        role="progressbar"
        aria-label="Experience"
        aria-valuenow={xp}
        aria-valuemin={0}
        aria-valuemax={next}
      >
        <span className={styles.xpFill} style={{ width: `${Math.min(100, (xp / next) * 100)}%` }} />
      </span>
      <span className={styles.xpText}>
        {xp}/{next} XP
      </span>
      {points > 0 && (
        <span className={styles.points} title="Unspent skill points">
          +{points} skill {points === 1 ? 'point' : 'points'}
        </span>
      )}
    </span>
  );
}

/** Segmented tab bar. Keeps a big touch target on phones. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly { id: T; label: ReactNode }[];
  value: T;
  onChange(id: T): void;
  label: string;
}) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={[styles.tab, t.id === value && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
