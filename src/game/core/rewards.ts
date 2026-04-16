import type {
  RewardCategory,
  RewardDefinition,
  RunState,
  UtilitySlot,
} from '../types';

const rewardPools: Record<RewardCategory, RewardDefinition[]> = {
  economy: [
    {
      id: 'seeder',
      category: 'economy',
      name: 'Seeder',
      description: 'First merge each turn spawns one extra 2.',
    },
  ],
  combat: [
    {
      id: 'overcharge',
      category: 'combat',
      name: 'Overcharge',
      description: 'Each merge deals merged value / 2 to that lane immediately.',
    },
    {
      id: 'pierce',
      category: 'combat',
      name: 'Pierce',
      description: 'Overkill damage carries into the next enemy in the lane.',
    },
    {
      id: 'splash-matrix',
      category: 'combat',
      name: 'Splash Matrix',
      description: 'Tiles 32+ add 25% splash damage to adjacent lanes.',
    },
  ],
  utility: [
    {
      id: 'emergency-freeze',
      category: 'utility',
      name: 'Emergency Freeze',
      description: 'Store a one-use utility: stop enemy advance for one turn.',
    },
  ],
};

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0];
}

function cloneReward(reward: RewardDefinition): RewardDefinition {
  return { ...reward };
}

function utilitySlotForReward(reward: RewardDefinition): UtilitySlot | null {
  if (reward.id !== 'emergency-freeze') {
    return null;
  }

  return {
    id: 'emergency-freeze',
    name: reward.name,
    description: reward.description,
  };
}

export function rollRewardChoices(rng: () => number): RewardDefinition[] {
  return [
    cloneReward(pick(rewardPools.economy, rng)),
    cloneReward(pick(rewardPools.combat, rng)),
    cloneReward(pick(rewardPools.utility, rng)),
  ];
}

export function applyRewardToState(
  state: RunState,
  reward: RewardDefinition,
): RunState {
  const modifiers = { ...state.modifiers };
  let utilitySlot = state.utilitySlot;

  switch (reward.id) {
    case 'seeder':
      modifiers.seeder = true;
      break;
    case 'overcharge':
      modifiers.overcharge = true;
      break;
    case 'pierce':
      modifiers.pierce = true;
      break;
    case 'splash-matrix':
      modifiers.splashMatrix = true;
      break;
    case 'emergency-freeze':
      utilitySlot = utilitySlotForReward(reward);
      break;
  }

  return {
    ...state,
    modifiers,
    utilitySlot,
  };
}
