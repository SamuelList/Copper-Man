import { BALANCE } from '@core/content/balance';
import { NPCS } from '@core/content/npcs';
import { useAppStore } from '@state/appStore';
import { useCareerStore } from '@state/careerStore';
import { Button, Panel } from '../components';
import { money } from '../format';
import styles from './screens.module.css';

export function TitleScreen() {
  const go = useAppStore((s) => s.go);
  const { active, fired, day, cash, level } = useCareerStore();
  const canContinue = active && !fired;

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
      <Panel className={styles.how}>
        <h2>How to play</h2>
        <ul>
          <li>
            <strong>Scrap fixtures</strong> — fountains, heaters, toilets, lamps. Hold{' '}
            <strong>E</strong> (or the hand button on a phone) next to one. Hallways pay more;
            classrooms are safer.
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
            <strong>Use the dark and the furniture.</strong> Dark rooms make you harder to spot.
            Crouch (<strong>C</strong>) behind desks, tables and fixtures.
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
        </ul>
      </Panel>
    </main>
  );
}
