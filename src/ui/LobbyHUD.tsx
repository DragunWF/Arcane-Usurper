import { useEffect, useState } from 'react';
import {
  FINISHER_MODES,
  GAME_STATES,
  LOBBY_PROMPT_KINDS,
  PALETTE,
} from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface LobbyHUDProps {
  readonly controller: IGameController | null;
}

/**
 * Minimal frosted-obsidian HUD rendered inside the playable 3D **Obsidian Spire Sanctum** (`LOBBY`).
 * Displays location/tier header, contextual bottom-center `[E]` & sealed realm banners,
 * and floating damage numbers when testing spells on the Abyssal Target Crystal.
 */
export function LobbyHUD({ controller }: LobbyHUDProps) {
  const gameState = useGameStore((s) => s.gameState);
  const encoreTier = useGameStore((s) => s.encoreTier);
  const marinaCoreCharge = useGameStore((s) => s.marinaCoreCharge);
  const serenaCoreCharge = useGameStore((s) => s.serenaCoreCharge);
  const mikuCoreCharge = useGameStore((s) => s.mikuCoreCharge);
  const yenneferCoreCharge = useGameStore((s) => s.yenneferCoreCharge);
  const lobbyPrompt = useGameStore((s) => s.lobbyPrompt);
  const lobbyDummyHit = useGameStore((s) => s.lobbyDummyHit);
  const audioMuted = useGameStore((s) => s.audioMuted);
  const isPointerLocked = useGameStore((s) => s.isPointerLocked);

  const [showDummyPop, setShowDummyPop] = useState(false);

  useEffect(() => {
    if (!lobbyDummyHit) return;
    setShowDummyPop(true);
    const timer = window.setTimeout(() => setShowDummyPop(false), 850);
    return () => window.clearTimeout(timer);
  }, [lobbyDummyHit]);

  if (gameState !== GAME_STATES.LOBBY) return null;

  const isRealm2Active = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.REALM_2;
  const isRealm3Active = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.REALM_3;
  const isSealedRealm2 =
    lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.REALM_2_SEALED;
  const isSealedRealm3 =
    lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.REALM_3_SEALED;
  const isSealedGallery =
    lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.SIPHON_GALLERY_WARD;
  const isReservedGuest =
    lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.GUEST_PEDESTAL_RESERVED;
  const isAstralRift = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.ASTRAL_RIFT;
  const isMarinaDais = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.MARINA_DAIS;
  const isSerenaDais = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.SERENA_DAIS;
  const isMikuDais = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.MIKU_DAIS;
  const isYenneferDais = lobbyPrompt?.kind === LOBBY_PROMPT_KINDS.YENNEFER_DAIS;
  const isSealed =
    isSealedRealm2 || isSealedRealm3 || isSealedGallery || isReservedGuest;
  const marinaChargePct = Math.round(
    Math.max(0, Math.min(1, marinaCoreCharge)) * 100,
  );
  const serenaChargePct = Math.round(
    Math.max(0, Math.min(1, serenaCoreCharge)) * 100,
  );
  const mikuChargePct = Math.round(
    Math.max(0, Math.min(1, mikuCoreCharge)) * 100,
  );
  const yenneferChargePct = Math.round(
    Math.max(0, Math.min(1, yenneferCoreCharge)) * 100,
  );

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* Top-Center Minimal Location Header */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[310px] sm:w-[440px] max-w-[calc(100vw-2rem)]">
        <div className="frost-panel rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 border-purple-400/45 shadow-[0_12px_36px_rgba(139,92,246,0.28)] flex flex-col items-center text-center">
          <div className="font-display text-xs sm:text-sm md:text-base font-bold tracking-[0.2em] text-sky-50 uppercase">
            OBSIDIAN SPIRE SANCTUM
          </div>
          <div className="mt-1 inline-flex items-center gap-2 px-3 py-0.5 rounded-full bg-slate-950/75 border border-purple-400/40">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor:
                  encoreTier > 0
                    ? PALETTE.hex.frostRunes
                    : PALETTE.hex.glowViolet,
              }}
            />
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-sky-200">
              {encoreTier > 0
                ? `ENCORE USURPER • NG+${encoreTier}`
                : 'STANDARD REALM'}
            </span>
          </div>
        </div>
      </div>

      {/* Top-Right Pause & Audio Controls */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-30 flex items-center gap-2 pointer-events-auto">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            controller?.setPaused(true);
          }}
          className="frost-panel rounded-full px-3.5 py-1.5 flex items-center gap-1.5 text-[10px] sm:text-[11px] font-semibold tracking-[0.16em] uppercase text-sky-100 hover:border-purple-400/70 transition-colors cursor-pointer"
        >
          <span>[P] PAUSE</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            controller?.toggleAudioMute();
          }}
          className="frost-panel rounded-full px-3.5 py-1.5 flex items-center gap-2 text-[10px] sm:text-[11px] font-semibold tracking-[0.16em] uppercase text-sky-100 hover:border-purple-400/70 transition-colors cursor-pointer"
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
      </div>

      {/* Center Spell-Testing Reticle */}
      <div className="reticle-ring fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center opacity-80">
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <circle
            cx="16"
            cy="16"
            r="8.5"
            stroke={PALETTE.hex.amethystTrim}
            strokeWidth="1.2"
            strokeDasharray="4 4"
          />
          <circle cx="16" cy="16" r="2" fill={PALETTE.hex.frostRunes} />
        </svg>
      </div>

      {/* Floating Damage Readout for Abyssal Target Crystal */}
      {showDummyPop && lobbyDummyHit && (
        <div
          key={lobbyDummyHit.timestamp}
          className="fixed top-[42%] left-[58%] -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-bounce"
        >
          <div
            className="px-4 py-1.5 rounded-xl border font-display text-center shadow-[0_0_24px_rgba(168,85,247,0.55)]"
            style={{
              backgroundColor: `${PALETTE.hex.abyssalCloak}E6`,
              borderColor: lobbyDummyHit.isEncore
                ? PALETTE.hex.frostRunes
                : PALETTE.hex.glowViolet,
            }}
          >
            <div className="text-lg sm:text-xl font-extrabold tracking-wider text-sky-50">
              -{lobbyDummyHit.damage}
            </div>
            <div
              className="text-[9px] font-semibold tracking-[0.2em] uppercase"
              style={{
                color: lobbyDummyHit.isEncore
                  ? PALETTE.hex.frostRunes
                  : PALETTE.hex.pulseLavender,
              }}
            >
              {lobbyDummyHit.isEncore ? 'ENCORE FROST BEAM' : 'VOID ARCANA'}
            </div>
          </div>
        </div>
      )}

      {/* Contextual Bottom-Center Interaction Banner */}
      {lobbyPrompt &&
        (isMarinaDais || isSerenaDais || isMikuDais || isYenneferDais ? (
          <div className="fixed bottom-12 sm:bottom-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-2rem)] flex flex-col items-center gap-2.5">
            {/* Live Core Charge Bar Header */}
            <div className="frost-panel rounded-2xl px-5 py-2.5 border-purple-400/45 text-center w-[280px] sm:w-[340px]">
              <div
                className="text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] uppercase"
                style={{
                  color: isYenneferDais
                    ? PALETTE.hex.yenneferLilac
                    : isMikuDais
                      ? PALETTE.hex.harmonicEmerald
                      : isSerenaDais
                        ? PALETTE.hex.biolumCyan
                        : PALETTE.hex.frostRunes,
                }}
              >
                {lobbyPrompt.subtitle}
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-slate-950/90 border border-sky-400/40 overflow-hidden p-[1px]">
                <div
                  className="bar-fill h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${
                      isYenneferDais
                        ? yenneferChargePct
                        : isMikuDais
                          ? mikuChargePct
                          : isSerenaDais
                            ? serenaChargePct
                            : marinaChargePct
                    }%`,
                    background: isYenneferDais
                      ? `linear-gradient(90deg, ${PALETTE.hex.amethystTrim}, ${PALETTE.hex.yenneferLilac}, ${PALETTE.hex.voidCoreFuchsia})`
                      : isMikuDais
                        ? `linear-gradient(90deg, ${PALETTE.hex.harmonicEmerald}, ${PALETTE.hex.mikuCyan}, ${PALETTE.hex.harmonicMagenta})`
                        : isSerenaDais
                          ? `linear-gradient(90deg, ${PALETTE.hex.kelpEmerald}, ${PALETTE.hex.biolumCyan}, ${PALETTE.hex.pearlWhite})`
                          : `linear-gradient(90deg, ${PALETTE.hex.frostRunes}, ${PALETTE.hex.iceHighlights})`,
                    boxShadow: `0 0 12px ${
                      isYenneferDais
                        ? PALETTE.hex.yenneferLilac
                        : isMikuDais
                          ? PALETTE.hex.harmonicEmerald
                          : isSerenaDais
                            ? PALETTE.hex.biolumCyan
                            : PALETTE.hex.frostRunes
                    }`,
                  }}
                />
              </div>
            </div>

            {/* Dual Siphon Prompts: [E] Close-Range Kiss vs. [R] Ranged Beam */}
            <div className="flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  controller?.triggerLobbyInteract(FINISHER_MODES.KISS)
                }
                className="ascend-btn px-5 sm:px-6 py-3 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-fuchsia-100 uppercase cursor-pointer hover:scale-[1.02] transition-all flex flex-col items-center leading-tight"
              >
                <span>[E] ARCANE SIPHON KISS</span>
                <span className="mt-0.5 text-[10px] font-sans font-semibold tracking-[0.2em] text-fuchsia-200/80">
                  Close-Range
                </span>
              </button>
              {(isYenneferDais
                ? yenneferCoreCharge > 0
                : isMikuDais
                  ? mikuCoreCharge > 0
                  : isSerenaDais
                    ? serenaCoreCharge > 0
                    : marinaCoreCharge > 0) && (
                <button
                  type="button"
                  onClick={() =>
                    controller?.triggerLobbyInteract(FINISHER_MODES.BEAM)
                  }
                  className="frost-panel px-5 sm:px-6 py-3 rounded-xl border border-violet-400/75 bg-violet-950/80 hover:bg-violet-900/85 hover:border-fuchsia-300 hover:scale-[1.02] shadow-[0_0_24px_rgba(139,92,246,0.45)] font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-violet-100 uppercase cursor-pointer transition-all flex flex-col items-center leading-tight"
                >
                  <span>[R] UMBRAL SIPHON BEAM</span>
                  <span className="mt-0.5 text-[10px] font-sans font-semibold tracking-[0.2em] text-violet-200/80">
                    Ranged Drain
                  </span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="fixed bottom-12 sm:bottom-16 left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-2rem)]">
            <button
              type="button"
              onClick={() => controller?.triggerLobbyInteract()}
              className={`px-6 sm:px-8 py-3.5 rounded-2xl border backdrop-blur-md text-center transition-all cursor-pointer ${
                isSealed ? 'opacity-95' : 'ascend-btn hover:scale-[1.02]'
              }`}
              style={
                isSealed
                  ? {
                      backgroundColor: `${PALETTE.hex.abyssalCloak}E6`,
                      borderColor: isSealedRealm2
                        ? PALETTE.hex.sunkenTeal
                        : isSealedGallery
                          ? PALETTE.hex.amethystTrim
                          : PALETTE.hex.harmonicMagenta,
                    }
                  : undefined
              }
            >
              <div
                className="font-display text-xs sm:text-sm md:text-base font-bold tracking-[0.18em] uppercase"
                style={{
                  color: isAstralRift
                    ? PALETTE.hex.riftAmber
                    : isRealm2Active || isSealedRealm2
                      ? PALETTE.hex.biolumCyan
                      : isRealm3Active || isSealedRealm3
                        ? PALETTE.hex.harmonicEmerald
                        : isSealedGallery || isReservedGuest
                          ? PALETTE.hex.pulseLavender
                          : PALETTE.hex.iceHighlights,
                }}
              >
                {lobbyPrompt.title}
              </div>
              <div
                className="mt-1 text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] uppercase"
                style={{
                  color: isSealed
                    ? PALETTE.hex.drainedAshSilver
                    : isRealm3Active
                      ? PALETTE.hex.harmonicMagenta
                      : isRealm2Active
                        ? PALETTE.hex.atlanteanGold
                        : PALETTE.hex.pulseLavender,
                }}
              >
                {lobbyPrompt.subtitle}
              </div>
            </button>
          </div>
        ))}

      {/* Compact Bottom-Left Sanctum Controls Hint */}
      <div className="hidden sm:block absolute bottom-5 left-6 frost-panel rounded-xl px-3.5 py-2 text-[10px] tracking-[0.14em] uppercase text-sky-200/80">
        <span className="text-purple-300 font-semibold">WASD</span> Walk &bull;{' '}
        <span className="text-purple-300 font-semibold">SPACE</span> Blink &bull;{' '}
        <span className="text-purple-300 font-semibold">LMB/RMB</span> Test
        Spells &bull;{' '}
        <span className="text-sky-300 font-semibold">E</span> Interact &bull;{' '}
        <span className="text-purple-300 font-semibold">P</span> Pause
        {!isPointerLocked && ' • Click to Lock Camera'}
      </div>
    </div>
  );
}
