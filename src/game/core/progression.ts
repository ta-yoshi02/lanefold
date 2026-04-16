import { LANEFOLD_CONFIG } from '../config';
import type { EncounterType, RunModifiers } from '../types';

export function createInitialModifiers(): RunModifiers {
  return {
    seeder: false,
    overcharge: false,
    pierce: false,
    splashMatrix: false,
  };
}

export function normalTurnCount(): number {
  return LANEFOLD_CONFIG.progression.normalSpawnPattern.length;
}

export function normalSpawnCountForPhaseTurn(phaseTurn: number): number {
  const pattern = LANEFOLD_CONFIG.progression.normalSpawnPattern;
  return pattern[phaseTurn] ?? pattern[pattern.length - 1] ?? 0;
}

export function encounterTypeForTier(tier: number): EncounterType {
  return tier % LANEFOLD_CONFIG.progression.bossEveryNTiers === 0
    ? 'boss'
    : 'elite';
}
