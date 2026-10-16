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

/** The exact chance the attacker wins, over the same round model as resolveCombat. */
export function combatWinChance(
  att: { attack: number; shot: number; hits: number; damage: number },
  def: { defense: number; shot: number; hits: number; damage: number },
): number {
  const p = att.attack / (att.attack + def.defense);
  const memo = new Map<string, number>();
  const win = (ad: number, dd: number): number => {
    if (dd >= def.hits) return 1;
    if (ad >= att.hits) return 0;
    const key = `${ad},${dd}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const v = p * win(ad, dd + att.shot) + (1 - p) * win(ad + def.shot, dd);
    memo.set(key, v);
    return v;
  };
  return win(att.damage, def.damage);
}
