// The kinds on the dog's rig (models/dog.js createZombieDog), and what each is built as: quadrupeds with their own rig
// and animation, so they have no module of their own here.
import { ZTYPE } from '../../../../shared/defs.js';
import { DOG_COATS } from '../dog.js';

export const DOG_RIGS = {
  [ZTYPE.DOG]: false,
  [ZTYPE.BOSS_ALPHA]: true, // the pack's leader: a dog, built heavier and drawn bigger
  [ZTYPE.CRAWLER]: 'squirrel', // a flying squirrel, grown huge: on the dog's rig, drawn small
};

export const DOG_VARIANTS = { [ZTYPE.DOG]: DOG_COATS };
