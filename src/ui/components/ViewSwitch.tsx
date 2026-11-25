import {
  LOOK_SPEEDS,
  useSettings,
  VIEW_NAMES,
  type LookSpeed,
  type ViewMode,
} from '@state/settingsStore';
import { Segmented } from './Segmented';

const VIEWS = (Object.keys(VIEW_NAMES) as ViewMode[]).map((id) => ({ id, name: VIEW_NAMES[id] }));
const SPEEDS = (Object.keys(LOOK_SPEEDS) as LookSpeed[]).map((id) => ({
  id,
  name: LOOK_SPEEDS[id].name,
}));

/**
 * Choose the camera: the top-down diorama or first person. Remembered between sessions.
 * `fill` stretches it to the width of its container (the pause menu's column of buttons).
 */
export function ViewSwitch({ fill = false }: { fill?: boolean }) {
  const view = useSettings((s) => s.view);
  const setView = useSettings((s) => s.setView);
  return <Segmented label="Camera" options={VIEWS} value={view} onChange={setView} fill={fill} />;
}

/** How fast a drag of the thumb (or the mouse) turns you in first person. Remembered too. */
export function LookSpeedSwitch({ fill = false }: { fill?: boolean }) {
  const speed = useSettings((s) => s.lookSpeed);
  const setSpeed = useSettings((s) => s.setLookSpeed);
  return (
    <Segmented
      label="Look speed"
      caption="Look"
      options={SPEEDS}
      value={speed}
      onChange={setSpeed}
      fill={fill}
    />
  );
}
