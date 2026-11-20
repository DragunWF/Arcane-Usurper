import { GAME_STATES } from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface DioramaHUDProps {
  readonly controller: IGameController | null;
}

/**
 * Non-blocking 2D overlay for Building Block 5 Dioramas:
 * - VICTORY_DIORAMA: Floor collapse inspection + [PULL HER UP & KEEP KISSING] / [ENTER ENCORE STAGE (NG+)]
 * - ENDLESS_SAVOR: Action controls for [STOP & LAY HER BACK DOWN] / [ENTER ENCORE STAGE (NG+)]
 * - DEFEAT_DIORAMA: Forced Frost Puppet 360° inspection + [SHATTER THE FROST / RETRY STAGE]
 */
export function DioramaHUD({ controller }: DioramaHUDProps) {
  const gameState = useGameStore((s) => s.gameState);
  const encoreTier = useGameStore((s) => s.encoreTier);
  const activeRealm = useGameStore((s) => s.activeRealm);
  const bossDisplayName = useGameStore((s) => s.bossDisplayName);
  const audioMuted = useGameStore((s) => s.audioMuted);

  if (
    gameState !== GAME_STATES.VICTORY_DIORAMA &&
    gameState !== GAME_STATES.ENDLESS_SAVOR &&
    gameState !== GAME_STATES.DEFEAT_DIORAMA
  ) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Top-Right Audio Toggle for Victory & Defeat Dioramas (FinisherHUD already shows it in ENDLESS_SAVOR) */}
      {gameState !== GAME_STATES.ENDLESS_SAVOR && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            controller?.toggleAudioMute();
          }}
          className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 pointer-events-auto frost-panel rounded-full px-3.5 py-1.5 flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold tracking-[0.16em] uppercase text-sky-100 hover:border-purple-400/70 transition-colors cursor-pointer"
        >
          <span
            className={
              audioMuted
                ? 'w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_8px_#FB7185]'
                : 'w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34D399]'
            }
          />
          <span>{audioMuted ? '[M] AUDIO: OFF' : '[M] AUDIO: ON'}</span>
        </button>
      )}

      {/* VICTORY DIORAMA (100% Drained Floor Collapse) */}
      {gameState === GAME_STATES.VICTORY_DIORAMA && (
        <>
          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center px-4 w-full max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full frost-panel border-purple-400/50 mb-2">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-[0.26em] uppercase text-purple-200">
                {activeRealm === 2
                  ? 'Arcane Core Depleted • Tide Usurped'
                  : 'Arcane Core Depleted • Frost Usurped'}
              </span>
              {encoreTier > 0 && (
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-sky-500/25 border border-sky-300/40 text-sky-100">
                  NG+{encoreTier}
                </span>
              )}
            </div>
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-[0.16em] text-transparent bg-clip-text bg-gradient-to-b from-sky-50 via-purple-200 to-slate-400 drop-shadow-[0_4px_20px_rgba(168,85,247,0.45)]">
              {bossDisplayName} SUBJUGATED
            </h2>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 px-4 w-full max-w-2xl">
            <div className="flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
              <button
                type="button"
                onClick={() => controller?.pullUpForEndlessSavor()}
                className="ascend-btn px-6 py-3 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-fuchsia-100 uppercase cursor-pointer"
              >
                [PULL HER UP &amp; KEEP KISSING]
              </button>
              <button
                type="button"
                onClick={() => controller?.enterEncoreStage()}
                className="px-6 py-3 rounded-xl frost-panel border-sky-300/65 hover:border-sky-100 font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-sky-100 uppercase cursor-pointer shadow-[0_0_24px_rgba(56,189,248,0.35)] transition-all hover:scale-[1.02]"
              >
                [ENTER ENCORE STAGE (NG+)]
              </button>
              <button
                type="button"
                onClick={() => controller?.returnToSanctum()}
                className="px-6 py-3 rounded-xl frost-panel border-purple-400/65 hover:border-purple-200 font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-purple-100 uppercase cursor-pointer transition-all hover:scale-[1.02]"
              >
                [RETURN TO SANCTUM]
              </button>
            </div>
            <div className="px-3.5 py-1 rounded-full frost-panel text-[10px] sm:text-[11px] tracking-[0.16em] uppercase text-sky-200/75">
              Drag to Orbit 360&deg; &bull; Scroll to Zoom
            </div>
          </div>
        </>
      )}

      {/* ENDLESS SAVOR ACTION STRIP (Bottom-Right, paired cleanly with FinisherHUD) */}
      {gameState === GAME_STATES.ENDLESS_SAVOR && (
        <div className="absolute bottom-5 right-4 sm:right-6 flex flex-col sm:flex-row items-end sm:items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={() => controller?.layDownFromEndlessSavor()}
            className="px-4 py-2.5 rounded-xl frost-panel border-purple-300/55 hover:border-purple-200 font-display text-[10px] sm:text-xs font-bold tracking-[0.16em] text-purple-100 uppercase cursor-pointer transition-all hover:scale-[1.02]"
          >
            [STOP &amp; LAY HER BACK DOWN]
          </button>
          <button
            type="button"
            onClick={() => controller?.enterEncoreStage()}
            className="ascend-btn px-4 py-2.5 rounded-xl font-display text-[10px] sm:text-xs font-bold tracking-[0.16em] text-sky-50 uppercase cursor-pointer"
          >
            [ENTER ENCORE STAGE (NG+)]
          </button>
        </div>
      )}

      {/* FORCED FROST PUPPET DEFEAT DIORAMA (Full unobstructed 360° center viewport) */}
      {gameState === GAME_STATES.DEFEAT_DIORAMA && (
        <>
          <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center px-4 w-full max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full frost-panel border-sky-400/55 mb-2">
              <span className="w-2 h-2 rounded-full bg-sky-300 shadow-[0_0_8px_#38BDF8]" />
              <span className="text-[10px] sm:text-xs font-semibold tracking-[0.26em] uppercase text-sky-200">
                {activeRealm === 2
                  ? "Siren's Abyssal Thrall • Enthralled Beneath the Deep"
                  : 'Forced Frost Puppet • Enthralled Upon the Summit'}
              </span>
            </div>
            <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-[0.16em] text-transparent bg-clip-text bg-gradient-to-b from-sky-50 via-sky-200 to-indigo-300 drop-shadow-[0_4px_24px_rgba(56,189,248,0.5)]">
              {activeRealm === 2
                ? 'CAPTURED BY THE SIREN'
                : 'CAPTURED BY THE EMPRESS'}
            </h2>
          </div>

          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 px-4">
            <div className="flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
              <button
                type="button"
                onClick={() => controller?.retryStage()}
                className="ascend-btn px-7 py-3.5 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-sky-50 uppercase cursor-pointer"
              >
                {activeRealm === 2
                  ? '[SHATTER THE TIDE / RETRY STAGE]'
                  : '[SHATTER THE FROST / RETRY STAGE]'}
              </button>
              <button
                type="button"
                onClick={() => controller?.returnToSanctum()}
                className="px-6 py-3.5 rounded-xl frost-panel border-purple-400/65 hover:border-purple-200 font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-purple-100 uppercase cursor-pointer transition-all hover:scale-[1.02]"
              >
                [RETURN TO SANCTUM]
              </button>
            </div>
            <div className="px-3.5 py-1 rounded-full frost-panel text-[10px] sm:text-[11px] tracking-[0.16em] uppercase text-sky-200/75">
              Drag to Orbit 360&deg; &bull; Scroll to Zoom &bull; Press [R] to
              Retry
            </div>
          </div>
        </>
      )}
    </div>
  );
}
