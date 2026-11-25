import { useSettings, VIEW_NAMES, type ViewMode } from '@state/settingsStore';
import styles from './components.module.css';

const VIEWS = Object.keys(VIEW_NAMES) as ViewMode[];

/** Choose the camera: the top-down diorama or first person. Remembered between sessions. */
export function ViewSwitch() {
  const view = useSettings((s) => s.view);
  const setView = useSettings((s) => s.setView);
  return (
    <div className={styles.tabs} role="radiogroup" aria-label="Camera">
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
