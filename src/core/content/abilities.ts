import type { AbilityDef } from '../model/types';
import { createRegistry } from './registry';

/**
 * Abilities are strategy objects: the session asks `conceals(signal, active)` instead of
 * special-casing characters, so new abilities plug in without touching the simulation.
 */
export const ABILITIES = createRegistry<AbilityDef>('ability', [
  {
    id: 'act-like-a-student',
    name: 'Act Like a Student',
    description: 'Blend into the crowd: carrying scrap is invisible to everyone while active.',
    kind: 'active',
    durationSeconds: 6,
    cooldownSeconds: 30,
    conceals: (signal, active) => active && signal === 'carrying',
  },
  {
    id: 'act-like-youre-working',
    name: "Act Like You're Working",
    description: 'Decades on the job: scrapping never looks suspicious. Carrying still does.',
    kind: 'passive',
    durationSeconds: 0,
    cooldownSeconds: 0,
    conceals: (signal) => signal === 'scrapping',
  },
]);
