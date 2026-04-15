# Lanefold

Lanefold is a Phaser 4 browser prototype that mixes sliding-number merges with five synchronized enemy lanes. Every move repositions the whole 5x5 grid, merged tiles strengthen the matrix, and each column fires into its matching lane before the enemy line advances.

## Stack

- Phaser 4 (`4.0.0-rc.5`)
- TypeScript
- Vite

## Run

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Production build:

```bash
npm run build
```

## GitHub Pages Deployment

This project is a fully static Vite build and can be deployed directly to GitHub Pages. The deployment workflow is defined in `.github/workflows/deploy-pages.yml` and runs automatically on pushes to `main`.

The workflow uses the current npm setup:

- `npm ci` installs dependencies from `package-lock.json`.
- `npm run build` runs TypeScript checks and Vite production build.
- Vite writes the static site to `dist`.
- `actions/upload-pages-artifact` uploads `./dist`.
- `actions/deploy-pages` publishes the artifact to GitHub Pages.

The Vite `base` option is set to `/lanefold/`, which is required for a GitHub Pages project site named `lanefold`. The deployed site will likely be served at:

```text
https://ta-yoshi02.github.io/lanefold/
```

Manual GitHub repository settings required:

- Go to `Settings -> Pages`.
- Set `Source` to `GitHub Actions`.
- Ensure repository Actions are enabled.

No repository secrets are required for this workflow. The workflow declares the required permissions directly: read repository contents, write Pages, and request an OIDC token for Pages deployment.

## Controls

- `Enter` or tap `Start Run`: begin from the title screen
- Arrow keys: shift the board
- Swipe: shift the board on touch-style input
- `Enter` on game over: restart
- `F`: toggle fullscreen

## Turn Order

Each valid move resolves in this order:

1. Shift all tiles in the chosen direction.
2. Merge equal-valued tiles into a stronger relay.
3. Tiles attack enemies in the matching lane, starting from the bottom row upward.
4. Surviving enemies advance.
5. New enemies spawn if the turn hits the current interval.
6. A fresh relay tile spawns on the board.

The run ends immediately if any enemy reaches breach progress `6`. Grid-lock loss is also enabled by default for testing.

## Tuning

All core balance values live in [src/game/config.ts](/Users/taku/workspace/lanefold/src/game/config.ts).

Key values to adjust:

- board width / height
- lane count
- initial tile count
- enemy spawn interval and burst size
- enemy advance per turn
- enemy HP base, scaling, and variance
- attack timing and row multipliers
- merge growth and scoring
- loss conditions (`loseOnLaneBreach`, `loseOnGridLock`)

## Structure

- [src/game/config.ts](/Users/taku/workspace/lanefold/src/game/config.ts): central tuning and helpers
- [src/game/core/board.ts](/Users/taku/workspace/lanefold/src/game/core/board.ts): grid movement, merges, tile spawning
- [src/game/core/enemies.ts](/Users/taku/workspace/lanefold/src/game/core/enemies.ts): lane combat, spawning, advance, pressure
- [src/game/core/resolveTurn.ts](/Users/taku/workspace/lanefold/src/game/core/resolveTurn.ts): full turn resolver
- [src/game/runtime/LanefoldRun.ts](/Users/taku/workspace/lanefold/src/game/runtime/LanefoldRun.ts): runtime state, FX timers, text snapshot hooks
- [src/game/input/InputController.ts](/Users/taku/workspace/lanefold/src/game/input/InputController.ts): keyboard + swipe handling
- [src/game/scenes/LanefoldScene.ts](/Users/taku/workspace/lanefold/src/game/scenes/LanefoldScene.ts): rendering, overlays, and HUD

## Testing Hooks

The MVP exposes:

- `window.render_game_to_text()`
- `window.advanceTime(ms)`

These are used by the Playwright verification loop for deterministic state reads.

## Visual Notes

The current build uses original procedural placeholder visuals drawn directly in Phaser. An OpenAI image-generation pass was not run in this environment because `OPENAI_API_KEY` was not set locally.

## Next Extensions

1. Special merged attack types: beam relays, splash arcs, and charge tiles that only trigger from specific rows.
2. Elite enemies and shields: armored prisms, split-on-death blobs, or shielded drones that force lane focus.
3. Between-wave upgrades: short draft choices that modify spawn control, merge economy, or lane-specific damage bonuses.
