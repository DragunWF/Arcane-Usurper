import { create } from 'zustand';
import {
  AUDIO_CONFIG,
  AUDIO_MODES,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  CHAMBER_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_MODES,
  FINISHER_POSE_IDS,
  GAME_STATES,
  LOBBY_CONFIG,
  MIKU_CONFIG,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  PORTAL_STATES,
  REALM_IDS,
  SERENA_CONFIG,
  SIPHON_GALLERY_CONFIG,
  SPECIAL_SCENARIO_CONFIG,
  type AudioMode,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherMode,
  type FinisherPoseId,
  type GameState,
  type LobbyPromptKind,
  type PortalState,
  type RealmId,
} from '../config/gameConfig';

export interface LobbyPromptState {
  readonly kind: LobbyPromptKind;
  readonly title: string;
  readonly subtitle: string;
}

export interface LobbyDummyHitState {
  readonly damage: number;
  readonly isEncore: boolean;
  readonly timestamp: number;
}

function readInitialMarinaDefeated(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(LOBBY_CONFIG.marinaDefeatedStorageKey) ===
        'true'
    );
  } catch {
    return false;
  }
}

function persistMarinaDefeated(defeated: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        LOBBY_CONFIG.marinaDefeatedStorageKey,
        defeated ? 'true' : 'false',
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialMarinaCoreCharge(): number {
  try {
    if (typeof window === 'undefined') {
      return SIPHON_GALLERY_CONFIG.defaultCoreCharge;
    }
    const raw = window.localStorage.getItem(
      SIPHON_GALLERY_CONFIG.marinaCoreChargeStorageKey,
    );
    if (raw === null) {
      return SIPHON_GALLERY_CONFIG.defaultCoreCharge;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return SIPHON_GALLERY_CONFIG.defaultCoreCharge;
    }
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return SIPHON_GALLERY_CONFIG.defaultCoreCharge;
  }
}

function persistMarinaCoreCharge(charge: number): void {
  try {
    if (typeof window !== 'undefined') {
      const clamped = Math.max(0, Math.min(1, charge));
      window.localStorage.setItem(
        SIPHON_GALLERY_CONFIG.marinaCoreChargeStorageKey,
        clamped.toFixed(4),
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialSerenaDefeated(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(SERENA_CONFIG.defeatedStorageKey) === 'true'
    );
  } catch {
    return false;
  }
}

function persistSerenaDefeated(defeated: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SERENA_CONFIG.defeatedStorageKey,
        defeated ? 'true' : 'false',
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialSerenaCoreCharge(): number {
  try {
    if (typeof window === 'undefined') {
      return SERENA_CONFIG.defaultCoreCharge;
    }
    const raw = window.localStorage.getItem(SERENA_CONFIG.coreChargeStorageKey);
    if (raw === null) {
      return SERENA_CONFIG.defaultCoreCharge;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return SERENA_CONFIG.defaultCoreCharge;
    }
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return SERENA_CONFIG.defaultCoreCharge;
  }
}

function persistSerenaCoreCharge(charge: number): void {
  try {
    if (typeof window !== 'undefined') {
      const clamped = Math.max(0, Math.min(1, charge));
      window.localStorage.setItem(
        SERENA_CONFIG.coreChargeStorageKey,
        clamped.toFixed(4),
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialMikuDefeated(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(MIKU_CONFIG.defeatedStorageKey) === 'true'
    );
  } catch {
    return false;
  }
}

function persistMikuDefeated(defeated: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        MIKU_CONFIG.defeatedStorageKey,
        defeated ? 'true' : 'false',
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialMikuCoreCharge(): number {
  try {
    if (typeof window === 'undefined') {
      return MIKU_CONFIG.defaultCoreCharge;
    }
    const raw = window.localStorage.getItem(MIKU_CONFIG.coreChargeStorageKey);
    if (raw === null) {
      return MIKU_CONFIG.defaultCoreCharge;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return MIKU_CONFIG.defaultCoreCharge;
    }
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return MIKU_CONFIG.defaultCoreCharge;
  }
}

function persistMikuCoreCharge(charge: number): void {
  try {
    if (typeof window !== 'undefined') {
      const clamped = Math.max(0, Math.min(1, charge));
      window.localStorage.setItem(
        MIKU_CONFIG.coreChargeStorageKey,
        clamped.toFixed(4),
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialYenneferDefeated(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      window.localStorage.getItem(
        SPECIAL_SCENARIO_CONFIG.yenneferDefeatedStorageKey,
      ) === 'true'
    );
  } catch {
    return false;
  }
}

function persistYenneferDefeated(defeated: boolean): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SPECIAL_SCENARIO_CONFIG.yenneferDefeatedStorageKey,
        defeated ? 'true' : 'false',
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

function readInitialYenneferCoreCharge(): number {
  try {
    if (typeof window === 'undefined') {
      return SPECIAL_SCENARIO_CONFIG.guestPedestalDefaultCoreCharge;
    }
    const raw = window.localStorage.getItem(
      SPECIAL_SCENARIO_CONFIG.yenneferCoreChargeStorageKey,
    );
    if (raw === null) {
      return SPECIAL_SCENARIO_CONFIG.guestPedestalDefaultCoreCharge;
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return SPECIAL_SCENARIO_CONFIG.guestPedestalDefaultCoreCharge;
    }
    return Math.max(0, Math.min(1, parsed));
  } catch {
    return SPECIAL_SCENARIO_CONFIG.guestPedestalDefaultCoreCharge;
  }
}

function persistYenneferCoreCharge(charge: number): void {
  try {
    if (typeof window !== 'undefined') {
      const clamped = Math.max(0, Math.min(1, charge));
      window.localStorage.setItem(
        SPECIAL_SCENARIO_CONFIG.yenneferCoreChargeStorageKey,
        clamped.toFixed(4),
      );
    }
  } catch {
    // Ignore storage quota / sandboxed iframe restrictions
  }
}

export type LobbySiphonTargetId = 'marina' | 'serena' | 'miku' | 'yennefer';

export interface ActiveBossHudEntry {
  readonly entityId: number;
  readonly bossId: string;
  readonly displayName: string;
  readonly title: string;
  readonly hp: number;
  readonly maxHp: number;
  readonly phase: BossPhase;
  readonly canBeSiphoned: boolean;
  readonly isStaggered: boolean;
  readonly isDissolving: boolean;
  readonly isDefeated: boolean;
  readonly barAccentHex: string;
}

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
  activeBosses?: readonly ActiveBossHudEntry[];
  siphonProgress?: number;
  tauntDizzyTimer?: number;
  canExecuteFinisher?: boolean;
}

export interface GameStoreState {
  // Core Progression & State Machine
  gameState: GameState;
  realmId: RealmId;
  activeRealm: 1 | 2 | 3;
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

  // Obsidian Spire Sanctum (3D Hub Lobby) & Siphon Gallery Telemetry
  marinaDefeated: boolean;
  marinaCoreCharge: number;
  serenaDefeated: boolean;
  serenaCoreCharge: number;
  mikuDefeated: boolean;
  mikuCoreCharge: number;
  yenneferDefeated: boolean;
  yenneferCoreCharge: number;
  lobbySiphonTarget: LobbySiphonTargetId;
  lobbyPrompt: LobbyPromptState | null;
  lobbyDummyHit: LobbyDummyHitState | null;

  // Special Scenarios & Dynamic N-Boss Telemetry
  activeScenarioId: string | null;
  isScenarioSelectorOpen: boolean;
  activeBosses: readonly ActiveBossHudEntry[];

  // Royal Ice Chambers Progression Telemetry
  chamberWave: number;
  totalChamberWaves: number;
  servantsRemaining: number;
  portalState: PortalState;
  hasReachedSummit: boolean;
  isNearPortal: boolean;
  portalWarpProgress: number;

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
  isBossExposed: boolean;
  canExecuteStolenKiss: boolean;

  // Interactive Finisher & Diorama State
  siphonProgress: number;
  finisherMode: FinisherMode;
  finisherPose: FinisherPoseId;
  drainThrottle: DrainThrottleMode;
  throttleMode: DrainThrottleMode;
  isEndlessSavor: boolean;
  tauntPopToken: number;
  tauntTriggerCount: number;
  tauntDizzyTimer: number;

  // Audio, Pause & System Status
  isPaused: boolean;
  isFirstPersonGaze: boolean;
  musicVolume: number;
  sfxVolume: number;
  restartRequestToken: number;
  audioMuted: boolean;
  audioMode: AudioMode;
  errorMessage: string | null;

  // Actions
  setGameState: (gameState: GameState) => void;
  setRealmId: (realmId: RealmId) => void;
  setActiveRealm: (realm: 1 | 2 | 3) => void;
  setEncoreTier: (encoreTier: number) => void;
  incrementEncoreTier: () => void;
  setPointerLocked: (locked: boolean) => void;
  setPaused: (isPaused: boolean) => void;
  setFirstPersonGaze: (isFirstPersonGaze: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setSfxVolume: (volume: number) => void;
  triggerRestart: () => void;
  setBossIdentity: (id: string, displayName: string, title: string, maxHp: number) => void;
  setBossPhase: (phase: BossPhase, subtitle?: string) => void;
  setBossExpression: (expression: BossExpression) => void;
  setBossStaggered: (staggered: boolean) => void;
  setCanExecuteFinisher: (canExecute: boolean) => void;
  setBossExposed: (exposed: boolean) => void;
  setCanExecuteStolenKiss: (canExecute: boolean) => void;
  setChamberWaveProgress: (
    chamberWave: number,
    totalChamberWaves: number,
    servantsRemaining: number,
  ) => void;
  setPortalState: (portalState: PortalState) => void;
  setHasReachedSummit: (reached: boolean) => void;
  setNearPortal: (isNear: boolean) => void;
  setPortalWarpProgress: (progress: number) => void;
  resetChamberProgress: () => void;
  setMarinaDefeated: (val: boolean) => void;
  setMarinaCoreCharge: (charge: number) => void;
  addMarinaCoreCharge: (delta: number) => void;
  setSerenaDefeated: (val: boolean) => void;
  setSerenaCoreCharge: (charge: number) => void;
  addSerenaCoreCharge: (delta: number) => void;
  setMikuDefeated: (val: boolean) => void;
  setMikuCoreCharge: (charge: number) => void;
  addMikuCoreCharge: (delta: number) => void;
  setYenneferDefeated: (val: boolean) => void;
  setYenneferCoreCharge: (charge: number) => void;
  addYenneferCoreCharge: (delta: number) => void;
  setLobbySiphonTarget: (target: LobbySiphonTargetId) => void;
  setActiveScenarioId: (scenarioId: string | null) => void;
  setScenarioSelectorOpen: (open: boolean) => void;
  setActiveBosses: (bosses: readonly ActiveBossHudEntry[]) => void;
  setLobbyPrompt: (prompt: LobbyPromptState | null) => void;
  setLobbyDummyHit: (hit: LobbyDummyHitState | null) => void;
  setFinisherMode: (mode: FinisherMode) => void;
  setFinisherPose: (pose: FinisherPoseId) => void;
  setDrainThrottle: (mode: DrainThrottleMode) => void;
  setThrottleMode: (mode: DrainThrottleMode) => void;
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
  resetForDuel: (
    encoreTier?: number,
    bossMaxHpOverride?: number,
    phase1SubtitleOverride?: string,
  ) => void;
  resetToTitle: () => void;
}

function getSubtitleForPhase(phase: BossPhase, bossId?: string): string {
  if (bossId === SPECIAL_SCENARIO_CONFIG.yenneferId) {
    if (phase === BOSS_PHASES.PHASE_2)
      return SPECIAL_SCENARIO_CONFIG.yenneferPhase2Subtitle;
    if (phase === BOSS_PHASES.PHASE_3)
      return SPECIAL_SCENARIO_CONFIG.yenneferPhase3Subtitle;
    return SPECIAL_SCENARIO_CONFIG.yenneferPhase1Subtitle;
  }
  if (bossId === MIKU_CONFIG.id) {
    if (phase === BOSS_PHASES.PHASE_2) return MIKU_CONFIG.twinTailDash.subtitle;
    if (phase === BOSS_PHASES.PHASE_3) return MIKU_CONFIG.crescendoOverdrive.subtitle;
    return MIKU_CONFIG.reverberationArc.subtitle;
  }
  if (bossId === SERENA_CONFIG.id) {
    if (phase === BOSS_PHASES.PHASE_2) return SERENA_CONFIG.sirensChorale.subtitle;
    if (phase === BOSS_PHASES.PHASE_3) return SERENA_CONFIG.abyssalUndertow.subtitle;
    return SERENA_CONFIG.tidalSweep.subtitle;
  }
  if (phase === BOSS_PHASES.PHASE_2) return BOSS_CONFIG.phase2.subtitle;
  if (phase === BOSS_PHASES.PHASE_3) return BOSS_CONFIG.phase3.subtitle;
  return BOSS_CONFIG.phase1.subtitle;
}

const INITIAL_STATE = {
  gameState: GAME_STATES.TITLE as GameState,
  realmId: REALM_IDS.GLACIAL_SPIRE as RealmId,
  activeRealm: 1 as 1 | 2 | 3,
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

  marinaDefeated: readInitialMarinaDefeated(),
  marinaCoreCharge: readInitialMarinaCoreCharge(),
  serenaDefeated: readInitialSerenaDefeated(),
  serenaCoreCharge: readInitialSerenaCoreCharge(),
  mikuDefeated: readInitialMikuDefeated(),
  mikuCoreCharge: readInitialMikuCoreCharge(),
  yenneferDefeated: readInitialYenneferDefeated(),
  yenneferCoreCharge: readInitialYenneferCoreCharge(),
  lobbySiphonTarget: 'marina' as LobbySiphonTargetId,
  lobbyPrompt: null as LobbyPromptState | null,
  lobbyDummyHit: null as LobbyDummyHitState | null,

  activeScenarioId: null as string | null,
  isScenarioSelectorOpen: false,
  activeBosses: [] as readonly ActiveBossHudEntry[],

  chamberWave: 0,
  totalChamberWaves: CHAMBER_CONFIG.WAVES.length,
  servantsRemaining: 0,
  portalState: PORTAL_STATES.SEALED as PortalState,
  hasReachedSummit: false,
  isNearPortal: false,
  portalWarpProgress: 0,

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
  isBossExposed: false,
  canExecuteStolenKiss: false,

  siphonProgress: 0,
  finisherMode: FINISHER_MODES.KISS as FinisherMode,
  finisherPose: FINISHER_POSE_IDS.UPRIGHT_EMBRACE as FinisherPoseId,
  drainThrottle: DRAIN_THROTTLE_MODES.FLOW as DrainThrottleMode,
  throttleMode: DRAIN_THROTTLE_MODES.FLOW as DrainThrottleMode,
  isEndlessSavor: false,
  tauntPopToken: 0,
  tauntTriggerCount: 0,
  tauntDizzyTimer: 0,

  isPaused: false,
  isFirstPersonGaze: false,
  musicVolume: AUDIO_CONFIG.defaultMusicVolume,
  sfxVolume: AUDIO_CONFIG.defaultSfxVolume,
  restartRequestToken: 0,
  audioMuted: false,
  audioMode: AUDIO_MODES.SILENT as AudioMode,
  errorMessage: null as string | null,
};

export const useGameStore = create<GameStoreState>((set) => ({
  ...INITIAL_STATE,

  setGameState: (gameState) => set({ gameState }),
  setRealmId: (realmId) => set({ realmId }),
  setActiveRealm: (activeRealm) =>
    set({
      activeRealm,
      realmId:
        activeRealm === 3
          ? REALM_IDS.CYBER_CATHEDRAL
          : activeRealm === 2
            ? REALM_IDS.ABYSSAL_PALACE
            : REALM_IDS.GLACIAL_SPIRE,
    }),
  setEncoreTier: (encoreTier) => set({ encoreTier }),
  incrementEncoreTier: () =>
    set((state) => ({ encoreTier: state.encoreTier + 1 })),
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),
  setPaused: (isPaused) => set({ isPaused }),
  setFirstPersonGaze: (isFirstPersonGaze) => set({ isFirstPersonGaze }),
  setMusicVolume: (volume) =>
    set({ musicVolume: Math.max(0, Math.min(1, volume)) }),
  setSfxVolume: (volume) =>
    set({ sfxVolume: Math.max(0, Math.min(1, volume)) }),
  triggerRestart: () =>
    set((state) => ({
      isPaused: false,
      restartRequestToken: state.restartRequestToken + 1,
    })),

  setBossIdentity: (bossId, bossDisplayName, bossTitle, bossMaxHp) =>
    set({
      bossId,
      bossDisplayName,
      bossTitle,
      bossMaxHp,
      bossHp: bossMaxHp,
    }),

  setBossPhase: (bossPhase, subtitle) =>
    set((state) => ({
      bossPhase,
      bossPhaseSubtitle: subtitle ?? getSubtitleForPhase(bossPhase, state.bossId),
    })),

  setBossExpression: (bossExpression) => set({ bossExpression }),

  setBossStaggered: (isBossStaggered) =>
    set((state) => ({
      isBossStaggered,
      bossPhaseSubtitle: isBossStaggered
        ? BOSS_CONFIG.staggerSubtitle
        : state.bossPhaseSubtitle,
    })),

  setCanExecuteFinisher: (canExecuteFinisher) => set({ canExecuteFinisher }),
  setBossExposed: (isBossExposed) => set({ isBossExposed }),
  setCanExecuteStolenKiss: (canExecuteStolenKiss) =>
    set({ canExecuteStolenKiss }),

  setChamberWaveProgress: (chamberWave, totalChamberWaves, servantsRemaining) =>
    set({ chamberWave, totalChamberWaves, servantsRemaining }),
  setPortalState: (portalState) => set({ portalState }),
  setHasReachedSummit: (hasReachedSummit) => set({ hasReachedSummit }),
  setNearPortal: (isNearPortal) => set({ isNearPortal }),
  setPortalWarpProgress: (portalWarpProgress) =>
    set({ portalWarpProgress: Math.max(0, Math.min(1, portalWarpProgress)) }),
  resetChamberProgress: () =>
    set({
      chamberWave: 0,
      totalChamberWaves: CHAMBER_CONFIG.WAVES.length,
      servantsRemaining: 0,
      portalState: PORTAL_STATES.SEALED,
      hasReachedSummit: false,
      isNearPortal: false,
      portalWarpProgress: 0,
    }),

  setMarinaDefeated: (marinaDefeated) => {
    persistMarinaDefeated(marinaDefeated);
    set({ marinaDefeated });
  },
  setMarinaCoreCharge: (charge) => {
    const clamped = Math.max(0, Math.min(1, charge));
    persistMarinaCoreCharge(clamped);
    set({ marinaCoreCharge: clamped });
  },
  addMarinaCoreCharge: (delta) =>
    set((state) => {
      const clamped = Math.max(0, Math.min(1, state.marinaCoreCharge + delta));
      persistMarinaCoreCharge(clamped);
      return { marinaCoreCharge: clamped };
    }),
  setSerenaDefeated: (serenaDefeated) => {
    persistSerenaDefeated(serenaDefeated);
    set({ serenaDefeated });
  },
  setSerenaCoreCharge: (charge) => {
    const clamped = Math.max(0, Math.min(1, charge));
    persistSerenaCoreCharge(clamped);
    set({ serenaCoreCharge: clamped });
  },
  addSerenaCoreCharge: (delta) =>
    set((state) => {
      const clamped = Math.max(0, Math.min(1, state.serenaCoreCharge + delta));
      persistSerenaCoreCharge(clamped);
      return { serenaCoreCharge: clamped };
    }),
  setMikuDefeated: (mikuDefeated) => {
    persistMikuDefeated(mikuDefeated);
    set({ mikuDefeated });
  },
  setMikuCoreCharge: (charge) => {
    const clamped = Math.max(0, Math.min(1, charge));
    persistMikuCoreCharge(clamped);
    set({ mikuCoreCharge: clamped });
  },
  addMikuCoreCharge: (delta) =>
    set((state) => {
      const clamped = Math.max(0, Math.min(1, state.mikuCoreCharge + delta));
      persistMikuCoreCharge(clamped);
      return { mikuCoreCharge: clamped };
    }),
  setYenneferDefeated: (yenneferDefeated) => {
    persistYenneferDefeated(yenneferDefeated);
    set({ yenneferDefeated });
  },
  setYenneferCoreCharge: (charge) => {
    const clamped = Math.max(0, Math.min(1, charge));
    persistYenneferCoreCharge(clamped);
    set({ yenneferCoreCharge: clamped });
  },
  addYenneferCoreCharge: (delta) =>
    set((state) => {
      const clamped = Math.max(
        0,
        Math.min(1, state.yenneferCoreCharge + delta),
      );
      persistYenneferCoreCharge(clamped);
      return { yenneferCoreCharge: clamped };
    }),
  setLobbySiphonTarget: (lobbySiphonTarget) => set({ lobbySiphonTarget }),
  setActiveScenarioId: (activeScenarioId) => set({ activeScenarioId }),
  setScenarioSelectorOpen: (isScenarioSelectorOpen) =>
    set({ isScenarioSelectorOpen }),
  setActiveBosses: (activeBosses) => set({ activeBosses }),
  setLobbyPrompt: (lobbyPrompt) => set({ lobbyPrompt }),
  setLobbyDummyHit: (lobbyDummyHit) => set({ lobbyDummyHit }),

  setFinisherPose: (finisherPose) => set({ finisherPose }),
  setFinisherMode: (finisherMode) => set({ finisherMode }),
  setDrainThrottle: (drainThrottle) =>
    set({ drainThrottle, throttleMode: drainThrottle }),
  setThrottleMode: (throttleMode) =>
    set({ throttleMode, drainThrottle: throttleMode }),
  setEndlessSavor: (isEndlessSavor) => set({ isEndlessSavor }),
  enterEndlessSavor: () =>
    set({
      gameState: GAME_STATES.ENDLESS_SAVOR,
      finisherMode: FINISHER_MODES.KISS,
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
    set((state) => ({
      tauntPopToken: state.tauntPopToken + 1,
      tauntTriggerCount: state.tauntTriggerCount + 1,
    })),

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
      activeBosses: snapshot.activeBosses ?? state.activeBosses,
      siphonProgress: snapshot.siphonProgress ?? state.siphonProgress,
      tauntDizzyTimer: snapshot.tauntDizzyTimer ?? state.tauntDizzyTimer,
      canExecuteFinisher:
        snapshot.canExecuteFinisher ?? state.canExecuteFinisher,
    })),

  resetForDuel: (encoreTier, bossMaxHpOverride, phase1SubtitleOverride) =>
    set((state) => {
      const nextTier = encoreTier ?? state.encoreTier;
      const baseMaxHp =
        bossMaxHpOverride ??
        (state.activeRealm === 3
          ? MIKU_CONFIG.maxHp
          : state.activeRealm === 2
            ? SERENA_CONFIG.maxHp
            : BOSS_CONFIG.maxHp);
      const scaledBossMaxHp = Math.round(
        baseMaxHp *
          Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, nextTier),
      );
      const phase1Subtitle =
        phase1SubtitleOverride ??
        (state.activeRealm === 3
          ? MIKU_CONFIG.reverberationArc.subtitle
          : state.activeRealm === 2
            ? SERENA_CONFIG.tidalSweep.subtitle
            : BOSS_CONFIG.phase1.subtitle);
      return {
        gameState: GAME_STATES.BOSS_COMBAT,
        isPaused: false,
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
        bossPhaseSubtitle: phase1Subtitle,
        bossExpression: BOSS_EXPRESSIONS.COMBAT,
        isBossStaggered: false,
        canExecuteFinisher: false,
        isBossExposed: false,
        canExecuteStolenKiss: false,
        siphonProgress: 0,
        finisherMode: FINISHER_MODES.KISS,
        finisherPose: FINISHER_POSE_IDS.UPRIGHT_EMBRACE,
        drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
        throttleMode: DRAIN_THROTTLE_MODES.FLOW,
        isEndlessSavor: false,
        tauntDizzyTimer: 0,
      };
    }),

  resetToTitle: () =>
    set((state) => ({
      ...INITIAL_STATE,
      marinaDefeated: state.marinaDefeated,
      marinaCoreCharge: state.marinaCoreCharge,
      serenaDefeated: state.serenaDefeated,
      serenaCoreCharge: state.serenaCoreCharge,
      mikuDefeated: state.mikuDefeated,
      mikuCoreCharge: state.mikuCoreCharge,
      yenneferDefeated: state.yenneferDefeated,
      yenneferCoreCharge: state.yenneferCoreCharge,
      audioMuted: state.audioMuted,
      musicVolume: state.musicVolume,
      sfxVolume: state.sfxVolume,
    })),
}));
