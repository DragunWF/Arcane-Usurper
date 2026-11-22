import { useEffect, useState } from 'react';
import {
  BOSS_PHASES,
  FINISHER_MODES,
  GAME_STATES,
  PALETTE,
  PLAYER_CONFIG,
  PORTAL_STATES,
  SPECIAL_SCENARIO_CONFIG,
  WOLF_AND_RAVEN_CONFIG,
} from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface CombatHUDProps {
  readonly controller: IGameController | null;
}

/**
 * Pure React + Tailwind 2D HUD and Title/Combat/Stagger/Defeat overlay layer.
 * Zero Three.js imports; reads throttled Zustand state and invokes narrow controller actions.
 */
export function CombatHUD({ controller }: CombatHUDProps) {
  const gameState = useGameStore((s) => s.gameState);
  const playerHp = useGameStore((s) => s.playerHp);
  const playerMaxHp = useGameStore((s) => s.playerMaxHp);
  const playerStamina = useGameStore((s) => s.playerStamina);
  const playerMaxStamina = useGameStore((s) => s.playerMaxStamina);
  const dashCooldown = useGameStore((s) => s.dashCooldown);
  const pulseCooldown = useGameStore((s) => s.pulseCooldown);
  const isPointerLocked = useGameStore((s) => s.isPointerLocked);
  const frostHitFlashToken = useGameStore((s) => s.frostHitFlashToken);
  const reticlePulseToken = useGameStore((s) => s.reticlePulseToken);

  const bossDisplayName = useGameStore((s) => s.bossDisplayName);
  const bossTitle = useGameStore((s) => s.bossTitle);
  const bossHp = useGameStore((s) => s.bossHp);
  const bossMaxHp = useGameStore((s) => s.bossMaxHp);
  const bossPhase = useGameStore((s) => s.bossPhase);
  const bossPhaseSubtitle = useGameStore((s) => s.bossPhaseSubtitle);
  const isBossStaggered = useGameStore((s) => s.isBossStaggered);
  const canExecuteFinisher = useGameStore((s) => s.canExecuteFinisher);
  const isSovereignFinisherLocked = useGameStore(
    (s) => s.isSovereignFinisherLocked,
  );
  const isNearLockedSovereign = useGameStore((s) => s.isNearLockedSovereign);
  const isBossExposed = useGameStore((s) => s.isBossExposed);
  const canExecuteStolenKiss = useGameStore((s) => s.canExecuteStolenKiss);
  const activeBosses = useGameStore((s) => s.activeBosses);
  const duoEventBanner = useGameStore((s) => s.duoEventBanner);
  const duoEventBannerSubtext = useGameStore((s) => s.duoEventBannerSubtext);
  const duoEventBannerToken = useGameStore((s) => s.duoEventBannerToken);
  const isPlayerYrdenSlowed = useGameStore((s) => s.isPlayerYrdenSlowed);
  const encoreTier = useGameStore((s) => s.encoreTier);
  const activeRealm = useGameStore((s) => s.activeRealm);
  const chamberWave = useGameStore((s) => s.chamberWave);
  const totalChamberWaves = useGameStore((s) => s.totalChamberWaves);
  const servantsRemaining = useGameStore((s) => s.servantsRemaining);
  const portalState = useGameStore((s) => s.portalState);
  const isNearPortal = useGameStore((s) => s.isNearPortal);
  const portalWarpProgress = useGameStore((s) => s.portalWarpProgress);

  const audioMuted = useGameStore((s) => s.audioMuted);
  const errorMessage = useGameStore((s) => s.errorMessage);

  const [showFrostFlash, setShowFrostFlash] = useState(false);
  const [reticlePulsing, setReticlePulsing] = useState(false);
  const [showDuoBanner, setShowDuoBanner] = useState(false);

  useEffect(() => {
    if (duoEventBannerToken === 0 || !duoEventBanner) return;
    setShowDuoBanner(true);
    const timer = window.setTimeout(
      () => setShowDuoBanner(false),
      WOLF_AND_RAVEN_CONFIG.vanquishedBannerMs,
    );
    return () => window.clearTimeout(timer);
  }, [duoEventBannerToken, duoEventBanner]);

  useEffect(() => {
    if (frostHitFlashToken === 0) return;
    setShowFrostFlash(true);
    const timer = window.setTimeout(
      () => setShowFrostFlash(false),
      PLAYER_CONFIG.frostHitVignetteMs,
    );
    return () => window.clearTimeout(timer);
  }, [frostHitFlashToken]);

  useEffect(() => {
    if (reticlePulseToken === 0) return;
    setReticlePulsing(true);
    const timer = window.setTimeout(
      () => setReticlePulsing(false),
      PLAYER_CONFIG.reticlePulseMs,
    );
    return () => window.clearTimeout(timer);
  }, [reticlePulseToken]);

  const hpPct = Math.max(0, Math.min(100, (playerHp / Math.max(1, playerMaxHp)) * 100));
  const staminaPct = Math.max(
    0,
    Math.min(100, (playerStamina / Math.max(1, playerMaxStamina)) * 100),
  );
  const bossHpPct = Math.max(0, Math.min(100, (bossHp / Math.max(1, bossMaxHp)) * 100));

  let hasLivingNonSiphonableBoss = false;
  for (let i = 0; i < activeBosses.length; i++) {
    const entry = activeBosses[i];
    if (entry && !entry.canBeSiphoned && (!entry.isDefeated || entry.hp > 0)) {
      hasLivingNonSiphonableBoss = true;
      break;
    }
  }
  const canShowFinisherPrompts =
    gameState === GAME_STATES.STAGGER &&
    canExecuteFinisher &&
    !hasLivingNonSiphonableBoss &&
    !isSovereignFinisherLocked;

  const isChamberMode =
    gameState === GAME_STATES.CHAMBER_COMBAT ||
    gameState === GAME_STATES.PORTAL_TRANSITION;
  const showCombatHud =
    gameState === GAME_STATES.BOSS_COMBAT ||
    gameState === GAME_STATES.STOLEN_KISS ||
    gameState === GAME_STATES.CHAMBER_COMBAT ||
    gameState === GAME_STATES.PORTAL_TRANSITION ||
    gameState === GAME_STATES.STAGGER;

  const phaseSubtitleClass = isBossStaggered
    ? 'text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-purple-300 font-semibold mt-0.5'
    : bossPhase === BOSS_PHASES.PHASE_3
      ? 'text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-sky-100 font-bold mt-0.5 drop-shadow-[0_0_12px_rgba(224,242,254,0.95)]'
      : bossPhase === BOSS_PHASES.PHASE_2
        ? 'text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-indigo-300 font-semibold mt-0.5 drop-shadow-[0_0_8px_rgba(99,102,241,0.75)]'
        : 'text-[10px] sm:text-[11px] tracking-[0.22em] uppercase text-sky-300/90 font-semibold mt-0.5';

  return (
    <>
      {/* Subtle Atmospheric Vignette */}
      <div className="fixed inset-0 vignette-overlay z-10" />

      {/* COMBAT & STAGGER HUD */}
      {showCombatHud && (
        <div className="fixed inset-0 z-20 pointer-events-none">
          {/* Top-Left Dark Mage Status Panel */}
          <div className="absolute top-4 left-4 sm:top-6 sm:left-6 w-[290px] sm:w-[340px] max-w-[calc(100vw-2rem)]">
            <div className="frost-panel rounded-2xl p-3.5 sm:p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600/40 to-slate-900 border border-purple-400/50 flex items-center justify-center shadow-[0_0_12px_rgba(168,85,247,0.35)]">
                    <svg
                      className="w-4 h-4 text-purple-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polygon points="12 2 19 12 12 22 5 12 12 2" />
                      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-display text-xs sm:text-sm font-bold tracking-[0.14em] text-sky-100 leading-tight">
                      ABYSSAL DARK MAGE
                    </div>
                    <div className="text-[10px] tracking-[0.2em] uppercase text-purple-300/85 font-semibold">
                      {encoreTier > 0
                        ? `Encore Usurper • NG+${encoreTier}`
                        : 'Frostbound Usurper'}
                    </div>
                  </div>
                </div>
                <span
                  className={
                    isPointerLocked
                      ? 'text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-purple-950/80 border border-purple-400/40 text-purple-200'
                      : 'text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-400/30 text-sky-300'
                  }
                >
                  {isPointerLocked ? 'LOCKED ORBIT' : 'FREE LOOK'}
                </span>
              </div>

              {/* Vitality HP Bar */}
              <div className="mb-2">
                <div className="flex justify-between items-center text-[10px] font-semibold tracking-widest uppercase mb-1">
                  <span className="text-sky-200/85">Vitality</span>
                  <span className="text-sky-100 font-mono">
                    {Math.ceil(playerHp)} / {playerMaxHp}
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-950/90 border border-sky-300/20 overflow-hidden p-[1px]">
                  <div
                    className="bar-fill h-full rounded-full bg-gradient-to-r from-violet-700 via-purple-500 to-fuchsia-400 shadow-[0_0_10px_rgba(168,85,247,0.65)]"
                    style={{ width: `${hpPct.toFixed(1)}%` }}
                  />
                </div>
              </div>

              {/* Aether Stamina Bar */}
              <div className="mb-3">
                <div className="flex justify-between items-center text-[10px] font-semibold tracking-widest uppercase mb-1">
                  <span className="text-sky-200/85">Aether Stamina</span>
                  <span className="text-sky-200 font-mono">
                    {Math.floor(playerStamina)} / {playerMaxStamina}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-950/90 border border-sky-300/20 overflow-hidden p-[1px]">
                  <div
                    className="bar-fill h-full rounded-full bg-gradient-to-r from-sky-600 via-sky-400 to-cyan-200 shadow-[0_0_8px_rgba(56,189,248,0.6)]"
                    style={{ width: `${staminaPct.toFixed(1)}%` }}
                  />
                </div>
              </div>

              {/* Ability Cooldown Chips */}
              <div className="grid grid-cols-2 gap-2 mb-2.5">
                <div className="rounded-lg bg-slate-950/70 border border-purple-500/25 px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-purple-200">
                    Blink
                  </span>
                  <span
                    className={
                      dashCooldown > 0.05
                        ? 'text-[10px] font-mono font-bold text-amber-300'
                        : 'text-[10px] font-mono font-bold text-emerald-300'
                    }
                  >
                    {dashCooldown > 0.05 ? `${dashCooldown.toFixed(1)}s` : 'READY'}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-950/70 border border-sky-500/25 px-2.5 py-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-sky-200">
                    Pulse
                  </span>
                  <span
                    className={
                      pulseCooldown > 0.05
                        ? 'text-[10px] font-mono font-bold text-amber-300'
                        : 'text-[10px] font-mono font-bold text-emerald-300'
                    }
                  >
                    {pulseCooldown > 0.05
                      ? `${pulseCooldown.toFixed(1)}s`
                      : 'READY'}
                  </span>
                </div>
              </div>

              {isPlayerYrdenSlowed && (
                <div
                  className="mb-2.5 rounded-lg px-2.5 py-1.5 border flex items-center justify-between animate-pulse"
                  style={{
                    backgroundColor: `${PALETTE.hex.geraltYrdenViolet}28`,
                    borderColor: `${PALETTE.hex.yenneferLilac}88`,
                  }}
                >
                  <span
                    className="text-[10px] font-display font-bold tracking-[0.18em] uppercase"
                    style={{ color: PALETTE.hex.yenneferLilac }}
                  >
                    YRDEN TETHERED
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-violet-200">
                    SLOWED &bull; BLINK OUT
                  </span>
                </div>
              )}

              {/* Control Legend */}
              <div className="pt-2 border-t border-sky-400/15 text-[10px] sm:text-[11px] text-sky-200/80 leading-relaxed font-medium">
                <span className="text-purple-300 font-semibold">WASD</span> Move
                &bull;{' '}
                <span className="text-purple-300 font-semibold">SPACE</span>{' '}
                Blink &bull;{' '}
                <span className="text-purple-300 font-semibold">LMB</span> Void
                Bolt &bull;{' '}
                <span className="text-purple-300 font-semibold">RMB</span>{' '}
                Umbral Pulse &bull;{' '}
                <span className="text-purple-300 font-semibold">P</span>{' '}
                Pause
              </div>
            </div>
          </div>

          {/* Top-Center Royal Ice Chambers Wave Header OR Marina Boss HP Bar */}
          {isChamberMode ? (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[310px] sm:w-[460px] md:w-[540px] max-w-[calc(100vw-2rem)]">
              <div className="frost-panel rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 border-purple-400/45 shadow-[0_12px_36px_rgba(139,92,246,0.28)]">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="font-display text-xs sm:text-sm md:text-base font-bold tracking-[0.18em] text-sky-50 leading-tight drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">
                    {activeRealm === 3
                      ? 'THE CYBER BACKSTAGE'
                      : activeRealm === 2
                        ? 'THE SUNKEN AQUEDUCT'
                        : 'ROYAL ICE CHAMBERS'}
                  </div>
                  <span
                    className={
                      portalState === PORTAL_STATES.IGNITED
                        ? 'text-[10px] sm:text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-fuchsia-300/70 text-fuchsia-100 uppercase'
                        : 'text-[10px] sm:text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-400/40 text-sky-200 uppercase'
                    }
                  >
                    {portalState === PORTAL_STATES.IGNITED
                      ? 'PORTAL IGNITED'
                      : `PORTAL SEALED`}
                  </span>
                </div>
                <div className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase font-semibold text-sky-200/90">
                  {portalState === PORTAL_STATES.IGNITED
                    ? activeRealm === 3
                      ? "HARMONIC PORTAL OPEN — ASCEND TO MIKU'S CONCERT STAGE"
                      : activeRealm === 2
                        ? "TIDAL PORTAL OPEN — DESCEND TO SERENA'S AMPHITHEATER"
                        : 'ASTRAL PORTAL OPEN — ASCEND TO MARINA’S SUMMIT'
                    : `CHAMBER WAVE ${Math.max(1, chamberWave)} / ${totalChamberWaves} — SERVANTS REMAINING: ${servantsRemaining}`}
                </div>
              </div>
            </div>
          ) : activeBosses.length > 1 ? (
            /* Compact Stacked Multi-Boss HP Bars: Non-Siphonable (Steel-Silver) stacked above Siphonable Sovereign (Royal-Violet + Siphon Crest) */
            <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-[320px] sm:w-[480px] md:w-[540px] max-w-[calc(100vw-2rem)] flex flex-col gap-2">
              {[...activeBosses]
                .sort((a, b) => Number(a.canBeSiphoned) - Number(b.canBeSiphoned))
                .map((b) => {
                  const pct = Math.max(
                    0,
                    Math.min(100, (b.hp / Math.max(1, b.maxHp)) * 100),
                  );
                  return (
                    <div
                      key={b.entityId}
                      className="frost-panel rounded-xl px-3.5 py-2 sm:px-4 sm:py-2.5 border"
                      style={{
                        borderColor: b.canBeSiphoned
                          ? `${PALETTE.hex.amethystTrim}88`
                          : `${PALETTE.hex.steelSilver}66`,
                        boxShadow: b.canBeSiphoned
                          ? `0 8px 26px ${PALETTE.hex.amethystTrim}38`
                          : `0 6px 20px rgba(15,23,42,0.55)`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          {b.canBeSiphoned ? (
                            <svg
                              className="w-3.5 h-3.5 shrink-0"
                              viewBox="0 0 16 16"
                              fill={PALETTE.hex.glowViolet}
                              aria-label="Siphon Crest"
                            >
                              <path d="M8 0.5L10.3 5.7L15.5 8L10.3 10.3L8 15.5L5.7 10.3L0.5 8L5.7 5.7L8 0.5Z" />
                            </svg>
                          ) : (
                            <span
                              className="w-2.5 h-2.5 rounded-sm rotate-45 shrink-0"
                              style={{
                                backgroundColor: PALETTE.hex.steelSilver,
                                boxShadow: `0 0 8px ${PALETTE.hex.steelSilver}`,
                              }}
                            />
                          )}
                          <span className="font-display text-[11px] sm:text-xs font-bold tracking-[0.16em] text-sky-50 truncate">
                            {b.displayName}
                          </span>
                          <span
                            className="text-[9px] font-semibold tracking-[0.16em] uppercase px-1.5 py-0.5 rounded shrink-0"
                            style={{
                              backgroundColor: `${PALETTE.hex.abyssalCloak}CC`,
                              color: b.isDissolving
                                ? PALETTE.hex.ashEmber
                                : b.isStaggered && hasLivingNonSiphonableBoss
                                  ? PALETTE.hex.riftAmber
                                  : b.isStaggered
                                    ? PALETTE.hex.pulseLavender
                                    : b.canBeSiphoned
                                      ? PALETTE.hex.yenneferLilac
                                      : PALETTE.hex.steelSilver,
                            }}
                          >
                            {b.isDissolving
                              ? 'FALLEN'
                              : b.isStaggered && hasLivingNonSiphonableBoss
                                ? SPECIAL_SCENARIO_CONFIG.finisherLockedBossBarTag
                                : b.isStaggered
                                  ? 'STAGGERED'
                                  : b.canBeSiphoned
                                    ? 'SOVEREIGN'
                                    : b.title}
                          </span>
                        </div>
                        <span className="text-[10px] sm:text-[11px] font-mono font-semibold text-sky-100/90 whitespace-nowrap">
                          {Math.ceil(b.hp)} / {b.maxHp}
                        </span>
                      </div>

                      <div className="relative h-2.5 w-full rounded-full bg-slate-950/90 border border-slate-400/25 overflow-hidden p-[1px]">
                        <div
                          className="bar-fill relative h-full rounded-full transition-all duration-150"
                          style={{
                            width: `${pct.toFixed(1)}%`,
                            background: b.canBeSiphoned
                              ? `linear-gradient(90deg, ${PALETTE.hex.royalIndigo}, ${PALETTE.hex.amethystTrim}, ${PALETTE.hex.yenneferLilac})`
                              : `linear-gradient(90deg, ${PALETTE.hex.mutedSlate}, ${PALETTE.hex.steelSilver}, ${PALETTE.hex.pureWhite})`,
                            boxShadow: b.canBeSiphoned
                              ? `0 0 12px ${PALETTE.hex.amethystTrim}`
                              : `0 0 10px ${PALETTE.hex.steelSilver}`,
                          }}
                        />
                      </div>

                      {b.canBeSiphoned &&
                        b.isStaggered &&
                        hasLivingNonSiphonableBoss && (
                          <div
                            className="mt-1.5 flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] font-display font-bold tracking-[0.18em] uppercase"
                            style={{ color: PALETTE.hex.riftAmber }}
                          >
                            <span>
                              {SPECIAL_SCENARIO_CONFIG.finisherLockedCueText}
                            </span>
                          </div>
                        )}
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[310px] sm:w-[460px] md:w-[540px] max-w-[calc(100vw-2rem)]">
              <div className="frost-panel rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 border-sky-300/35 shadow-[0_12px_36px_rgba(2,132,199,0.28)]">
                <div className="flex items-end justify-between gap-2 mb-1.5">
                  <div>
                    <div className="font-display text-xs sm:text-sm md:text-base font-bold tracking-[0.18em] text-sky-50 leading-tight drop-shadow-[0_0_10px_rgba(56,189,248,0.6)]">
                      {bossDisplayName} &mdash; {bossTitle}
                    </div>
                    <div className={phaseSubtitleClass}>
                      {bossPhaseSubtitle}
                    </div>
                  </div>
                  <div className="text-[11px] sm:text-xs font-mono font-semibold text-sky-100/95 whitespace-nowrap">
                    {Math.ceil(bossHp)} / {bossMaxHp}
                  </div>
                </div>

                <div className="relative h-3 w-full rounded-full bg-slate-950/90 border border-sky-300/35 overflow-hidden p-[1px]">
                  <div
                    className="absolute top-[1px] left-[1px] bottom-[1px] rounded-full bg-sky-100/75 transition-all duration-300 ease-out"
                    style={{ width: `${bossHpPct.toFixed(1)}%` }}
                  />
                  <div
                    className="bar-fill relative h-full rounded-full bg-gradient-to-r from-sky-700 via-sky-400 to-cyan-200 shadow-[0_0_14px_rgba(56,189,248,0.85)]"
                    style={{ width: `${bossHpPct.toFixed(1)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Transient Asymmetric Duo Callout Banner (e.g. GERALT VANQUISHED) */}
          {showDuoBanner && duoEventBanner && (
            <div className="fixed top-28 sm:top-32 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
              <div
                className="frost-panel rounded-2xl px-6 sm:px-9 py-3 border text-center"
                style={{
                  borderColor: `${PALETTE.hex.riftAmber}AA`,
                  boxShadow: `0 0 32px ${PALETTE.hex.amethystTrim}66`,
                }}
              >
                <div
                  className="font-display text-sm sm:text-lg font-extrabold tracking-[0.26em] uppercase"
                  style={{ color: PALETTE.hex.pureWhite }}
                >
                  {duoEventBanner}
                </div>
                {duoEventBannerSubtext && (
                  <div
                    className="mt-0.5 text-[10px] sm:text-xs font-semibold tracking-[0.22em] uppercase"
                    style={{ color: PALETTE.hex.yenneferLilac }}
                  >
                    {duoEventBannerSubtext}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Top-Right Pause ([P]) & Audio Toggle ([M]) Pills */}
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

          {/* Center Aim Reticle */}
          <div
            className={`reticle-ring fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center ${
              reticlePulsing ? 'reticle-pulse' : ''
            }`}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle
                cx="16"
                cy="16"
                r="9.5"
                stroke="rgba(224,242,254,0.62)"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              <circle cx="16" cy="16" r="2.2" fill={PALETTE.hex.glowViolet} />
              <line
                x1="16"
                y1="2.5"
                x2="16"
                y2="6.5"
                stroke={PALETTE.hex.frostRunes}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <line
                x1="16"
                y1="25.5"
                x2="16"
                y2="29.5"
                stroke={PALETTE.hex.frostRunes}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <line
                x1="2.5"
                y1="16"
                x2="6.5"
                y2="16"
                stroke={PALETTE.hex.frostRunes}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <line
                x1="25.5"
                y1="16"
                x2="29.5"
                y2="16"
                stroke={PALETTE.hex.frostRunes}
                strokeWidth="1.3"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Click-to-Lock Hint Banner */}
          <div
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full frost-panel text-[11px] sm:text-xs tracking-[0.14em] uppercase text-sky-100/90 transition-opacity duration-300 ${
              isPointerLocked ? 'opacity-0' : 'opacity-100'
            }`}
          >
            Click Arena to Lock Camera &bull; Drag to Orbit
          </div>

          {/* Mobile Touch Quick Action Buttons */}
          <div className="fixed bottom-5 right-4 flex flex-col gap-2.5 pointer-events-auto sm:hidden">
            <button
              type="button"
              onTouchStart={(e) => {
                e.preventDefault();
                controller?.triggerTouchBolt();
              }}
              className="w-14 h-14 rounded-full frost-panel border-purple-400/60 text-purple-200 font-bold text-[10px] tracking-wider uppercase active:scale-95"
            >
              BOLT
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  controller?.triggerTouchBlink();
                }}
                className="w-12 h-12 rounded-full frost-panel border-sky-400/50 text-sky-200 font-bold text-[9px] tracking-wider uppercase active:scale-95"
              >
                BLINK
              </button>
              <button
                type="button"
                onTouchStart={(e) => {
                  e.preventDefault();
                  controller?.triggerTouchPulse();
                }}
                className="w-12 h-12 rounded-full frost-panel border-fuchsia-400/50 text-fuchsia-200 font-bold text-[9px] tracking-wider uppercase active:scale-95"
              >
                PULSE
              </button>
            </div>
          </div>

          {/* Icy Blue Screen-Edge Frost Damage Vignette Flash */}
          <div
            className={`fixed inset-0 pointer-events-none frost-hit-vignette transition-opacity duration-200 ${
              showFrostFlash ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Lower-Center Ignited Astral Portal Prompt (CHAMBER_COMBAT) */}
          {gameState === GAME_STATES.CHAMBER_COMBAT &&
            portalState === PORTAL_STATES.IGNITED && (
              <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 pointer-events-auto z-30">
                <button
                  type="button"
                  onClick={() => controller?.triggerPortalAscend()}
                  className={`ascend-btn px-6 sm:px-9 py-3.5 rounded-xl font-display text-xs sm:text-sm md:text-base font-bold tracking-[0.2em] text-fuchsia-100 uppercase cursor-pointer animate-pulse ${
                    isNearPortal ? 'scale-105' : 'opacity-90'
                  }`}
                >
                  {activeRealm === 3
                    ? '[E] ASCEND THROUGH HARMONIC PORTAL'
                    : activeRealm === 2
                      ? '[E] DESCEND THROUGH TIDAL PORTAL'
                      : '[E] ASCEND THROUGH ASTRAL PORTAL'}
                </button>
              </div>
            )}

          {/* Lower-Center 2-Stage Frontal Guard-Break Ambush Indicator (BOSS_COMBAT during exposureTimer > 0) */}
          {gameState === GAME_STATES.BOSS_COMBAT && isBossExposed && (
            <div
              className={`fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-30 ${
                canExecuteStolenKiss
                  ? 'pointer-events-auto'
                  : 'pointer-events-none'
              }`}
            >
              {canExecuteStolenKiss ? (
                <button
                  type="button"
                  onClick={() => controller?.triggerStolenKiss()}
                  className="ascend-btn px-6 sm:px-8 py-3 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.2em] text-fuchsia-100 uppercase cursor-pointer animate-pulse shadow-[0_0_28px_rgba(139,92,246,0.75)]"
                >
                  [E] STOLEN KISS
                </button>
              ) : (
                <div className="frost-panel px-5 sm:px-7 py-2.5 rounded-xl border border-violet-400/75 bg-violet-950/80 shadow-[0_0_24px_rgba(139,92,246,0.55)] flex items-center gap-2.5 animate-pulse">
                  <span
                    className="w-2.5 h-2.5 rotate-45 rounded-[2px] shrink-0"
                    style={{
                      backgroundColor: PALETTE.hex.amethystTrim,
                      boxShadow: `0 0 12px ${PALETTE.hex.amethystTrim}`,
                    }}
                  />
                  <span className="font-display text-[11px] sm:text-xs font-bold tracking-[0.18em] text-violet-100 uppercase whitespace-nowrap">
                    SOVEREIGN EXPOSED &mdash; BLINK IN [SPACE]
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Lower-Center Locked Siphon Proximity Cue (Sovereign staggered at 0 HP while non-siphonable foes remain) */}
          {gameState === GAME_STATES.BOSS_COMBAT &&
            isSovereignFinisherLocked &&
            isNearLockedSovereign && (
              <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 pointer-events-none z-30 max-w-[calc(100vw-2rem)]">
                <div
                  className="frost-panel px-5 sm:px-7 py-2.5 rounded-xl border flex items-center gap-2.5"
                  style={{
                    borderColor: `${PALETTE.hex.riftAmber}99`,
                    backgroundColor: `${PALETTE.hex.abyssalCloak}DD`,
                    boxShadow: `0 0 24px ${PALETTE.hex.riftAmber}44`,
                  }}
                >
                  <span
                    className="w-2.5 h-2.5 rotate-45 rounded-[2px] shrink-0"
                    style={{
                      backgroundColor: PALETTE.hex.riftAmber,
                      boxShadow: `0 0 10px ${PALETTE.hex.riftAmber}`,
                    }}
                  />
                  <span
                    className="font-display text-[11px] sm:text-xs font-bold tracking-[0.18em] uppercase whitespace-nowrap"
                    style={{ color: PALETTE.hex.pureWhite }}
                  >
                    {SPECIAL_SCENARIO_CONFIG.finisherLockedCueText}
                  </span>
                </div>
              </div>
            )}

          {/* Lower-Center Dual Amethyst Finisher Prompts (STAGGER within 8.5m, strictly gated on all non-siphonable foes defeated) */}
          {canShowFinisherPrompts && (
            <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 pointer-events-auto z-30 flex flex-col sm:flex-row items-center gap-3 max-w-[calc(100vw-2rem)]">
              <button
                type="button"
                onClick={() => controller?.triggerFinisher(FINISHER_MODES.KISS)}
                className="ascend-btn px-5 sm:px-7 py-3 rounded-xl font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-fuchsia-100 uppercase cursor-pointer animate-pulse flex flex-col items-center leading-tight"
              >
                <span>[E] ARCANE SIPHON KISS</span>
                <span className="mt-0.5 text-[10px] font-sans font-semibold tracking-[0.2em] text-fuchsia-200/80">
                  Close-Range
                </span>
              </button>
              <button
                type="button"
                onClick={() => controller?.triggerFinisher(FINISHER_MODES.BEAM)}
                className="frost-panel px-5 sm:px-7 py-3 rounded-xl border border-violet-400/75 bg-violet-950/80 hover:bg-violet-900/85 hover:border-fuchsia-300 shadow-[0_0_24px_rgba(139,92,246,0.45)] font-display text-xs sm:text-sm font-bold tracking-[0.18em] text-violet-100 uppercase cursor-pointer transition-all flex flex-col items-center leading-tight"
              >
                <span>[R] UMBRAL SIPHON BEAM</span>
                <span className="mt-0.5 text-[10px] font-sans font-semibold tracking-[0.2em] text-violet-200/80">
                  Ranged Drain
                </span>
              </button>
            </div>
          )}

          {/* White-Violet Astral Portal Warp Transition Overlay */}
          {gameState === GAME_STATES.PORTAL_TRANSITION && (
            <div
              className="fixed inset-0 z-40 pointer-events-none flex items-center justify-center"
              style={{
                opacity: Math.min(1, Math.pow(portalWarpProgress, 0.7) * 1.1),
                background: `radial-gradient(circle at center, ${PALETTE.hex.pureWhite} 0%, ${PALETTE.hex.pulseLavender} 42%, ${PALETTE.hex.glowViolet} 100%)`,
              }}
            >
              <div className="font-display text-sm sm:text-lg font-extrabold tracking-[0.28em] uppercase text-slate-950 drop-shadow-[0_0_16px_rgba(255,255,255,0.9)]">
                {activeRealm === 3
                  ? 'WARPING TO THE ASTRAL CONCERT STAGE'
                  : activeRealm === 2
                    ? 'DESCENDING TO THE PEARL AMPHITHEATER'
                    : 'ASCENDING TO THE GLACIAL SUMMIT'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* NON-BLOCKING WEBGL ERROR FALLBACK */}
      {errorMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-6">
          <div className="frost-panel rounded-2xl max-w-md w-full p-6 text-center">
            <h2 className="font-display text-xl font-bold text-purple-300 mb-2">
              WebGL Initialization Notice
            </h2>
            <p className="text-sm text-sky-100/80 leading-relaxed">
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
