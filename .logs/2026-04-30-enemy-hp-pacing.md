# Enemy HP Pacing Retune

## Context

Late-stage enemies felt inflated because HP was based on cumulative turn count.
After the tier loop was added, that meant normal enemies, elites, and bosses all
kept gaining HP simply because the run had lasted longer.

## Decision

- Normal enemy HP now scales from the current tier and the local normal-phase
  turn, not from total run turn.
- Elite HP uses the tier budget with a lower multiplier.
- Boss HP uses the tier budget plus a configurable fraction of absorbed enemy
  HP, instead of multiplying cumulative turn growth and adding all absorbed HP.

This keeps pressure increasing between stages while avoiding a linear runaway
that outpaces the board's mostly discrete 2/4/8 attack growth.
