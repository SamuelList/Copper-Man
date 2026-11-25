import { useSettings, VIEW_NAMES, type ViewMode } from '@state/settingsStore';
import styles from './components.module.css';

const VIEWS = Object.keys(VIEW_NAMES) as ViewMode[];

/**
 * Choose the camera: the top-down diorama or first person. Remembered between sessions.
 * `fill` stretches it to the width of its container (the pause menu's column of buttons).
 */
export function ViewSwitch({ fill = false }: { fill?: boolean }) {
  const view = useSettings((s) => s.view);
  const setView = useSettings((s) => s.setView);
  return (
    <div
      className={styles.tabs}
      style={fill ? { width: '100%' } : undefined}
      role="radiogroup"
      aria-label="Camera"
    >
      {VIEWS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === view}
          className={[styles.tab, id === view && styles.tabActive].filter(Boolean).join(' ')}
          onClick={() => setView(id)}
        >
          {VIEW_NAMES[id]}
        </button>
      ))}
    </div>
  );
}
