# Lanefold

Original browser puzzle-combat game.

Tech stack:
- Phaser 4
- TypeScript
- Vite

Working rules:
- Use Playwright interactive to test the game in a live browser after each meaningful gameplay/UI change.
- Keep the game fully client-side. No backend.
- Keep code modular and readable.
- Put gameplay constants in a central config file.
- Write a PLAN.md before major implementation if one does not exist.
- Log notable design and implementation decisions in `.logs/`.
- Do not copy the title, UI layout, colors, fonts, tile appearance, sound design, art style, or branding of 2048 or Last War.
- It is acceptable to inherit from the original MIT-licensed 2048 codebase conceptually, but all new UI, art, animation, progression, and combat systems must be original.
- Use original placeholder assets only unless told otherwise.
- Prefer lightweight 2D / pseudo-2.5D rendering over full 3D.
- After implementing features, run the local dev server and verify behavior with Playwright before stopping.
