# Lanefold MVP Plan

## Goal
Build a playable browser prototype of **Lanefold**, a 5x5 sliding-merge tactics game where merged tiles project attacks into matching enemy lanes.

## Pillars
- Keep the board readable and central.
- Make lane placement matter, not just tile growth.
- Keep turns fast and deterministic for testing.
- Use original placeholder visuals and lightweight rendering only.

## MVP Scope
1. Scaffold a Vite + TypeScript + Phaser 4 project.
2. Implement a pure state engine for:
   - 5x5 board movement
   - equal-tile merges
   - post-move lane combat
   - enemy advance and spawning
   - score, turn, pressure, and loss handling
3. Build a Phaser presentation layer with:
   - title screen
   - gameplay board + HUD
   - game over screen with restart
   - keyboard and swipe controls
4. Expose deterministic testing hooks:
   - `window.render_game_to_text()`
   - `window.advanceTime(ms)`
5. Validate each milestone in a live browser with Playwright interactive.
6. Document setup and tuning controls in `README.md`.

## Implementation Order
1. Repository scaffold, config, and progress tracking.
2. Core state modules for board, enemies, combat, and turn resolution.
3. Phaser scene and renderer modules.
4. Input, HUD, and flow screens.
5. Placeholder visual pass and balancing.
6. Browser verification loops and polish.

## Risk Notes
- Phaser 4 is still on RC builds, so the first pass will stay close to the stable Scene/GameObject APIs.
- The prototype will use deterministic turn logic and lightweight visual timers instead of heavy tween choreography.
- If image generation is unavailable locally, the MVP will fall back to procedural placeholder art while keeping hooks ready for generated assets.
