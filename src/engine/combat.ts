import type { RandomSource } from './rng';

export interface CombatResult {
  attackerWon: boolean;
  /** Total damage on the attacker after combat. */
  attackerDamage: number;
  /** Total damage on the defender after combat. */
  defenderDamage: number;
}

/** Fights rounds until one side's damage reaches its hits. No ties, no retreats. */
export function resolveCombat(
  att: { attack: number; shot: number; hits: number; damage: number },
  def: { defense: number; shot: number; hits: number; damage: number },
  rng: RandomSource,
): CombatResult {
  let ad = att.damage;
  let dd = def.damage;
  const p = att.attack / (att.attack + def.defense);
  while (ad < att.hits && dd < def.hits) {
    if (rng.next() < p) dd += att.shot;
    else ad += def.shot;
  }
  return { attackerWon: dd >= def.hits, attackerDamage: ad, defenderDamage: dd };
}
