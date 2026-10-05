import { createRegistry } from '../../content/registry';
import { SCHOOL_LEVEL } from './school';

/** All playable maps. Add a level by creating a module next to school.ts and listing it here. */
export const LEVELS = createRegistry('level', [SCHOOL_LEVEL]);

export const DEFAULT_LEVEL_ID = SCHOOL_LEVEL.id;
