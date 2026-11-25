import styles from './components.module.css';

interface Props<T extends string> {
  /** What is being chosen, for screen readers. */
  label: string;
  /** A word shown in front of the options, where they don't explain themselves. */
  caption?: string;
  options: readonly { id: T; name: string }[];
  value: T;
  onChange(value: T): void;
  /** Stretch to the width of the container (a column of buttons). */
  fill?: boolean;
}

/** A row of buttons of which exactly one is chosen. */
export function Segmented<T extends string>({
  label,
  caption,
  options,
  value,
  onChange,
  fill,
}: Props<T>) {
  return (
    <div
      className={styles.tabs}
      style={fill ? { width: '100%' } : undefined}
      role="radiogroup"
      aria-label={label}
    >
      {caption && (
        <span className={styles.tabsCaption} aria-hidden>
          {caption}
        </span>
      )}
      {options.map(({ id, name }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          className={[styles.tab, id === value && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => onChange(id)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}
