Original prompt: Build an original browser game prototype in this repository for a game called Lanefold. Use Phaser 4, TypeScript, Vite, and Playwright interactive for browser verification and iteration. Create a playable MVP that combines sliding number merges with lane-based enemy combat on a 5x5 board, with title/game over screens, restart, score, swipe + keyboard input, centralized config, PLAN.md, README.md, and notable implementation notes in .logs/. After the MVP works, propose 3 next-step extensions: special merged attack types, elite enemies or shields, and between-wave upgrade choices.

## Progress Log

- 2026-04-15: Repository audit complete. Repo started effectively empty except for `AGENTS.md`.
- 2026-04-15: Confirmed `npx` is present for Playwright wrapper usage.
- 2026-04-15: Verified current Phaser 4 install target from official sources. Plan is to pin the npm `beta` tag (`4.0.0-rc.5` at time of implementation) for reproducible setup.
- 2026-04-15: Writing scaffold, planning docs, and centralized module layout before dependency install.
- 2026-04-15: Installed Vite, TypeScript, and Phaser 4 RC. Created modular simulation and rendering layers.
- 2026-04-15: Implemented title flow, gameplay board, merges, lane combat, enemy spawning/advance, game-over flow, restart, keyboard input, swipe input, fullscreen toggle, and testing hooks.
- 2026-04-15: Verified title screen, gameplay, game over, restart, and swipe interactions with Playwright. Used direct page screenshots because the bundled client's canvas capture path produced black PNGs under the current browser/WebGL setup, while page screenshots rendered correctly.
- 2026-04-15: Fixed the only browser-console issue from verification by adding an original SVG favicon.
- 2026-04-15: Checked OpenAI docs for current Image API model support and confirmed image generation remained optional here; no live asset generation was attempted because `OPENAI_API_KEY` is unset locally.
- 2026-04-15: Refined enemy/lane UI with compact discrete threat tracks above the board, explicit enemy `HP` and `T-` turns-to-breach labels, warning/critical lane colors, a stronger breach edge, smaller board cells, quieter move summary text, and clearer game-over lane cause.
- 2026-04-15: Changed combat resolution from per-tile row-weighted strikes to one summed column attack per lane. Combat events now report lane attack total plus enemy HP before/after damage.
- 2026-04-15: Started pacing adjustment to make enemies breach at progress 6 instead of 5, with a 6-step threat track and a slightly smaller/lower board layout. HP tuning and Tier behavior intentionally left unchanged.
- 2026-04-15: Verified the pacing adjustment in browser. The required Playwright client still produced black WebGL canvas PNGs, so supplemental full-page Playwright screenshots were used for visual inspection. State output confirmed new enemies at `T-6`, lane breach at progress `6`, no console errors, and readable 6-step tracks after HUD spacing tweaks.
- 2026-04-16: Added a tier loop with configurable 5-turn normal spawn pattern, 1 warning turn, elite encounters, every-3rd-tier boss encounters, post-encounter reward choice screens, persistent combat/economy modifiers, and a single stored utility slot.
- 2026-04-16: Boss encounters now replace remaining normal enemies by absorbing their total remaining HP into shared boss HP across the center 3 lanes. Edge lanes contribute 50% support damage to the boss and the UI labels those lanes as `SUP`.
- 2026-04-16: Implemented initial reward pool: Seeder, Overcharge, Pierce, Splash Matrix, and Emergency Freeze. Reward categories remain data-driven via `src/game/core/rewards.ts`.
- 2026-04-16: Verified the progression update in a live browser with Playwright. The required bundled client confirmed normal gameplay state and elite reachability; a second Playwright pass used controlled in-browser state setup to deterministically verify tier-3 boss absorption, side-lane support damage, reward selection, utility storage, and freeze activation without console errors.
- 2026-04-16: Added deterministic browser checks for immediate reward effects as well: Seeder produced an extra spawned `2` after the first merge of a turn, and Pierce carried an 8-damage lane attack through a 3-HP front enemy into the next 10-HP enemy for 5 remaining HP.
- 2026-04-30: Retuned enemy HP pacing so HP scales from current Tier plus local normal-phase turn instead of cumulative run turn. Elite and boss multipliers were reduced, and bosses now absorb a configurable fraction of remaining enemy HP. `npm run build` passes after the balance change.
- 2026-04-30: Verified the HP retune in a live browser with the bundled Playwright client and a supplemental full-page Playwright screenshot because the bundled canvas capture still renders black PNGs in this WebGL setup. State output showed Tier 1 normal enemy HP in the 7-11 band and elite HP around 20, with no console errors.

## TODO

- Optional polish pass: add bespoke move tweens and stronger enemy hit reactions.
- Balance follow-up: run organic Tier 3+ playtests after the HP pacing retune and adjust `hpScalePerTier`, `bossHpMultiplier`, and `bossAbsorbedHpFactor` together if bosses feel too soft or too slow.
- Balance follow-up: if Splash Matrix and Pierce stack too efficiently on later runs, lane-density pressure may need a separate cap or enemy-side counterplay.
- Optional asset pass: if `OPENAI_API_KEY` becomes available, generate concept textures or enemy emblems under `output/imagegen/`.
- No new blockers from the tier-loop pass. Remaining work is balance and presentation polish, not architecture.
