# Pop UI Pass

## Context

The existing prototype read as a dark tactical interface. The next visual pass
should make the game feel more approachable and arcade-like without copying the
layout, colors, tile treatment, or brand feel of 2048 or Last War.

## Decision

- Move the main palette toward saturated blue, cyan, yellow, coral, pink, and
  green accents while preserving enough dark blue contrast for combat
  readability.
- Treat tiles as bright relay blocks and enemies as small colorful lane pieces,
  not as flat military-style cards.
- Keep HUD information compact, but frame it with lightweight sticker-like
  badges so the screen reads less like a debug panel.
- Avoid introducing external assets for this pass; the prototype remains fully
  client-side and procedurally drawn in Phaser.
