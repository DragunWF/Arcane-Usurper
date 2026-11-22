import { useEffect } from 'react';
import { PALETTE, SPECIAL_SCENARIOS } from '../config/gameConfig';
import type { IGameController } from '../engine/GameEngine';
import { useGameStore } from '../state/useGameStore';

interface ScenarioSelectorModalProps {
  readonly controller: IGameController | null;
}

/**
 * Sleek dark-obsidian Special Scenarios Selector modal opened from the west-terrace
 * Astral Rift Portal ([E]) or the Pause Menu quick-launch button. Zero Three.js imports.
 */
export function ScenarioSelectorModal({
  controller,
}: ScenarioSelectorModalProps) {
  const isOpen = useGameStore((s) => s.isScenarioSelectorOpen);
  const yenneferDefeated = useGameStore((s) => s.yenneferDefeated);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        controller?.closeScenarioSelector();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, controller]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
      style={{
        backgroundColor: PALETTE.rgba.pauseBackdrop,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl p-6 sm:p-7 border"
        style={{
          background: `linear-gradient(155deg, ${PALETTE.hex.abyssalCloak}F5 0%, ${PALETTE.hex.shadowSlate}F0 100%)`,
          borderColor: PALETTE.hex.amethystTrim,
          boxShadow: `0 24px 64px rgba(0,0,0,0.75), 0 0 36px ${PALETTE.hex.amethystTrim}44`,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border mb-2"
              style={{
                backgroundColor: `${PALETTE.hex.abyssalCloak}DD`,
                borderColor: `${PALETTE.hex.riftAmber}99`,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: PALETTE.hex.riftAmber,
                  boxShadow: `0 0 10px ${PALETTE.hex.riftAmber}`,
                }}
              />
              <span
                className="text-[10px] font-bold tracking-[0.24em] uppercase"
                style={{ color: PALETTE.hex.riftAmber }}
              >
                Astral Rift • Multi-Boss Encounters
              </span>
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-[0.16em] uppercase text-sky-50">
              SPECIAL SCENARIOS
            </h2>
            <p className="mt-1 text-[11px] tracking-[0.14em] uppercase text-sky-200/70">
              Zero-Minion Direct Encounters &bull; Asymmetric Siphon Encounters
            </p>
          </div>
          <button
            type="button"
            onClick={() => controller?.closeScenarioSelector()}
            className="px-3.5 py-1.5 rounded-lg border text-[10px] font-bold tracking-[0.18em] uppercase text-sky-200 hover:text-white transition-colors cursor-pointer"
            style={{
              backgroundColor: PALETTE.hex.shadowSlate,
              borderColor: `${PALETTE.hex.amethystTrim}80`,
            }}
          >
            [ESC] CLOSE
          </button>
        </div>

        {/* Extensible Scenario Registry Cards */}
        <div className="grid grid-cols-1 gap-3.5 max-h-[62vh] overflow-y-auto pr-1">
          {SPECIAL_SCENARIOS.map((scenario) => {
            const isPlayable = scenario.unlocked && scenario.bosses.length > 0;
            const isCleared =
              scenario.guestPedestalIndex === 0 && yenneferDefeated;

            return (
              <div
                key={scenario.id}
                className="rounded-xl p-4 sm:p-5 border transition-all"
                style={{
                  backgroundColor: isPlayable
                    ? `${PALETTE.hex.abyssalCloak}E6`
                    : `${PALETTE.hex.abyssalCloak}88`,
                  borderColor: isPlayable
                    ? `${PALETTE.hex.amethystTrim}AA`
                    : `${PALETTE.hex.mutedSlate}66`,
                  opacity: isPlayable ? 1 : 0.72,
                }}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-sm sm:text-base font-extrabold tracking-[0.16em] uppercase text-sky-50">
                        {scenario.title}
                      </h3>
                      {isPlayable ? (
                        <span
                          className="text-[9px] font-bold tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border"
                          style={{
                            borderColor: `${PALETTE.hex.riftAmber}99`,
                            color: PALETTE.hex.riftAmber,
                            backgroundColor: `${PALETTE.hex.abyssalCloak}CC`,
                          }}
                        >
                          {scenario.bosses.length}-BOSS DUEL
                        </span>
                      ) : (
                        <span
                          className="text-[9px] font-bold tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border"
                          style={{
                            borderColor: `${PALETTE.hex.mutedSlate}99`,
                            color: PALETTE.hex.drainedAshSilver,
                          }}
                        >
                          LOCKED RIFT
                        </span>
                      )}
                      {isCleared && (
                        <span
                          className="text-[9px] font-bold tracking-[0.2em] uppercase px-2 py-0.5 rounded-full border"
                          style={{
                            borderColor: `${PALETTE.hex.yenneferLilac}99`,
                            color: PALETTE.hex.yenneferLilac,
                          }}
                        >
                          GUEST PEDESTAL I UNLOCKED
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-semibold tracking-[0.12em] uppercase text-purple-200/85">
                      {scenario.subtitle}
                    </p>

                    {isPlayable && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {scenario.bosses.map((boss) => (
                          <div
                            key={boss.bossId}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold tracking-[0.12em] uppercase"
                            style={{
                              backgroundColor: `${PALETTE.hex.shadowSlate}CC`,
                              borderColor: boss.canBeSiphoned
                                ? `${PALETTE.hex.amethystTrim}99`
                                : `${PALETTE.hex.steelSilver}66`,
                              color: boss.canBeSiphoned
                                ? PALETTE.hex.pulseLavender
                                : PALETTE.hex.steelSilver,
                            }}
                          >
                            {boss.canBeSiphoned ? (
                              <svg
                                className="w-3 h-3 shrink-0"
                                viewBox="0 0 16 16"
                                fill="currentColor"
                              >
                                <path d="M8 1L10.2 5.8L15 8L10.2 10.2L8 15L5.8 10.2L1 8L5.8 5.8L8 1Z" />
                              </svg>
                            ) : (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{
                                  backgroundColor: PALETTE.hex.steelSilver,
                                }}
                              />
                            )}
                            <span>{boss.displayName}</span>
                            <span className="opacity-65">
                              {boss.canBeSiphoned
                                ? '• Siphonable'
                                : '• Ash-Bound'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {isPlayable ? (
                    <button
                      type="button"
                      onClick={() =>
                        controller?.launchSpecialScenario(scenario.id)
                      }
                      className="ascend-btn shrink-0 px-5 py-3 rounded-xl font-display text-xs font-bold tracking-[0.18em] text-sky-50 uppercase cursor-pointer hover:scale-[1.02] transition-transform"
                    >
                      ENTER RIFT
                    </button>
                  ) : (
                    <div
                      className="shrink-0 px-4 py-2.5 rounded-xl border text-[10px] font-display font-bold tracking-[0.18em] uppercase text-center"
                      style={{
                        borderColor: `${PALETTE.hex.mutedSlate}66`,
                        color: PALETTE.hex.drainedAshSilver,
                      }}
                    >
                      SEALED
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
