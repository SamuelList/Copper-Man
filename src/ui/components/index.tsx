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
