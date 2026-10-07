import type { NpcDef, PersonalityDef, TeacherDef } from '../model/types';
import { createRegistry } from './registry';

/** NPC stat blocks from the design board. */
export const NPCS = {
  boss: { id: 'boss', name: 'Mr. Gravy', speed: 2, awareness: 2 },
  student: { id: 'student', name: 'Student', speed: 1, awareness: 1 },
} as const satisfies Record<string, NpcDef>;

/** The head custodian (see BALANCE.custodian and ai/custodianBrain). */
export const CUSTODIAN = { name: 'Earl', title: 'Head Custodian' } as const;

export const COWORKER = {
  name: 'Sleepy Coworker',
  flavor: [
    'Zzz… my migraines are very real…',
    "Five more minutes… the boiler's fine…",
    'Mmmf… tell Gravy I was never here…',
  ],
} as const;

/** Student personalities. Each student rolls one per shift; learn to read their look. */
export const PERSONALITIES = createRegistry<PersonalityDef>('personality', [
  {
    id: 'regular',
    name: 'Student',
    blurb: 'Wanders the classroom. Snitches if they watch you scrap.',
    weight: 3,
    sight: { rangeMult: 1, fovMult: 1, fillMult: 1 },
    snitchesOnCarrying: false,
    snitchChance: 1,
    tellsTeachers: false,
    wander: 'room',
    speedMult: 1,
    idleSeconds: { min: 1.5, max: 4 },
    look: 'plain',
  },
  {
    id: 'hall-monitor',
    name: 'Hall Monitor',
    blurb: 'Orange sash, eagle eyes. Patrols past the door and reports a full bag too.',
    weight: 1.2,
    sight: { rangeMult: 1.3, fovMult: 1.15, fillMult: 1.6 },
    snitchesOnCarrying: true,
    snitchChance: 1,
    tellsTeachers: false,
    wander: 'roam',
    speedMult: 1.1,
    idleSeconds: { min: 1, max: 2.5 },
    look: 'sash',
  },
  {
    id: 'phone',
    name: 'Phone Zombie',
    blurb: 'Glued to a phone. Barely looks up.',
    weight: 1.5,
    sight: { rangeMult: 0.55, fovMult: 0.6, fillMult: 0.45 },
    snitchesOnCarrying: false,
    snitchChance: 1,
    tellsTeachers: false,
    wander: 'stay',
    speedMult: 0.8,
    idleSeconds: { min: 4, max: 8 },
    look: 'phone',
  },
  {
    id: 'class-clown',
    name: 'Class Clown',
    blurb: 'Bounces around the halls. Often just laughs at you instead of telling.',
    weight: 1,
    sight: { rangeMult: 1, fovMult: 1, fillMult: 0.9 },
    snitchesOnCarrying: false,
    snitchChance: 0.4,
    tellsTeachers: false,
    wander: 'roam',
    speedMult: 1.4,
    idleSeconds: { min: 0.6, max: 1.8 },
    look: 'propeller',
  },
  {
    id: 'teachers-pet',
    name: "Teacher's Pet",
    blurb: 'Glasses and a sweater vest. Tells the boss AND every teacher nearby.',
    weight: 1,
    sight: { rangeMult: 1.1, fovMult: 1, fillMult: 1.25 },
    snitchesOnCarrying: true,
    snitchChance: 1,
    tellsTeachers: true,
    wander: 'room',
    speedMult: 1,
    idleSeconds: { min: 2, max: 4 },
    look: 'glasses',
  },
  {
    id: 'sleepy',
    name: 'Sleepyhead',
    blurb: 'Dozes at their desk. Blind while asleep, groggy when awake.',
    weight: 1,
    sight: { rangeMult: 0.7, fovMult: 0.7, fillMult: 0.6 },
    snitchesOnCarrying: false,
    snitchChance: 1,
    tellsTeachers: false,
    wander: 'stay',
    speedMult: 0.8,
    idleSeconds: { min: 6, max: 10 },
    awakeFraction: 0.35,
    look: 'sleepy',
  },
]);

/** Teachers, assigned to the map's teacher spawns in order. */
export const TEACHERS = createRegistry<TeacherDef>('teacher', [
  {
    id: 'ms-pruitt',
    name: 'Ms. Pruitt',
    strictness: 1.15,
    speedMult: 0.95,
    outfit: { shirt: 0x8e24aa, pants: 0x37474f, hair: 0xb0b0b0, glasses: true },
  },
  {
    id: 'mr-delgado',
    name: 'Mr. Delgado',
    strictness: 1,
    speedMult: 1,
    outfit: { shirt: 0xf5f5f0, pants: 0x3e4a59, hair: 0x212121, tie: 0x2e7d32 },
  },
  {
    id: 'coach-bix',
    name: 'Coach Bix',
    strictness: 0.9,
    speedMult: 1.25,
    outfit: { shirt: 0xc62828, pants: 0xc62828, cap: 0x1a237e },
  },
  {
    id: 'mrs-okafor',
    name: 'Mrs. Okafor',
    strictness: 1.05,
    speedMult: 1,
    outfit: { shirt: 0xef6c00, pants: 0x4e342e, hair: 0x3e2723 },
  },
  {
    id: 'mr-lund',
    name: 'Mr. Lund',
    strictness: 0.95,
    speedMult: 0.9,
    outfit: { shirt: 0x1565c0, pants: 0x5d4037, bald: true, glasses: true },
  },
  {
    id: 'ms-tran',
    name: 'Ms. Tran',
    strictness: 1.1,
    speedMult: 1.05,
    outfit: { shirt: 0x00897b, pants: 0x263238, hair: 0x1b1b1b },
  },
]);
