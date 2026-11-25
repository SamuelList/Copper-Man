import { BALANCE } from '@core/content/balance';
import { NPCS } from '@core/content/npcs';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { useInputMode } from '@state/inputMode';
import { Button, Panel } from '../components';
import { ViewSwitch } from '../components/ViewSwitch';
import { money } from '../format';
import styles from './screens.module.css';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  const { active, fired, day, cash, level } = useCareerStore();
  const canContinue = active && !fired;
  // Say it the way this player will do it: thumbs on a phone, keys at a desk.
  const touch = useInputMode((s) => s.mode === 'touch');

  return (
    <main className={[styles.screen, styles.center].join(' ')}>
      <h1 className={styles.title}>
        PROJECT
        <br />
        COPPER
      </h1>
      <p className={styles.subtitle}>
        You&apos;re school maintenance. The pay is bad, but the pipes are full of copper. Strip
        fixtures, haul scrap to your van, and don&apos;t let {NPCS.boss.name} catch you red-handed.
      </p>
      <div className={styles.actions}>
        {canContinue && (
          <Button variant="primary" onClick={() => go('shop')}>
            Continue — Day {day}, Lv {level} ({money(cash)})
          </Button>
        )}
        <Button variant={canContinue ? 'default' : 'primary'} onClick={() => go('characterSelect')}>
          New Career
        </Button>
      </div>
      <ViewSwitch />
      <Panel className={styles.how}>
        <h2>How to play</h2>
        <ul>
          <li>
            <strong>Scrap fixtures</strong> — fountains, heaters, toilets, lamps.{' '}
            {touch ? (
              <>Stand next to one and hold the ✋ button.</>
            ) : (
              <>
                Hold <strong>E</strong> next to one.
              </>
            )}{' '}
            Hallways pay more; classrooms are safer.
          </li>
          <li>
            <strong>Sell at the van.</strong> Scrap only counts once it&apos;s in the van. Your bag
            has limited room.
          </li>
          <li>
            <strong>Explore.</strong> The school starts pitch black. What you&apos;ve seen stays on
            your map; you only see people in your line of sight, so listen for footsteps.
          </li>
          <li>
            <strong>Stay out of sight.</strong> {NPCS.boss.name} only cares if you&apos;re carrying
            or scrapping, but he plans his own rounds, notices stripped fixtures, hears you sprint
            and checks hiding spots. Teachers radio him. Students snitch on scrapping; read their
            look: the hall monitor&apos;s sash, the phone zombie, the class clown&apos;s propeller.
          </li>
          <li>
            <strong>Go further as you grow.</strong> The east wing pays best but it&apos;s far from
            the van, and its technical fixtures need gear or experience (the prompt tells you what).
            Security doors need the Master Key or bolt cutters.
          </li>
          <li>
            <strong>Use the dark and the furniture.</strong> Dark rooms make you harder to spot, and
            lockers, shelves and stalls block sight. Sprinting is loud, and so are wet floors.
          </li>
          <li>
            <strong>{BALANCE.warnings.max} warnings and you&apos;re fired.</strong> Find your sleepy
            coworker to win back a heart.
          </li>
          <li>
            <strong>Spend your cash</strong> between shifts on gear and gadgets: boots, tools, bags,
            keys, gloves, disguises, radios, energy drinks, whoopee cushions and bolt cutters.
          </li>
          <li>
            <strong>Level up.</strong> Everything you do earns XP. Each level is a skill point for
            the Shadow, Hustle or Wheeler-Dealer trees.
          </li>
          <li>
            <strong>Pick your view.</strong> Watch the school from above, or go first person and
            sneak the halls through your own eyes.{' '}
            {touch ? (
              <>
                Switch any time with the button beside pause; in first person, drag the right side
                of the screen to look around.
              </>
            ) : (
              <>
                Switch any time with <strong>V</strong> (or the eye button).
              </>
            )}
          </li>
        </ul>
      </Panel>
    </main>
  );
}
