import { useEffect, useState } from 'react';
import {
  DRAIN_THROTTLE_MODES,
  FINISHER_POSE_IDS,
  FINISHER_POSE_LABELS,
  GAME_STATES,
  type DrainThrottleMode,
  type FinisherPoseId,
} from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface FinisherHUDProps {
  readonly controller: IGameController | null;
}

const POSE_OPTIONS: readonly FinisherPoseId[] = [
  FINISHER_POSE_IDS.UPRIGHT_EMBRACE,
  FINISHER_POSE_IDS.BALLROOM_DIP,
];

const THROTTLE_OPTIONS: readonly {
  readonly id: DrainThrottleMode;
  readonly label: string;
  readonly keyHint: string;
}[] = [
  { id: DRAIN_THROTTLE_MODES.SAVOR, label: 'SAVOR', keyHint: 'S / RMB' },
  { id: DRAIN_THROTTLE_MODES.FLOW, label: 'FLOW', keyHint: 'DEFAULT' },
  { id: DRAIN_THROTTLE_MODES.SURGE, label: 'SURGE', keyHint: 'W / E / SPACE' },
];

/**
 * Interactive Arcane Siphon Kiss HUD rendered during SIPHON_FINISHER and ENDLESS_SAVOR.
 * Non-blocking pointer-events-none root so 360° orbit drag & scroll zoom remain unobstructed.
 */
export function FinisherHUD({ controller }: FinisherHUDProps) {
  const gameState = useGameStore((s) => s.gameState);
  const siphonProgress = useGameStore((s) => s.siphonProgress);
  const marinaCoreCharge = useGameStore((s) => s.marinaCoreCharge);
  const serenaCoreCharge = useGameStore((s) => s.serenaCoreCharge);
  const mikuCoreCharge = useGameStore((s) => s.mikuCoreCharge);
  const lobbySiphonTarget = useGameStore((s) => s.lobbySiphonTarget);
  const finisherPose = useGameStore((s) => s.finisherPose);
  const throttleMode = useGameStore((s) => s.throttleMode);
  const isEndlessSavor = useGameStore((s) => s.isEndlessSavor);
  const tauntTriggerCount = useGameStore((s) => s.tauntTriggerCount);
  const bossDisplayName = useGameStore((s) => s.bossDisplayName);
  const activeRealm = useGameStore((s) => s.activeRealm);
  const audioMuted = useGameStore((s) => s.audioMuted);

  const [showTauntPop, setShowTauntPop] = useState(false);

  useEffect(() => {
    if (tauntTriggerCount === 0) return;
    setShowTauntPop(true);
    const timer = window.setTimeout(() => setShowTauntPop(false), 1250);
    return () => window.clearTimeout(timer);
  }, [tauntTriggerCount]);

  const isLobbySiphon = gameState === GAME_STATES.LOBBY_SIPHON;
  const active =
    gameState === GAME_STATES.SIPHON_FINISHER ||
    gameState === GAME_STATES.ENDLESS_SAVOR ||
    isLobbySiphon;
  if (!active) return null;

  const isSerenaLobbyTarget =
    isLobbySiphon && lobbySiphonTarget === 'serena';
  const isMikuLobbyTarget =
    isLobbySiphon && lobbySiphonTarget === 'miku';
  const activeCoreCharge = isMikuLobbyTarget
    ? mikuCoreCharge
    : isSerenaLobbyTarget
      ? serenaCoreCharge
      : marinaCoreCharge;
  const drainPct = Math.round(Math.max(0, Math.min(1, siphonProgress)) * 100);
  const chargePct = Math.round(
    Math.max(0, Math.min(1, activeCoreCharge)) * 100,
  );
  const isLobbyDepleted = isLobbySiphon && (isEndlessSavor || chargePct <= 0);
  const showEndlessBanner = isEndlessSavor || isLobbyDepleted;
  const displayPct = isLobbySiphon ? chargePct : drainPct;
  const barWidthPct = isLobbySiphon
    ? isLobbyDepleted
      ? 100
      : chargePct
    : drainPct;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Top-Center Arcane Siphon Drain / Core Charge Gauge */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[320px] sm:w-[480px] max-w-[calc(100vw-2rem)]">
        <div className="frost-panel rounded-2xl px-4 py-3 border-purple-400/45 shadow-[0_0_32px_rgba(168,85,247,0.28)]">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-fuchsia-100 uppercase">
              {showEndlessBanner
                ? 'CORE DEPLETED — ENDLESS SAVOR'
                : isMikuLobbyTarget
                  ? `HARMONIC CORE CHARGE • ${bossDisplayName}`
                  : isSerenaLobbyTarget
                    ? `TIDAL CORE CHARGE • ${bossDisplayName}`
                    : isLobbySiphon
                      ? `CRYO CORE CHARGE • ${bossDisplayName}`
                      : `ARCANE SIPHON KISS • ${bossDisplayName}`}
            </div>
            <span className="text-xs font-mono font-bold text-purple-200">
              {displayPct}%
            </span>
          </div>

          <div className="h-3 w-full rounded-full bg-slate-950/90 border border-purple-400/35 overflow-hidden p-[1px]">
            <div
              className={
                showEndlessBanner
                  ? 'bar-fill h-full rounded-full bg-gradient-to-r from-slate-400 via-purple-400 to-fuchsia-300 shadow-[0_0_12px_rgba(168,85,247,0.85)]'
                  : isMikuLobbyTarget
                    ? 'bar-fill h-full rounded-full bg-gradient-to-r from-emerald-400 via-teal-300 to-pink-400 shadow-[0_0_14px_rgba(16,185,129,0.9)]'
                    : isSerenaLobbyTarget
                      ? 'bar-fill h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-purple-400 shadow-[0_0_14px_rgba(6,182,212,0.9)]'
                      : isLobbySiphon
                        ? 'bar-fill h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-purple-400 shadow-[0_0_14px_rgba(56,189,248,0.9)]'
                        : 'bar-fill h-full rounded-full bg-gradient-to-r from-sky-400 via-purple-500 to-fuchsia-400 shadow-[0_0_14px_rgba(168,85,247,0.9)]'
              }
              style={{ width: `${barWidthPct}%` }}
            />
          </div>

          {/* Three-Tier Drain Throttle Pills (hidden once Core is Depleted in Endless Savor) */}
          {!showEndlessBanner && (
            <div className="mt-2.5 flex items-center justify-center gap-2 pointer-events-auto">
              {THROTTLE_OPTIONS.map((opt) => {
                const selected = throttleMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      controller?.setDrainThrottle(
                        opt.id === DRAIN_THROTTLE_MODES.FLOW ? null : opt.id,
                      )
                    }
                    className={`px-3 py-1 rounded-full text-[10px] font-semibold tracking-[0.14em] uppercase border transition-all cursor-pointer ${
                      selected
                        ? 'bg-purple-500/35 border-fuchsia-300/80 text-fuchsia-50 shadow-[0_0_14px_rgba(168,85,247,0.55)]'
                        : 'bg-slate-950/75 border-sky-400/25 text-sky-200/80 hover:border-purple-400/60'
                    }`}
                  >
                    {opt.label}{' '}
                    <span className="opacity-65 ml-1">({opt.keyHint})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Top-Right Audio Toggle Pill */}
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

      {/* Floating *MANA DEPLETED* Tiara-Flick Taunt Pop-Up */}
      {showTauntPop && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-bounce">
          <div className="px-4 py-1.5 rounded-full bg-fuchsia-950/85 border border-fuchsia-300/80 shadow-[0_0_24px_rgba(244,63,94,0.6)] font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-fuchsia-100 uppercase">
            *MANA DEPLETED*
          </div>
        </div>
      )}

      {/* Bottom-Left Dominance Pose Switcher [1-2] + [F] Tiara / Hair-Cube Flick Taunt */}
      <div className="absolute bottom-5 left-4 sm:left-6 flex flex-col gap-2 max-w-[calc(100vw-2rem)] pointer-events-auto">
        <div className="frost-panel rounded-2xl p-2.5 flex flex-wrap items-center gap-1.5">
          {POSE_OPTIONS.map((poseId) => {
            const activePose = finisherPose === poseId;
            const poseLabel = FINISHER_POSE_LABELS[poseId];
            return (
              <button
                key={poseId}
                type="button"
                onClick={() => controller?.setFinisherPose(poseId)}
                className={`px-3 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-semibold tracking-wider uppercase border transition-all cursor-pointer ${
                  activePose
                    ? 'bg-purple-500/40 border-purple-300/90 text-sky-50 shadow-[0_0_14px_rgba(168,85,247,0.55)]'
                    : 'bg-slate-950/75 border-sky-400/20 text-sky-200/80 hover:border-purple-400/60'
                }`}
              >
                [{poseId}] {poseLabel}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => controller?.triggerTaunt()}
            className="px-3.5 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-bold tracking-[0.14em] uppercase border border-rose-400/60 bg-rose-950/60 text-rose-100 hover:border-rose-300 hover:bg-rose-900/70 transition-all cursor-pointer"
          >
            {isMikuLobbyTarget || (!isLobbySiphon && activeRealm === 3)
              ? '[F] FLICK HAIR-CUBE'
              : '[F] FLICK TIARA'}
          </button>
        </div>

        <div className="px-3 py-1 rounded-full frost-panel text-[10px] tracking-[0.16em] uppercase text-sky-200/75 w-fit">
          Drag to Orbit 360&deg; &bull; Scroll to Zoom
        </div>
      </div>

      {/* Bottom-Right Release Button in Siphon Gallery (LOBBY_SIPHON) */}
      {isLobbySiphon && (
        <div className="absolute bottom-5 right-4 sm:right-6 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              controller?.releaseLobbySiphon();
            }}
            className="frost-panel rounded-2xl px-5 py-3 border border-purple-300/70 bg-slate-950/85 hover:bg-purple-950/75 hover:border-sky-300/85 shadow-[0_0_24px_rgba(139,92,246,0.42)] transition-all cursor-pointer text-right"
          >
            <div className="font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-sky-50 uppercase">
              [RELEASE &amp; STEP BACK]
            </div>
            <div className="mt-0.5 text-[10px] font-semibold tracking-[0.16em] text-purple-200/80 uppercase">
              ESC &bull; RETURN TO SIPHON GALLERY
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
