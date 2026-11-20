import { GAME_STATES, PALETTE } from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface PauseMenuProps {
  readonly controller: IGameController | null;
}

/**
 * Frosted-obsidian Pause Menu modal rendered whenever `isPaused === true`.
 * Features independent Music & SFX volume sliders (with SFX preview chime on release),
 * Resume ([P]), and Restart Stage actions. Zero Three.js imports.
 */
export function PauseMenu({ controller }: PauseMenuProps) {
  const gameState = useGameStore((s) => s.gameState);
  const isPaused = useGameStore((s) => s.isPaused);
  const musicVolume = useGameStore((s) => s.musicVolume);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const encoreTier = useGameStore((s) => s.encoreTier);
  const activeRealm = useGameStore((s) => s.activeRealm);
  const hasReachedSummit = useGameStore((s) => s.hasReachedSummit);
  const setMusicVolumeStore = useGameStore((s) => s.setMusicVolume);
  const setSfxVolumeStore = useGameStore((s) => s.setSfxVolume);

  if (!isPaused) return null;

  const musicPct = Math.round(musicVolume * 100);
  const sfxPct = Math.round(sfxVolume * 100);

  const handleMusicChange = (value: number) => {
    const normalized = Math.max(0, Math.min(1, value / 100));
    setMusicVolumeStore(normalized);
    controller?.setMusicVolume(normalized);
  };

  const handleSfxChange = (value: number) => {
    const normalized = Math.max(0, Math.min(1, value / 100));
    setSfxVolumeStore(normalized);
    controller?.setSfxVolume(normalized);
  };

  const handleSfxPreview = () => {
    controller?.playSfxPreview();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
      style={{
        backgroundColor: PALETTE.rgba.pauseBackdrop,
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 sm:p-7 border"
        style={{
          background: `linear-gradient(160deg, ${PALETTE.hex.abyssalCloak}F2 0%, ${PALETTE.hex.shadowSlate}EB 100%)`,
          borderColor: PALETTE.hex.amethystTrim,
          boxShadow: PALETTE.rgba.pauseModalShadow,
        }}
      >
        {/* Header Badge & Title */}
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border mb-2.5"
            style={{
              backgroundColor: PALETTE.hex.abyssalCloak,
              borderColor: PALETTE.hex.frostRunes,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: PALETTE.hex.glowViolet,
                boxShadow: `0 0 8px ${PALETTE.hex.glowViolet}`,
              }}
            />
            <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.24em] uppercase text-sky-200">
              {gameState === GAME_STATES.LOBBY
                ? encoreTier > 0
                  ? `Obsidian Spire Sanctum • Encore NG+${encoreTier}`
                  : 'Obsidian Spire Sanctum • Temporal Stasis'
                : gameState === GAME_STATES.CHAMBER_COMBAT
                  ? activeRealm === 2
                    ? encoreTier > 0
                      ? `Sunken Aqueduct • Encore NG+${encoreTier}`
                      : 'Sunken Aqueduct • Temporal Stasis'
                    : encoreTier > 0
                      ? `Royal Ice Chambers • Encore NG+${encoreTier}`
                      : 'Royal Ice Chambers • Temporal Stasis'
                  : activeRealm === 2
                    ? encoreTier > 0
                      ? `Pearl Amphitheater • Encore NG+${encoreTier}`
                      : 'Pearl Amphitheater • Temporal Stasis'
                    : encoreTier > 0
                      ? `Glacial Spire Summit • Encore NG+${encoreTier}`
                      : 'Glacial Spire Summit • Temporal Stasis'}
            </span>
          </div>

          <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-[0.18em] uppercase text-sky-50 drop-shadow-[0_0_16px_rgba(139,92,246,0.55)]">
            GAME PAUSED
          </h2>
          <p className="mt-1 text-[11px] tracking-[0.16em] uppercase text-sky-300/75">
            Adjust Arcane Resonance or Resume Duel
          </p>
        </div>

        {/* Volume Sliders Section */}
        <div
          className="rounded-xl p-4 mb-6 border space-y-4"
          style={{
            backgroundColor: `${PALETTE.hex.abyssalCloak}CC`,
            borderColor: `${PALETTE.hex.frostRunes}40`,
          }}
        >
          {/* Music Volume Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold tracking-[0.16em] uppercase mb-2">
              <span className="text-purple-200 flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: PALETTE.hex.amethystTrim }}
                />
                Music Volume
              </span>
              <span className="font-mono text-sky-100">{musicPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={musicPct}
              aria-label="Music Volume"
              onChange={(e) => handleMusicChange(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-500 bg-zinc-800 border border-purple-500/35"
            />
          </div>

          {/* SFX Volume Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold tracking-[0.16em] uppercase mb-2">
              <span className="text-sky-200 flex items-center gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: PALETTE.hex.frostRunes }}
                />
                SFX Volume
              </span>
              <span className="font-mono text-sky-100">{sfxPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={sfxPct}
              aria-label="SFX Volume"
              onChange={(e) => handleSfxChange(Number(e.target.value))}
              onMouseUp={handleSfxPreview}
              onTouchEnd={handleSfxPreview}
              onKeyUp={handleSfxPreview}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-sky-400 bg-zinc-800 border border-sky-400/35"
            />
          </div>

          {/* Master Mute Status Toggle */}
          <div className="pt-2 border-t border-sky-400/15 flex items-center justify-between">
            <span className="text-[11px] tracking-[0.14em] uppercase text-sky-200/75 font-medium">
              Master Output ([M])
            </span>
            <button
              type="button"
              onClick={() => controller?.toggleAudioMute()}
              className="px-3 py-1 rounded-full text-[10px] font-bold tracking-[0.16em] uppercase border transition-colors cursor-pointer"
              style={{
                backgroundColor: PALETTE.hex.shadowSlate,
                borderColor: audioMuted
                  ? PALETTE.hex.roseMuted
                  : PALETTE.hex.emeraldReady,
                color: audioMuted
                  ? PALETTE.hex.roseMuted
                  : PALETTE.hex.emeraldReady,
              }}
            >
              {audioMuted ? 'MUTED' : 'ACTIVE'}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => controller?.resumeGame()}
            className="ascend-btn w-full py-3.5 px-6 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-sky-50 uppercase cursor-pointer"
          >
            [P] RESUME
          </button>

          {gameState !== GAME_STATES.LOBBY && (
            <button
              type="button"
              onClick={() => controller?.restartStage()}
              className="w-full py-3 px-6 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-sky-100 uppercase cursor-pointer border transition-all hover:scale-[1.01]"
              style={{
                backgroundColor: PALETTE.hex.shadowSlate,
                borderColor: PALETTE.hex.frostRunes,
                boxShadow: PALETTE.rgba.pauseRestartShadow,
              }}
            >
              {gameState === GAME_STATES.CHAMBER_COMBAT
                ? activeRealm === 2
                  ? 'RESTART AQUEDUCT'
                  : 'RESTART CHAMBERS'
                : hasReachedSummit
                  ? activeRealm === 2
                    ? 'RESTART AMPHITHEATER DUEL'
                    : 'RESTART SUMMIT DUEL'
                  : 'RESTART STAGE'}
            </button>
          )}

          {(gameState === GAME_STATES.CHAMBER_COMBAT ||
            gameState === GAME_STATES.BOSS_COMBAT ||
            gameState === GAME_STATES.STAGGER) && (
            <button
              type="button"
              onClick={() => controller?.returnToSanctum()}
              className="w-full py-3 px-6 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-purple-100 uppercase cursor-pointer border transition-all hover:scale-[1.01]"
              style={{
                backgroundColor: PALETTE.hex.abyssalCloak,
                borderColor: PALETTE.hex.amethystTrim,
              }}
            >
              [RETURN TO SANCTUM]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
