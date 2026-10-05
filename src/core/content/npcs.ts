import type { NpcDef } from '../model/types';

/** NPC stat blocks from the design board. */
export const NPCS = {
  boss: { id: 'boss', name: 'Mr. Gravy', speed: 2, awareness: 2 },
  student: { id: 'student', name: 'Student', speed: 1, awareness: 1 },
} as const satisfies Record<string, NpcDef>;

export const COWORKER = {
  name: 'Sleepy Coworker',
  flavor: [
    'Zzz… my migraines are very real…',
    "Five more minutes… the boiler's fine…",
    'Mmmf… tell Gravy I was never here…',
  ],
} as const;
