import { create } from 'zustand';
import {
  AUDIO_MODES,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  GAME_STATES,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  REALM_IDS,
  type AudioMode,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
  type RealmId,
} from '../config/gameConfig';

/**
 * Throttled telemetry snapshot written by the 60 FPS ECS simulation (~15–20 Hz)
 * to keep React HUD re-renders lightweight and batched.
 */
export interface CombatHudSnapshot {
  playerHp?: number;
  playerMaxHp?: number;
  playerStamina?: number;
  playerMaxStamina?: number;
  dashCooldown?: number;
  pulseCooldown?: number;
  bossHp?: number;
  bossMaxHp?: number;
  siphonProgress?: number;
  tauntDizzyTimer?: number;
  canExecuteFinisher?: boolean;
}

export interface GameStoreState {
  // Core Progression & State Machine
  gameState: GameState;
  realmId: RealmId;
  encoreTier: number;

  // Player Telemetry
  playerHp: number;
  playerMaxHp: number;
  playerStamina: number;
  playerMaxStamina: number;
  dashCooldown: number;
  pulseCooldown: number;
  isPointerLocked: boolean;
  frostHitFlashToken: number;
  reticlePulseToken: number;

  // Chamber Progression Telemetry
  chamberIndex: number;
  chamberServantsRemaining: number;
  chamberServantsTotal: number;
  isPortalUnlocked: boolean;

  // Boss Telemetry
  bossId: string;
  bossDisplayName: string;
  bossTitle: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: BossPhase;
  bossPhaseSubtitle: string;
  bossExpression: BossExpression;
  isBossStaggered: boolean;
  canExecuteFinisher: boolean;

  // Interactive Finisher & Diorama State
  siphonProgress: number;
  finisherPose: FinisherPoseId;
  drainThrottle: DrainThrottleMode;
  isEndlessSavor: boolean;
  tauntPopToken: number;
  tauntDizzyTimer: number;

  // Audio & System Status
  audioMuted: boolean;
  audioMode: AudioMode;
  errorMessage: string | null;

  // Actions
  setGameState: (gameState: GameState) => void;
  setRealmId: (realmId: RealmId) => void;
  setEncoreTier: (encoreTier: number) => void;
  incrementEncoreTier: () => void;
  setPointerLocked: (locked: boolean) => void;
  setBossIdentity: (id: string, displayName: string, title: string, maxHp: number) => void;
  setBossPhase: (phase: BossPhase, subtitle?: string) => void;
  setBossExpression: (expression: BossExpression) => void;
  setBossStaggered: (staggered: boolean) => void;
  setCanExecuteFinisher: (canExecute: boolean) => void;
  setChamberProgress: (
    chamberIndex: number,
    remaining: number,
    total: number,
    portalUnlocked: boolean,
  ) => void;
  setFinisherPose: (pose: FinisherPoseId) => void;
  setDrainThrottle: (mode: DrainThrottleMode) => void;
  setEndlessSavor: (active: boolean) => void;
  enterEndlessSavor: () => void;
  exitEndlessSavor: () => void;
  setAudioMuted: (muted: boolean) => void;
  setAudioMode: (mode: AudioMode) => void;
  setErrorMessage: (message: string | null) => void;
  triggerFrostHitFlash: () => void;
  triggerReticlePulse: () => void;
  triggerTauntPop: () => void;
  syncCombatSnapshot: (snapshot: CombatHudSnapshot) => void;
  resetForDuel: (encoreTier?: number) => void;
  resetToTitle: () => void;
}

function getSubtitleForPhase(phase: BossPhase): string {
  if (phase === BOSS_PHASES.PHASE_2) return BOSS_CONFIG.phase2.subtitle;
  if (phase === BOSS_PHASES.PHASE_3) return BOSS_CONFIG.phase3.subtitle;
  return BOSS_CONFIG.phase1.subtitle;
}

const INITIAL_STATE = {
  gameState: GAME_STATES.TITLE as GameState,
  realmId: REALM_IDS.GLACIAL_SPIRE as RealmId,
  encoreTier: 0,

  playerHp: PLAYER_CONFIG.maxHp,
  playerMaxHp: PLAYER_CONFIG.maxHp,
  playerStamina: PLAYER_CONFIG.maxStamina,
  playerMaxStamina: PLAYER_CONFIG.maxStamina,
  dashCooldown: 0,
  pulseCooldown: 0,
  isPointerLocked: false,
  frostHitFlashToken: 0,
  reticlePulseToken: 0,

  chamberIndex: 0,
  chamberServantsRemaining: 0,
  chamberServantsTotal: 0,
  isPortalUnlocked: false,

  bossId: BOSS_CONFIG.defaultId,
  bossDisplayName: BOSS_CONFIG.defaultDisplayName,
  bossTitle: BOSS_CONFIG.defaultTitle,
  bossHp: BOSS_CONFIG.maxHp,
  bossMaxHp: BOSS_CONFIG.maxHp,
  bossPhase: BOSS_PHASES.PHASE_1 as BossPhase,
  bossPhaseSubtitle: BOSS_CONFIG.phase1.subtitle as string,
  bossExpression: BOSS_EXPRESSIONS.COMBAT as BossExpression,
  isBossStaggered: false,
  canExecuteFinisher: false,

  siphonProgress: 0,
  finisherPose: FINISHER_POSE_IDS.CHIN_LIFT as FinisherPoseId,
  drainThrottle: DRAIN_THROTTLE_MODES.FLOW as DrainThrottleMode,
  isEndlessSavor: false,
  tauntPopToken: 0,
  tauntDizzyTimer: 0,

  audioMuted: false,
  audioMode: AUDIO_MODES.SILENT as AudioMode,
  errorMessage: null as string | null,
};

export const useGameStore = create<GameStoreState>((set) => ({
  ...INITIAL_STATE,

  setGameState: (gameState) => set({ gameState }),
  setRealmId: (realmId) => set({ realmId }),
  setEncoreTier: (encoreTier) => set({ encoreTier }),
  incrementEncoreTier: () =>
    set((state) => ({ encoreTier: state.encoreTier + 1 })),
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),

  setBossIdentity: (bossId, bossDisplayName, bossTitle, bossMaxHp) =>
    set({
      bossId,
      bossDisplayName,
      bossTitle,
      bossMaxHp,
      bossHp: bossMaxHp,
    }),

  setBossPhase: (bossPhase, subtitle) =>
    set({
      bossPhase,
      bossPhaseSubtitle: subtitle ?? getSubtitleForPhase(bossPhase),
    }),

  setBossExpression: (bossExpression) => set({ bossExpression }),

  setBossStaggered: (isBossStaggered) =>
    set((state) => ({
      isBossStaggered,
      bossPhaseSubtitle: isBossStaggered
        ? BOSS_CONFIG.staggerSubtitle
        : state.bossPhaseSubtitle,
    })),

  setCanExecuteFinisher: (canExecuteFinisher) => set({ canExecuteFinisher }),

  setChamberProgress: (
    chamberIndex,
    chamberServantsRemaining,
    chamberServantsTotal,
    isPortalUnlocked,
  ) =>
    set({
      chamberIndex,
      chamberServantsRemaining,
      chamberServantsTotal,
      isPortalUnlocked,
    }),

  setFinisherPose: (finisherPose) => set({ finisherPose }),
  setDrainThrottle: (drainThrottle) => set({ drainThrottle }),
  setEndlessSavor: (isEndlessSavor) => set({ isEndlessSavor }),
  enterEndlessSavor: () =>
    set({
      gameState: GAME_STATES.ENDLESS_SAVOR,
      isEndlessSavor: true,
      siphonProgress: FINISHER_CONFIG.endlessSavorLockedProgress,
      bossExpression: BOSS_EXPRESSIONS.SIPHON_KISS,
    }),
  exitEndlessSavor: () =>
    set({
      gameState: GAME_STATES.VICTORY_DIORAMA,
      isEndlessSavor: false,
      siphonProgress: FINISHER_CONFIG.endlessSavorLockedProgress,
      bossExpression: BOSS_EXPRESSIONS.DRAINED_FAINT,
    }),
  setAudioMuted: (audioMuted) => set({ audioMuted }),
  setAudioMode: (audioMode) => set({ audioMode }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),

  triggerFrostHitFlash: () =>
    set((state) => ({ frostHitFlashToken: state.frostHitFlashToken + 1 })),

  triggerReticlePulse: () =>
    set((state) => ({ reticlePulseToken: state.reticlePulseToken + 1 })),

  triggerTauntPop: () =>
    set((state) => ({ tauntPopToken: state.tauntPopToken + 1 })),

  syncCombatSnapshot: (snapshot) =>
    set((state) => ({
      playerHp: snapshot.playerHp ?? state.playerHp,
      playerMaxHp: snapshot.playerMaxHp ?? state.playerMaxHp,
      playerStamina: snapshot.playerStamina ?? state.playerStamina,
      playerMaxStamina: snapshot.playerMaxStamina ?? state.playerMaxStamina,
      dashCooldown: snapshot.dashCooldown ?? state.dashCooldown,
      pulseCooldown: snapshot.pulseCooldown ?? state.pulseCooldown,
      bossHp: snapshot.bossHp ?? state.bossHp,
      bossMaxHp: snapshot.bossMaxHp ?? state.bossMaxHp,
      siphonProgress: snapshot.siphonProgress ?? state.siphonProgress,
      tauntDizzyTimer: snapshot.tauntDizzyTimer ?? state.tauntDizzyTimer,
      canExecuteFinisher:
        snapshot.canExecuteFinisher ?? state.canExecuteFinisher,
    })),

  resetForDuel: (encoreTier) =>
    set((state) => {
      const nextTier = encoreTier ?? state.encoreTier;
      const scaledBossMaxHp = Math.round(
        BOSS_CONFIG.maxHp *
          Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, nextTier),
      );
      return {
        gameState: GAME_STATES.BOSS_COMBAT,
        encoreTier: nextTier,
        playerHp: PLAYER_CONFIG.maxHp,
        playerMaxHp: PLAYER_CONFIG.maxHp,
        playerStamina: PLAYER_CONFIG.maxStamina,
        playerMaxStamina: PLAYER_CONFIG.maxStamina,
        dashCooldown: 0,
        pulseCooldown: 0,
        bossHp: scaledBossMaxHp,
        bossMaxHp: scaledBossMaxHp,
        bossPhase: BOSS_PHASES.PHASE_1,
        bossPhaseSubtitle: BOSS_CONFIG.phase1.subtitle,
        bossExpression: BOSS_EXPRESSIONS.COMBAT,
        isBossStaggered: false,
        canExecuteFinisher: false,
        siphonProgress: 0,
        finisherPose: FINISHER_POSE_IDS.CHIN_LIFT,
        drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
        isEndlessSavor: false,
        tauntDizzyTimer: 0,
      };
    }),

  resetToTitle: () =>
    set((state) => ({
      ...INITIAL_STATE,
      audioMuted: state.audioMuted,
    })),
}));
