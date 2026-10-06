import { METAL_IDS, METALS } from '@core/content/metals';
import { NPCS } from '@core/content/npcs';
import { bagFree, bagTotal } from '@core/systems/bag';
import { useShiftStore, type Toast } from '@state/shiftStore';
import { useEffect, type CSSProperties } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Kbd } from '../components';
import { clock, css, money, units } from '../format';
import styles from './hud.module.css';

const LOW_TIME = 30;

function TimerCard() {
  const { timeLeft, day, roomName } = useShiftStore(
    useShallow((s) => ({
      timeLeft: Math.ceil(s.snapshot?.timeLeft ?? 0),
      day: s.snapshot?.day ?? 1,
      roomName: s.snapshot?.roomName ?? '',
    })),
  );
  return (
    <div className={styles.card}>
      <div className={styles.label}>Day {day} · Shift</div>
      <div
        className={[styles.timer, timeLeft <= LOW_TIME && styles.timerLow]
          .filter(Boolean)
          .join(' ')}
        data-testid="shift-timer"
      >
        {clock(timeLeft)}
      </div>
      <div className={styles.label} style={{ marginTop: 4 }}>
        📍 {roomName}
      </div>
    </div>
  );
}

function StatusCard() {
  const { earned, warnings, max } = useShiftStore(
    useShallow((s) => ({
      earned: s.snapshot?.earned ?? 0,
      warnings: s.snapshot?.warnings ?? 0,
      max: s.snapshot?.maxWarnings ?? 3,
    })),
  );
  return (
    <div className={styles.card} style={{ textAlign: 'right' }}>
      <div className={styles.label}>Sold this shift</div>
      <div className={styles.cash} data-testid="shift-earned">
        {money(earned)}
      </div>
      <div className={styles.hearts} aria-label={`${max - warnings} of ${max} hearts left`}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={i < max - warnings ? styles.heart : styles.heartLost}>
            ♥
          </span>
        ))}
      </div>
    </div>
  );
}

function BagCard() {
  // Select primitives so the bag only re-renders when its contents actually change.
  const flat = useShiftStore(
    useShallow((s) => {
      const b = s.snapshot?.bag;
      return b ? { capacity: b.capacity, ...b.contents } : null;
    }),
  );
  if (!flat) return null;
  const { capacity, ...contents } = flat;
  const bag = { capacity, contents };
  const total = bagTotal(bag);
  return (
    <div className={[styles.card, styles.bag].join(' ')} data-testid="bag">
      <div className={styles.label}>Scrap bag</div>
      <div className={styles.bagBar}>
        {METAL_IDS.map((m) =>
          bag.contents[m] > 0 ? (
            <div
              key={m}
              className={styles.bagSeg}
              title={METALS[m].name}
              style={{
                width: `${(bag.contents[m] / bag.capacity) * 100}%`,
                background: css(METALS[m].color),
              }}
            />
          ) : null,
        )}
      </div>
      <div className={styles.bagText}>
        <span>
          Holding {units(total)} / {units(bag.capacity)}
        </span>
        <span>Left {units(bagFree(bag))}</span>
      </div>
    </div>
  );
}

function AbilityCard() {
  const { ability, stamina, staminaMax } = useShiftStore(
    useShallow((s) => ({
      ability: s.snapshot?.ability ?? null,
      stamina: s.snapshot?.stamina ?? 0,
      staminaMax: s.snapshot?.staminaMax ?? 1,
    })),
  );
  let abilityLine = null;
  if (ability) {
    const active = ability.active > 0;
    const ready = ability.kind === 'active' && ability.cooldown <= 0;
    const fill =
      ability.kind === 'passive'
        ? 1
        : active
          ? ability.active / ability.duration
          : 1 - ability.cooldown / ability.cooldownMax;
    abilityLine = (
      <div>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <span>
            {ability.kind === 'active' ? (
              <Kbd>Q</Kbd>
            ) : (
              <span className={styles.label}>Passive</span>
            )}{' '}
            {ability.name}
          </span>
          <span className={styles.label}>
            {ability.kind === 'passive'
              ? 'always on'
              : active
                ? 'ACTIVE'
                : ready
                  ? 'ready'
                  : `${Math.ceil(ability.cooldown)}s`}
          </span>
        </div>
        <div className={styles.meter}>
          <div
            className={styles.meterFill}
            style={{ width: `${fill * 100}%`, background: active ? 'var(--good)' : undefined }}
          />
        </div>
      </div>
    );
  }
  return (
    <div className={[styles.card, styles.ability].join(' ')}>
      {abilityLine}
      <div style={{ marginTop: abilityLine ? 8 : 0 }}>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <span>
            <Kbd>Shift</Kbd> Sprint
          </span>
        </div>
        <div className={styles.meter}>
          <div
            className={styles.meterFill}
            style={{ width: `${(stamina / staminaMax) * 100}%`, background: 'var(--warn)' }}
          />
        </div>
      </div>
    </div>
  );
}

function DetectionCard() {
  const { detection, bossMode, suspicious, escalation, grace } = useShiftStore(
    useShallow((s) => ({
      detection: Math.round((s.snapshot?.detection ?? 0) * 20) / 20,
      bossMode: s.snapshot?.bossMode ?? 'patrol',
      suspicious: s.snapshot?.suspicious ?? false,
      escalation: s.snapshot?.escalation ?? 0,
      grace: (s.snapshot?.grace ?? 0) > 0,
    })),
  );
  const spotted = bossMode === 'chase';
  const label = spotted
    ? 'SPOTTED!'
    : detection > 0
      ? 'Someone noticed…'
      : suspicious
        ? 'Looking suspicious'
        : 'Blending in';
  const color = spotted ? 'var(--bad)' : detection > 0 ? 'var(--warn)' : 'var(--good)';
  return (
    <>
      <div
        className={[styles.card, styles.detection, spotted && styles.spotted]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={styles.eye}>{spotted ? '🚨' : '👁'}</span>
        <span>{label}</span>
        <span className={styles.detectBar}>
          <span
            className={styles.detectFill}
            style={{ display: 'block', width: `${detection * 100}%`, background: color }}
          />
        </span>
      </div>
      {grace && <span className={styles.badge}>Escorted back to the van…</span>}
      {!grace && suspicious && !spotted && (
        <span className={styles.badge}>
          Carrying or scrapping — don&apos;t let {NPCS.boss.name} see you
        </span>
      )}
      {escalation > 0 && (
        <span className={styles.badge}>
          {NPCS.boss.name} is faster (level {escalation})
        </span>
      )}
    </>
  );
}

function PromptCard() {
  const prompt = useShiftStore(
    useShallow((s) => {
      const p = s.snapshot?.prompt;
      return p ? { ...p, progress: Math.round(p.progress * 50) / 50 } : null;
    }),
  );
  if (!prompt) return null;
  return (
    <div className={[styles.card, styles.prompt].join(' ')} data-testid="interact-prompt">
      {prompt.enabled ? (
        <span>
          Hold <Kbd>E</Kbd> {prompt.verb} — {prompt.label}
        </span>
      ) : (
        <span className={styles.promptDisabled}>
          {prompt.label}: {prompt.reason}
        </span>
      )}
      {prompt.enabled && (
        <div className={styles.progress}>
          <div className={styles.progressFill} style={{ width: `${prompt.progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

const TOAST_MS = 3500;

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useShiftStore((s) => s.dismissToast);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast.id, dismiss]);
  return (
    <div className={styles.toast} data-tone={toast.tone} role="status">
      {toast.text}
    </div>
  );
}

function Toasts() {
  const toasts = useShiftStore((s) => s.toasts);
  return (
    <div className={styles.toasts} aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

/** How visible you are: the light where you stand, and whether you're crouched. */
function VisibilityCard() {
  const { light, crouching } = useShiftStore(
    useShallow((s) => ({
      light: Math.round((s.snapshot?.light ?? 1) * 20) / 20,
      crouching: s.snapshot?.crouching ?? false,
    })),
  );
  const label = light >= 0.75 ? 'Bright' : light >= 0.45 ? 'Dim' : 'Dark';
  const hint = light >= 0.75 ? 'easy to spot' : light >= 0.45 ? 'harder to spot' : 'hard to spot';
  return (
    <div className={[styles.card, styles.visibility].join(' ')} data-testid="visibility">
      <span className={styles.lightGem} style={{ '--light': light } as CSSProperties} aria-hidden />
      <span>
        <strong>{label}</strong> <span className={styles.label}>{hint}</span>
        <br />
        <span className={styles.label}>
          {crouching ? 'Crouching · hidden behind low cover' : 'Standing'} · <Kbd>C</Kbd>
        </span>
      </span>
    </div>
  );
}

function Controls() {
  return (
    <div className={styles.controls}>
      <span>
        <Kbd>WASD</Kbd> move
      </span>
      <span>
        <Kbd>E</Kbd> hold to interact
      </span>
      <span>
        <Kbd>C</Kbd> crouch
      </span>
      <span>
        <Kbd>Q</Kbd> ability
      </span>
      <span>
        <Kbd>Wheel</Kbd> zoom
      </span>
      <span>
        <Kbd>Esc</Kbd> pause
      </span>
    </div>
  );
}

function EndBanner() {
  const result = useShiftStore((s) => s.result);
  if (!result) return null;
  const title = result.fired
    ? "YOU'RE FIRED!"
    : result.endedBy === 'clockOut'
      ? 'CLOCKED OUT'
      : 'SHIFT OVER';
  return (
    <div className={styles.banner} data-testid="end-banner">
      <div>
        <div
          className={styles.bannerText}
          style={{ color: result.fired ? 'var(--bad)' : 'var(--copper-bright)' }}
        >
          {title}
        </div>
        <div className={styles.bannerSub}>
          {result.fired
            ? `${NPCS.boss.name} has had enough.`
            : `You sold ${money(result.earned)} of scrap today.`}
        </div>
      </div>
    </div>
  );
}

/** HUD overlay. Each card subscribes to just the slice it renders to keep re-renders cheap. */
export function Hud() {
  return (
    <div className={styles.hud} data-testid="hud">
      <div className={styles.topLeft}>
        <TimerCard />
      </div>
      <div className={styles.topCenter}>
        <DetectionCard />
      </div>
      <div className={styles.topRight}>
        <StatusCard />
      </div>
      <Toasts />
      <div className={styles.bottomLeft}>
        <BagCard />
        <Controls />
      </div>
      <div className={styles.bottomCenter}>
        <PromptCard />
      </div>
      <div className={styles.bottomRight}>
        <VisibilityCard />
        <AbilityCard />
      </div>
      <EndBanner />
    </div>
  );
}
