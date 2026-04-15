import type { LanefoldRun } from './LanefoldRun';

declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
  }
}

let activeRun: LanefoldRun | null = null;

function installDefaults(): void {
  window.render_game_to_text = () =>
    JSON.stringify({
      mode: 'boot',
      note: 'Lanefold runtime not bound yet.',
    });
  window.advanceTime = (_ms: number) => {};
}

export function bindTestingRun(run: LanefoldRun | null): void {
  activeRun = run;

  if (!activeRun) {
    installDefaults();
    return;
  }

  window.render_game_to_text = () => activeRun?.renderGameToText() ?? '{}';
  window.advanceTime = (ms: number) => {
    activeRun?.advanceTime(ms);
  };
}

if (typeof window !== 'undefined') {
  installDefaults();
}
