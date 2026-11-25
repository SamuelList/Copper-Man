import { CONSUMABLES } from '@core/content/consumables';
import { useShiftStore } from '@state/shiftStore';
import { virtualInput } from '@state/virtualInput';
import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useFirstPerson } from './hooks';
import styles from './touch.module.css';

/** Stick travel in CSS px. */
const STICK_RADIUS = 44;

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** Round a 0..1 fill to the steps a ring can show, so it re-renders sparingly. */
const step = (fill: number) => Math.round(Math.min(1, Math.max(0, fill)) * 40) / 40;

const VERB_ICON: Record<string, string> = {
  fixture: '🔧',
  door: '🔑',
  van: '💰',
  coworker: '👋',
};

/**
 * Let go of whatever is held when the game stops being in front (another app, the lock screen,
 * a call): a finger lifted while the page is hidden is never reported, and the control would
 * stay down, or stop answering, until the page was reloaded.
 */
function useLetGoWhenAway(letGo: () => void) {
  const latest = useRef(letGo);
  useEffect(() => {
    latest.current = letGo;
  });
  useEffect(() => {
    const away = () => latest.current();
    const hidden = () => {
      if (document.hidden) away();
    };
    window.addEventListener('blur', away);
    window.addEventListener('pagehide', away);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('blur', away);
      window.removeEventListener('pagehide', away);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, []);
}

/**
 * Props for a button you hold down (interact, sprint): captures the finger so sliding off the
 * button doesn't drop it, and lets go on release, cancel, lost capture or the game going away.
 */
function useHold(key: 'interact' | 'sprint') {
  const button = useRef<HTMLButtonElement>(null);
  const set = (on: boolean) => {
    virtualInput[key] = on;
    if (button.current) button.current.dataset.held = String(on);
  };
  useLetGoWhenAway(() => set(false));
  const hold = (on: boolean) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (on) e.currentTarget.setPointerCapture?.(e.pointerId);
    set(on);
  };
  return {
    ref: button,
    onPointerDown: hold(true),
    onPointerUp: hold(false),
    onPointerCancel: hold(false),
    onLostPointerCapture: () => set(false),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
}

/**
 * Floating joystick: touch anywhere on the left side and drag; ease off to walk slowly.
 * Updates the DOM directly on move so dragging never re-renders React.
 */
function Joystick() {
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; x: number; y: number } | null>(null);

  const place = (x: number, y: number) => {
    const rect = zone.current!.getBoundingClientRect();
    base.current!.style.left = `${x - rect.left}px`;
    base.current!.style.top = `${y - rect.top}px`;
  };

  const setKnob = (dx: number, dy: number) => {
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onDown = (e: ReactPointerEvent) => {
    if (active.current) return;
    e.preventDefault();
    zone.current!.setPointerCapture?.(e.pointerId);
    active.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    place(e.clientX, e.clientY);
    base.current!.dataset.active = 'true';
  };

  const onMove = (e: ReactPointerEvent) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    let dx = e.clientX - a.x;
    let dy = e.clientY - a.y;
    const len = Math.hypot(dx, dy);
    // Drag past the rim and the stick follows your thumb, so it never feels stuck.
    if (len > STICK_RADIUS * 1.35) {
      const pull = (len - STICK_RADIUS * 1.35) / len;
      a.x += dx * pull;
      a.y += dy * pull;
      place(a.x, a.y);
      dx = e.clientX - a.x;
      dy = e.clientY - a.y;
    }
    const clamped = Math.min(1, Math.hypot(dx, dy) / STICK_RADIUS);
    const angle = Math.atan2(dy, dx);
    virtualInput.stickX = Math.cos(angle) * clamped;
    virtualInput.stickY = -Math.sin(angle) * clamped;
    setKnob(Math.cos(angle) * clamped * STICK_RADIUS, Math.sin(angle) * clamped * STICK_RADIUS);
  };

  const letGo = () => {
    active.current = null;
    virtualInput.stickX = 0;
    virtualInput.stickY = 0;
    setKnob(0, 0);
    base.current!.dataset.active = 'false';
    base.current!.style.left = '';
    base.current!.style.top = '';
  };
  useLetGoWhenAway(letGo);

  const onUp = (e: ReactPointerEvent) => {
    if (active.current?.id === e.pointerId) letGo();
  };

  return (
    <div
      ref={zone}
      className={styles.stickZone}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      data-testid="joystick"
    >
      <div ref={base} className={styles.stickBase} data-active="false">
        <div ref={knob} className={styles.stickKnob} />
      </div>
    </div>
  );
}

/**
 * First person: drag anywhere on the right side to look around. The buttons sit on top of it,
 * so a thumb resting on one never turns your head.
 */
function LookZone() {
  const active = useRef<{ id: number; x: number; y: number } | null>(null);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (active.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    active.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };

  const onMove = (e: ReactPointerEvent) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    virtualInput.look(e.clientX - a.x, e.clientY - a.y);
    a.x = e.clientX;
    a.y = e.clientY;
  };

  const onUp = (e: ReactPointerEvent) => {
    if (active.current?.id === e.pointerId) active.current = null;
  };
  useLetGoWhenAway(() => {
    active.current = null;
  });

  return (
    <div
      className={styles.lookZone}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      data-testid="look-zone"
    />
  );
}

/** Hold-to-interact button that shows what you're about to do and how far along it is. */
function InteractButton() {
  const prompt = useShiftStore(
    useShallow((s) => {
      const p = s.snapshot?.prompt;
      return p
        ? { kind: p.kind, verb: p.verb, enabled: p.enabled, progress: step(p.progress) }
        : null;
    }),
  );
  const ready = !!prompt?.enabled;
  const hold = useHold('interact');
  return (
    <button
      type="button"
      className={cx(styles.btn, styles.ring, styles.interact, ready && styles.ready)}
      style={{ '--fill': prompt?.progress ?? 0 } as CSSProperties}
      {...hold}
      aria-label={prompt ? `Hold to ${prompt.verb}` : 'Interact'}
      data-testid="touch-interact"
    >
      <span className={styles.icon}>{prompt ? (VERB_ICON[prompt.kind] ?? '✋') : '✋'}</span>
      <span className={styles.caption}>{prompt?.verb ?? 'Hold'}</span>
    </button>
  );
}

/** Hold to sprint. Its ring is your stamina (it shimmers while an energy drink lasts). */
function SprintButton() {
  const { fill, boost } = useShiftStore(
    useShallow((s) => ({
      fill: step((s.snapshot?.stamina ?? 0) / (s.snapshot?.staminaMax ?? 1)),
      boost: (s.snapshot?.boost ?? 0) > 0,
    })),
  );
  const hold = useHold('sprint');
  return (
    <button
      type="button"
      className={cx(styles.btn, styles.ring, styles.sprint)}
      style={{ '--fill': boost ? 1 : fill } as CSSProperties}
      data-boost={boost}
      data-empty={!boost && fill <= 0}
      {...hold}
      aria-label="Sprint"
      data-testid="touch-sprint"
    >
      <span className={styles.icon}>🏃</span>
      <span className={styles.caption}>Sprint</span>
    </button>
  );
}

function AbilityButton() {
  const ability = useShiftStore(
    useShallow((s) => {
      const a = s.snapshot?.ability;
      if (!a || a.kind !== 'active') return null;
      const active = a.active > 0;
      return {
        name: a.name,
        active,
        cooldown: Math.ceil(a.cooldown),
        fill: step(active ? a.active / a.duration : 1 - a.cooldown / a.cooldownMax),
      };
    }),
  );
  if (!ability) return null;
  const ready = ability.cooldown <= 0;
  return (
    <button
      type="button"
      className={cx(styles.btn, styles.ring, styles.small, ability.active && styles.on)}
      style={{ '--fill': ability.fill } as CSSProperties}
      disabled={!ready && !ability.active}
      onPointerDown={(e) => {
        e.preventDefault();
        virtualInput.press({ type: 'ability' });
      }}
      aria-label={ability.name}
    >
      <span className={styles.icon}>✨</span>
      {/* The ring shows the charge; words only while it's busy. */}
      {(ability.active || !ready) && (
        <span className={styles.caption}>{ability.active ? 'On' : `${ability.cooldown}s`}</span>
      )}
    </button>
  );
}

/** Gadgets you brought: tap to use. Shared by touch and mouse (keys 1-3 on a keyboard). */
export function GadgetTray({ showKeys }: { showKeys: boolean }) {
  const inventory = useShiftStore(useShallow((s) => s.snapshot?.inventory ?? {}));
  const owned = CONSUMABLES.all.filter((c) => (inventory[c.id] ?? 0) > 0);
  if (owned.length === 0) return null;
  return (
    <div className={styles.tray} data-testid="gadget-tray">
      {owned.map((c) => (
        <button
          key={c.id}
          type="button"
          className={styles.gadget}
          onPointerDown={(e) => {
            e.preventDefault();
            virtualInput.press({ type: 'use', id: c.id });
          }}
          aria-label={`Use ${c.name} (${inventory[c.id]} left)`}
          title={c.description}
        >
          <span className={styles.gadgetIcon}>{c.icon}</span>
          <span className={styles.count}>×{inventory[c.id]}</span>
          {showKeys && <span className={styles.hotkey}>{c.hotkey}</span>}
        </button>
      ))}
    </div>
  );
}

/**
 * Phone controls: floating joystick on the left, thumb buttons on the right, and in first
 * person the rest of the right side to drag your view around.
 */
export function TouchControls() {
  const firstPerson = useFirstPerson();
  return (
    <div className={styles.touch} data-testid="touch-controls">
      <Joystick />
      {firstPerson && <LookZone />}
      <div className={styles.actions}>
        <GadgetTray showKeys={false} />
        <div className={styles.cluster}>
          <AbilityButton />
          <SprintButton />
          <InteractButton />
        </div>
      </div>
    </div>
  );
}
