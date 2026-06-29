# De-AI Theme Pass

## Context

The prototype's previous pop UI pass still read like a generic AI-generated
neon arcade screen: saturated blue gradients, abstract glowing strips, and
floating panels without a concrete place or object language.

## Decision

- Shift the theme to a bright parcel-yard course: sky, hills, depot gate,
  paper-colored lane tracks, wood posts, and stacked parcel tiles.
- Borrow only high-level readability lessons from platform games and mobile
  puzzle games: clear foreground/background separation, physical lane
  landmarks, strong danger colors, and quick reward-card scanning.
- Avoid copying recognizable Mario layout, art, tile shapes, fonts, colors,
  characters, UI, or branding. The game remains Lanefold's lane-combat puzzle.
- Keep assets procedural and client-side for this pass.

## Implementation Notes

- `LANEFOLD_CONFIG.visuals` now uses warmer parcel-yard colors instead of the
  previous neon blue/cyan/pink set.
- `LanefoldScene` now paints a concrete environment in Phaser: sky band, hills,
  lane tracks, depot gate, parcel-like board slots, earth-toned enemy cards,
  and depot-themed title copy.
- CSS page background now matches the in-canvas sky/yard palette so the whole
  browser view reads as one setting.
