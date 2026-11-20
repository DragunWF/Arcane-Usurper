import { GAME_STATES } from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface TitleOverlayProps {
  readonly controller: IGameController | null;
}

/**
 * Transparent floating Title Overlay rendered over the live orbiting 3D Obsidian Spire Sanctum.
 * Zero opaque backdrop so the Mage Tower scenery remains fully visible.
 */
export function TitleOverlay({ controller }: TitleOverlayProps) {
  const gameState = useGameStore((s) => s.gameState);
  const marinaDefeated = useGameStore((s) => s.marinaDefeated);

  if (gameState !== GAME_STATES.TITLE) return null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-between py-10 px-6 sm:py-14 pointer-events-none transition-opacity duration-500">
      <div className="text-center animate-float-slow mt-2 sm:mt-4">
        <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full frost-panel mb-4 border-purple-400/45">
          <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_10px_#A855F7]" />
          <span className="text-[11px] sm:text-xs font-semibold tracking-[0.28em] uppercase text-purple-200">
            Obsidian Spire Sanctum
          </span>
          <span className="w-2 h-2 rounded-full bg-sky-400 shadow-[0_0_10px_#38BDF8]" />
        </div>
        <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-[0.16em] text-transparent bg-clip-text bg-gradient-to-b from-sky-50 via-purple-200 to-purple-500 drop-shadow-[0_6px_30px_rgba(139,92,246,0.55)]">
          ARCANE USURPER
        </h1>
        <p className="mt-2.5 text-xs sm:text-sm tracking-[0.24em] uppercase text-sky-200/85 font-medium">
          {marinaDefeated
            ? 'Sovereign Frost Usurped • Enter the Sanctum'
            : 'Cel-Shaded Arcane Action & Boss-Rush Sanctum'}
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 mb-4 sm:mb-8 pointer-events-auto">
        <button
          type="button"
          onClick={() => controller?.enterSanctum()}
          className="ascend-btn px-9 sm:px-12 py-4 rounded-xl font-display text-sm sm:text-base font-bold tracking-[0.24em] text-sky-50 uppercase cursor-pointer"
        >
          [ENTER SANCTUM]
        </button>
        <p className="text-[11px] sm:text-xs tracking-[0.16em] text-sky-100/75 text-center max-w-md">
          Press <span className="text-purple-300 font-semibold">ENTER</span> or
          click to awaken in your Mage Tower &bull;{' '}
          <span className="text-sky-300 font-semibold">WASD</span> Walk &bull;{' '}
          <span className="text-purple-300 font-semibold">E</span> Portals
        </p>
      </div>
    </div>
  );
}
