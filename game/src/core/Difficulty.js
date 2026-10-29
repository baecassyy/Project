// Difficulty tuning. Hard roughly doubles the challenge: hits hurt twice as much,
// enemies are tougher and act faster, shots fly faster and the parry window is tighter.
import { Store } from './Storage.js';

const LEVELS = {
  normal: { damage: 1, enemyHp: 1, bossHp: 1, enemySpeed: 1, bossSpeed: 1, projectileSpeed: 1, parryWindow: 0.22, hurtInvuln: 1.0 },
  hard: { damage: 2, enemyHp: 1.5, bossHp: 1.5, enemySpeed: 1.25, bossSpeed: 1.3, projectileSpeed: 1.25, parryWindow: 0.17, hurtInvuln: 0.8 }
};

export function difficulty() {
  return LEVELS[Store.settings.difficulty] || LEVELS.hard;
}
