import * as THREE from 'three';
import {
  ARENA_CONFIG,
  AUDIO_CONFIG,
  AUDIO_MODES,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  CAMERA_CONFIG,
  CHAMBER_CONFIG,
  DRAIN_THROTTLE_MODES,
  ENVIRONMENT_IDS,
  FINISHER_MODES,
  FINISHER_POSE_IDS,
  GAME_STATES,
  HARMONIC_CHAMBER_CONFIG,
  LOBBY_CONFIG,
  MIKU_CONFIG,
  NG_PLUS_CONFIG,
  PALETTE,
  PLAYER_CONFIG,
  SERENA_CONFIG,
  SIPHON_BEAM_CONFIG,
  SIPHON_GALLERY_CONFIG,
  SPECIAL_SCENARIO_CONFIG,
  SPECIAL_SCENARIOS,
  SUNKEN_CHAMBER_CONFIG,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherMode,
  type FinisherPoseId,
  type GameState,
  type SpecialScenarioRigKey,
} from '../config/gameConfig';
import type { EntityId } from '../ecs/components';
import { BossAISystem } from '../ecs/systems/BossAISystem';
import { ChamberSystem } from '../ecs/systems/ChamberSystem';
import { CombatSystem } from '../ecs/systems/CombatSystem';
import { DioramaSystem } from '../ecs/systems/DioramaSystem';
import { FinisherSystem } from '../ecs/systems/FinisherSystem';
import { InputSystem } from '../ecs/systems/InputSystem';
import { LobbySystem } from '../ecs/systems/LobbySystem';
import { MovementSystem } from '../ecs/systems/MovementSystem';
import { RenderSyncSystem } from '../ecs/systems/RenderSyncSystem';
import { ECSWorld } from '../ecs/World';
import { DarkMageRig } from '../rigs/DarkMageRig';
import type { BossRigAdapter } from '../rigs/bosses/BossBase';
import { GeraltRig } from '../rigs/bosses/GeraltRig';
import { MarinaRig } from '../rigs/bosses/MarinaRig';
import { MikuRig } from '../rigs/bosses/MikuRig';
import { SerenaRig } from '../rigs/bosses/SerenaRig';
import { YenneferRig } from '../rigs/bosses/YenneferRig';
import {
  useGameStore,
  type LobbySiphonTargetId,
} from '../state/useGameStore';
import { CameraRig, type ICameraTarget } from './CameraRig';
import { SceneManager } from './SceneManager';
import { SoundEngine } from './SoundEngine';
import { VfxFactory } from './VfxFactory';

/**
 * Narrow UI-facing controller contract (ISP & DIP) so React HUD components
 * trigger game actions without importing Three.js or ECS internals.
 */
export interface IGameController {
  startGame(): void;
  enterSanctum(): void;
  returnToSanctum(): void;
  triggerLobbyInteract(mode?: FinisherMode): void;
  openScenarioSelector(): void;
  closeScenarioSelector(): void;
  launchSpecialScenario(scenarioId: string): void;
  releaseLobbySiphon(): void;
  resetDuel(encoreTier?: number): void;
  setPaused(paused: boolean): void;
  resumeGame(): void;
  restartStage(): void;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  playSfxPreview(): void;
  toggleAudioMute(): void;
  triggerFinisher(mode?: FinisherMode): void;
  triggerStolenKiss(): void;
  triggerPortalAscend(): void;
  setFinisherPose(pose: FinisherPoseId): void;
  setDrainThrottle(mode: DrainThrottleMode | null): void;
  triggerTaunt(): void;
  pullUpForEndlessSavor(): void;
  layDownFromEndlessSavor(): void;
  enterEncoreStage(): void;
  retryStage(): void;
  triggerTouchBolt(): void;
  triggerTouchBlink(): void;
  triggerTouchPulse(): void;
  dispose(): void;
}

/**
 * Imperative 3D & ECS composition root owning the requestAnimationFrame loop,
 * SceneManager, CameraRig, SoundEngine, rigs, and all ECS simulation systems.
 * Zero React imports.
 */
export class GameEngine implements IGameController {
  private readonly world: ECSWorld;
  private readonly sceneManager: SceneManager;
  private readonly cameraRig: CameraRig;
  private readonly sound: SoundEngine;
  private readonly vfx: VfxFactory;
  private readonly mageRig: DarkMageRig;
  private readonly marinaRig: MarinaRig;
  private readonly serenaRig: SerenaRig;
  private readonly mikuRig: MikuRig;
  private readonly geraltRig: GeraltRig;
  private readonly yenneferRig: YenneferRig;
  private bossRig: BossRigAdapter;
  private readonly activeBossRigMap = new Map<EntityId, BossRigAdapter>();
  private activeScenarioId: string | null = null;
  private activeTargetBossEntityId: EntityId | null = null;
  private duoIntroTimer = 0;
  private readonly scratchIntroCamPos = new THREE.Vector3();
  private readonly scratchIntroLookAt = new THREE.Vector3();

  private readonly inputSystem: InputSystem;
  private readonly movementSystem: MovementSystem;
  private readonly lobbySystem: LobbySystem;
  private readonly chamberSystem: ChamberSystem;
  private readonly bossAISystem: BossAISystem;
  private readonly combatSystem: CombatSystem;
  private readonly finisherSystem: FinisherSystem;
  private readonly dioramaSystem: DioramaSystem;
  private readonly renderSyncSystem: RenderSyncSystem;

  private readonly clock = new THREE.Clock();
  private readonly unsubscribeEntityRemoved: () => void;
  private readonly unsubscribeStore: () => void;
  private readonly handleResize: () => void;

  private state: GameState = GAME_STATES.TITLE;
  private activeLobbySiphonTarget: LobbySiphonTargetId = 'marina';
  private isPaused = false;
  private rigHiddenByGaze = false;
  private lastAutoPauseTimestamp = 0;
  private lastRestartToken = 0;
  private elapsed = 0;
  private rafId: number | null = null;
  private isDisposed = false;

  // Reusable camera targets (zero per-frame GC allocations)
  private readonly playerCameraTarget: ICameraTarget = {
    position: new THREE.Vector3(),
    focusOffsetY: CAMERA_CONFIG.lookAtHeight,
  };
  private readonly titleCameraTarget: ICameraTarget = {
    position: new THREE.Vector3(),
    focusOffsetY: CAMERA_CONFIG.titleLookAtHeight,
  };
  private readonly orbitCameraTarget: ICameraTarget = {
    position: new THREE.Vector3(),
    focusOffsetY: 0,
  };
  private readonly scratchBeamMagePos = new THREE.Vector3();
  private readonly scratchBeamBossPos = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.world = new ECSWorld();
    this.sceneManager = new SceneManager(container);
    this.cameraRig = new CameraRig(this.sceneManager.domElement);
    this.cameraRig.attachOrbitRimLights(this.sceneManager.scene);
    this.sound = new SoundEngine();
    this.vfx = new VfxFactory(this.sceneManager.scene);

    this.mageRig = new DarkMageRig(this.sceneManager.scene);
    this.marinaRig = new MarinaRig(this.sceneManager.scene);
    this.serenaRig = new SerenaRig(this.sceneManager.scene);
    this.serenaRig.root.visible = false;
    this.mikuRig = new MikuRig(this.sceneManager.scene);
    this.mikuRig.root.visible = false;
    this.geraltRig = new GeraltRig(this.sceneManager.scene);
    this.geraltRig.root.visible = false;
    this.yenneferRig = new YenneferRig(this.sceneManager.scene);
    this.yenneferRig.root.visible = false;
    this.bossRig = this.marinaRig;

    // Automatic Three.js mesh disposal whenever an ECS projectile/hazard/clone/wisp is destroyed
    this.unsubscribeEntityRemoved = this.world.onEntityRemoved((entity) => {
      if (
        entity.meshRef &&
        entity.meshRef.object3D !== this.mageRig.root &&
        entity.meshRef.object3D !== this.marinaRig.root &&
        entity.meshRef.object3D !== this.serenaRig.root &&
        entity.meshRef.object3D !== this.mikuRig.root &&
        entity.meshRef.object3D !== this.geraltRig.root &&
        entity.meshRef.object3D !== this.yenneferRig.root &&
        !entity.meshRef.object3D.userData.managedByLevel &&
        !entity.meshRef.object3D.userData.managedByRig
      ) {
        this.vfx.detachAndDispose(entity.meshRef.object3D);
      }
    });

    // Sync PointerLock changes into Zustand HUD store & auto-pause if exited unexpectedly in active play
    this.cameraRig.onPointerLockChange = (locked) => {
      useGameStore.getState().setPointerLocked(locked);
      if (
        !locked &&
        !this.isPaused &&
        (this.state === GAME_STATES.LOBBY ||
          this.state === GAME_STATES.CHAMBER_COMBAT ||
          this.state === GAME_STATES.BOSS_COMBAT)
      ) {
        this.lastAutoPauseTimestamp = performance.now();
        this.setPaused(true);
      }
    };

    // Keep SoundEngine & pause/restart state synced if updated directly via useGameStore actions
    this.unsubscribeStore = useGameStore.subscribe((storeState) => {
      if (storeState.musicVolume !== this.sound.musicVolume) {
        this.sound.setMusicVolume(storeState.musicVolume);
      }
      if (storeState.sfxVolume !== this.sound.sfxVolume) {
        this.sound.setSfxVolume(storeState.sfxVolume);
      }
      if (storeState.restartRequestToken !== this.lastRestartToken) {
        this.lastRestartToken = storeState.restartRequestToken;
        this.restartStage();
      } else if (storeState.isPaused !== this.isPaused) {
        this.setPaused(storeState.isPaused);
      }
    });

    // Spawn core Player and Boss ECS entities
    this.spawnCoreEntities();

    // Instantiate decoupled ECS systems via narrow service interfaces
    this.inputSystem = new InputSystem(
      this.world,
      this.sceneManager.domElement,
      this.sound,
      {
        getGameState: () => this.state,
        isPaused: () => this.isPaused,
        isPointerLocked: () => this.cameraRig.isPointerLocked,
        requestPointerLock: () => this.cameraRig.requestLock(),
        onStartGame: () => this.enterSanctum(),
        onTogglePause: () => this.togglePause(),
        onToggleAudioMute: () => this.toggleAudioMute(),
        onQuickRetry: () => this.retryStage(),
      },
    );

    this.movementSystem = new MovementSystem(
      this.world,
      this.sceneManager,
      this.sound,
      this.vfx,
      this.mageRig,
      {
        getGameState: () => this.state,
        getCameraForwardXZ: (outVec) => this.cameraRig.getForwardXZ(outVec),
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        exitPointerLock: () => this.cameraRig.exitLock(),
        onStaggerProximityChange: (inRange) => {
          const store = useGameStore.getState();
          if (store.canExecuteFinisher !== inRange) {
            store.setCanExecuteFinisher(inRange);
          }
        },
        onFinisherApproachComplete: (mode, targetBossEntityId) =>
          this.startSiphonFinisher(mode, targetBossEntityId),
        isBossBlindspotExposed: (bossEntityId) => {
          if (bossEntityId !== undefined) {
            const rig = this.activeBossRigMap.get(bossEntityId);
            if (rig) return rig.exposureTimer > 0;
          }
          return this.bossRig.exposureTimer > 0;
        },
      },
    );

    this.lobbySystem = new LobbySystem(
      this.world,
      this.sceneManager.mageTowerLevel,
      this.mageRig,
      this.sound,
      this.vfx,
      {
        getGameState: () => this.state,
        onEnterRealm1: () => {
          this.activeScenarioId = null;
          useGameStore.getState().setActiveScenarioId(null);
          this.enterChambersRun(useGameStore.getState().encoreTier, 1);
          this.cameraRig.requestLock();
        },
        onEnterRealm2: () => {
          this.activeScenarioId = null;
          useGameStore.getState().setActiveScenarioId(null);
          this.enterChambersRun(useGameStore.getState().encoreTier, 2);
          this.cameraRig.requestLock();
        },
        onEnterRealm3: () => {
          this.activeScenarioId = null;
          useGameStore.getState().setActiveScenarioId(null);
          this.enterChambersRun(useGameStore.getState().encoreTier, 3);
          this.cameraRig.requestLock();
        },
        onOpenScenarioSelector: () => {
          this.openScenarioSelector();
        },
        onEnterLobbySiphon: (target, mode) => {
          this.enterLobbySiphon(target, mode);
        },
        onEncoreTierToggled: () => {
          this.renderSyncSystem.flushHudSnapshot();
        },
        onSyncGalleryUnlocked: (unlocked) => {
          this.sceneManager.setLobbyGalleryUnlocked(unlocked);
        },
      },
    );

    this.chamberSystem = new ChamberSystem(
      this.world,
      this.sceneManager.scene,
      this.sceneManager.icePalaceLevel,
      this.sceneManager,
      this.sound,
      this.vfx,
      {
        getGameState: () => this.state,
        setGameState: (next) => {
          this.state = next;
        },
        getEncoreTier: () => useGameStore.getState().encoreTier,
        getActiveRealm: () => useGameStore.getState().activeRealm,
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        onPlayerDamaged: (amount) => this.combatSystem.applyPlayerDamage(amount),
        onPlayerHealed: () => this.renderSyncSystem.flushHudSnapshot(),
        onPortalWarpStarted: () => {
          this.inputSystem.resetTransientInputs();
          this.clearAllCombatEntities();
        },
        onPortalWarpComplete: () => this.enterSummitFromPortal(),
      },
      this.sceneManager.sunkenAqueductLevel,
      this.sceneManager.cyberBackstageLevel,
    );

    this.bossAISystem = new BossAISystem(
      this.world,
      this.bossRig,
      this.sound,
      this.vfx,
      {
        getGameState: () => this.state,
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        onPhaseChanged: (phase) => this.handleBossPhaseChanged(phase),
        onStaggerTriggered: (bossEntityId) =>
          this.handleBossStaggered(bossEntityId),
      },
    );

    this.combatSystem = new CombatSystem(
      this.world,
      this.sceneManager,
      this.sound,
      this.vfx,
      this.mageRig,
      this.bossRig,
      {
        getGameState: () => this.state,
        getReticleTargetPoint: (outVec, bossPosition) =>
          this.cameraRig.getReticleTargetPoint(
            this.sceneManager,
            outVec,
            bossPosition,
          ),
        getCameraWorldDirection: (outVec) =>
          this.cameraRig.camera.getWorldDirection(outVec),
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        onReticlePulse: () => useGameStore.getState().triggerReticlePulse(),
        onPlayerDamaged: () => {
          useGameStore.getState().triggerFrostHitFlash();
          this.renderSyncSystem.flushHudSnapshot();
        },
        onPlayerDefeated: () => this.handlePlayerDefeated(),
        onBossDamaged: () => {
          this.bossAISystem.evaluateHealthThresholds();
          this.renderSyncSystem.flushHudSnapshot();
        },
        onServantHitFlash: (id) =>
          this.chamberSystem.triggerServantHitFlash(id),
        onServantGuardBreak: (id) =>
          this.chamberSystem.handleServantGuardBreak(id),
        onServantDefeated: (id) =>
          this.chamberSystem.handleServantDefeated(id),
        onUrnShattered: (origin, healValue) =>
          this.chamberSystem.handleUrnShattered(origin, healValue),
        onLobbyDummyHit: (damage, isEncore, hitPoint) =>
          this.lobbySystem.handleDummyHit(damage, isEncore, hitPoint),
        onLobbySealedPortalHit: (realmIndex, hitPoint) =>
          this.lobbySystem.handleSealedPortalHit(realmIndex, hitPoint),
        getCameraForwardXZ: (outVec) => this.cameraRig.getForwardXZ(outVec),
        onBossExposureChange: (exposed) =>
          useGameStore.getState().setBossExposed(exposed),
        onStolenKissAvailabilityChange: (available) =>
          useGameStore.getState().setCanExecuteStolenKiss(available),
        onTriggerStolenKiss: (bossEntityId) =>
          this.startStolenKiss(bossEntityId),
      },
    );

    this.finisherSystem = new FinisherSystem(
      this.world,
      this.sceneManager.scene,
      this.mageRig,
      this.bossRig,
      this.sound,
      this.vfx,
      {
        getGameState: () => this.state,
        onSiphonClimax: () => this.handleSiphonClimax(),
        onLobbyBeamComplete: () => this.releaseLobbySiphon(),
        onLobbyRelease: () => this.releaseLobbySiphon(),
        onEndlessSavorRelease: () => this.layDownFromEndlessSavor(),
        onStolenKissComplete: () => this.completeStolenKiss(),
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        onLobbySiphonTick: (charge, elapsed, targetId, tetherTension = 0) => {
          if (targetId === 'yennefer') {
            this.sceneManager.mageTowerLevel.updateYenneferLobbySiphonBackdrop(
              charge,
              elapsed,
              tetherTension,
            );
          } else if (targetId === 'serena') {
            this.sceneManager.mageTowerLevel.updateSerenaLobbySiphonBackdrop(
              charge,
              elapsed,
              tetherTension,
            );
          } else if (targetId === 'miku') {
            this.sceneManager.mageTowerLevel.updateMikuLobbySiphonBackdrop(
              charge,
              elapsed,
              tetherTension,
            );
          } else {
            this.sceneManager.mageTowerLevel.updateLobbySiphonBackdrop(
              charge,
              elapsed,
              tetherTension,
            );
          }
        },
      },
    );
    this.finisherSystem.setLobbyBossRig(
      this.sceneManager.mageTowerLevel.captiveMarinaRig,
    );

    this.dioramaSystem = new DioramaSystem(
      this.world,
      this.sceneManager.scene,
      this.mageRig,
      this.bossRig,
      this.sound,
      this.vfx,
      {
        getGameState: () => this.state,
        setGameState: (next) => {
          this.state = next;
        },
        exitPointerLock: () => this.cameraRig.exitLock(),
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        resetSphericalOrbit: (azimuth, elevation, distance) =>
          this.cameraRig.resetSphericalOrbit(azimuth, elevation, distance),
        clearAllCombatEntities: () => this.clearAllCombatEntities(),
        setAtmosphereStagger: () =>
          this.sceneManager.setPhaseAtmosphere('STAGGER'),
        setAtmosphereCombatP1: () =>
          this.sceneManager.setPhaseAtmosphere(BOSS_PHASES.PHASE_1),
      },
    );

    this.renderSyncSystem = new RenderSyncSystem(
      this.world,
      this.sceneManager,
      this.vfx,
      this.mageRig,
      this.bossRig,
      {
        getGameState: () => this.state,
        isFinisherApproaching: () => this.movementSystem.isFinisherApproaching,
      },
    );

    this.handleResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      this.sceneManager.resize(w, h);
      this.cameraRig.onResize(w, h);
    };
    window.addEventListener('resize', this.handleResize);

    // Sync initial store identity & mount live Obsidian Spire Sanctum backdrop for TITLE
    const store = useGameStore.getState();
    store.resetToTitle();
    store.setBossIdentity(
      this.bossRig.id,
      this.bossRig.displayName,
      this.bossRig.title,
      BOSS_CONFIG.maxHp,
    );
    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.LOBBY);
    this.bossRig.root.visible = false;
    this.positionPlayerInSanctum(store.encoreTier);
    this.lobbySystem.syncSanctumState();
    this.sound.setMode(AUDIO_MODES.LOBBY);
    store.setAudioMode(AUDIO_MODES.LOBBY);
    this.renderSyncSystem.flushHudSnapshot();
    this.startLoop();
  }

  private positionPlayerInSanctum(encoreTier: number): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerCombat',
    );
    if (player) {
      player.transform.position.x = LOBBY_CONFIG.playerSpawn.x;
      player.transform.position.y = LOBBY_CONFIG.playerSpawn.y;
      player.transform.position.z = LOBBY_CONFIG.playerSpawn.z;
      player.transform.rotationY = LOBBY_CONFIG.playerSpawnYaw;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
      player.health.current = PLAYER_CONFIG.maxHp;
      player.health.max = PLAYER_CONFIG.maxHp;
      player.health.invulnTimer = 0;
      player.health.isInvulnerable = false;
      player.stamina.current = PLAYER_CONFIG.maxStamina;
      player.playerCombat.dashTimer = 0;
      player.playerCombat.dashCooldown = 0;
      player.playerCombat.boltCooldown = 0;
      player.playerCombat.pulseCooldown = 0;
      player.playerCombat.aimFaceTimer = 0;
      player.playerCombat.encoreTier = encoreTier;
    }
    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(encoreTier);
    this.mageRig.root.position.set(
      LOBBY_CONFIG.playerSpawn.x,
      LOBBY_CONFIG.playerSpawn.y,
      LOBBY_CONFIG.playerSpawn.z,
    );
    this.mageRig.root.rotation.y = LOBBY_CONFIG.playerSpawnYaw;
  }

  private spawnCoreEntities(): void {
    // Player Entity (Dark Mage)
    this.world.createEntity({
      playerTag: { isPlayer: true },
      transform: {
        position: {
          x: PLAYER_CONFIG.spawnX,
          y: PLAYER_CONFIG.spawnY,
          z: PLAYER_CONFIG.spawnZ,
        },
        rotationY: PLAYER_CONFIG.spawnYaw,
        scale: 1,
      },
      velocity: { vx: 0, vy: 0, vz: 0, maxSpeed: PLAYER_CONFIG.moveSpeed },
      health: {
        current: PLAYER_CONFIG.maxHp,
        max: PLAYER_CONFIG.maxHp,
        invulnTimer: 0,
        isInvulnerable: false,
      },
      stamina: {
        current: PLAYER_CONFIG.maxStamina,
        max: PLAYER_CONFIG.maxStamina,
        regenRate: PLAYER_CONFIG.staminaRegen,
      },
      hurtbox: {
        radius: PLAYER_CONFIG.radius,
        minY: 0,
        maxY: 1.9,
        faction: 'PLAYER',
      },
      playerIntent: {
        moveForward: 0,
        moveRight: 0,
        primaryFireHeld: false,
        blinkRequested: false,
        pulseRequested: false,
        finisherExecuteRequested: false,
        beamFinisherExecuteRequested: false,
        stolenKissRequested: false,
        portalInteractRequested: false,
        tauntRequested: false,
        surgeTapRequested: false,
        releaseRequested: false,
        requestedPose: null,
        drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
        isFirstPersonGaze: false,
      },
      playerCombat: {
        dashTimer: 0,
        dashCooldown: 0,
        dashDirX: 0,
        dashDirZ: 1,
        afterimageTimer: 0,
        boltCooldown: 0,
        pulseCooldown: 0,
        aimFaceTimer: 0,
        encoreTier: 0,
      },
      meshRef: { object3D: this.mageRig.root },
    });

    // Sovereign Boss Entity (Marina)
    this.world.createEntity({
      transform: {
        position: {
          x: BOSS_CONFIG.spawnX,
          y: BOSS_CONFIG.spawnY,
          z: BOSS_CONFIG.spawnZ,
        },
        rotationY: BOSS_CONFIG.spawnYaw,
        scale: 1,
      },
      health: {
        current: BOSS_CONFIG.maxHp,
        max: BOSS_CONFIG.maxHp,
        invulnTimer: 0,
        isInvulnerable: false,
      },
      hurtbox: {
        radius: BOSS_CONFIG.hitRadius,
        minY: BOSS_CONFIG.hitMinY,
        maxY: BOSS_CONFIG.hitHeight + BOSS_CONFIG.floatHeight,
        faction: 'BOSS',
      },
      bossPhase: {
        bossId: this.bossRig.id,
        displayName: this.bossRig.displayName,
        title: this.bossRig.title,
        phase: BOSS_PHASES.PHASE_1,
        expression: BOSS_EXPRESSIONS.COMBAT,
        isStaggered: false,
        canBeSiphoned: true,
        isDefeated: false,
        dissolveTimer: -1,
        staggerThreshold: BOSS_CONFIG.staggerThreshold,
        guestPedestalIndex: null,
        barAccentHex: PALETTE.hex.frostRunes,
        orbitAngle: Math.PI,
        orbitDir: 1,
        orbitSwitchTimer: BOSS_CONFIG.phase1.orbitSwitchInitial,
        attackCooldown: BOSS_CONFIG.phase1.attackCooldownInitial,
        patternIndex: 0,
        activePatternId: null,
        activePatternElapsed: 0,
        activePatternDuration: 0,
        activePatternLaunched: false,
        activePatternFireTimer: 0,
        activePatternAngle: 0,
        pendingPhaseOpener: false,
        dashTimer: 0,
        dashVelX: 0,
        dashVelZ: 0,
        ascendHeight: 0,
      },
      siphonableBoss: {
        siphonProgress: 0,
        finisherPose: FINISHER_POSE_IDS.UPRIGHT_EMBRACE,
        finisherMode: FINISHER_MODES.KISS,
        drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
        isEndlessSavor: false,
        tauntDizzyTimer: 0,
        tauntCooldown: 0,
        finisherRange: BOSS_CONFIG.finisherRange,
      },
      meshRef: { object3D: this.bossRig.root },
    });
  }

  public startGame(): void {
    this.enterSanctum();
  }

  /**
   * Glides the camera smoothly behind the Dark Mage's shoulder from the live TITLE orbit
   * into the walkable Obsidian Spire Sanctum ('LOBBY').
   */
  public enterSanctum(): void {
    if (this.state !== GAME_STATES.TITLE) return;
    this.sound.unlock();
    this.isPaused = false;
    this.cameraRig.isPaused = false;
    this.state = GAME_STATES.LOBBY;

    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.LOBBY);
    this.bossRig.root.visible = false;
    this.sound.setMode(AUDIO_MODES.LOBBY);
    this.lobbySystem.syncSanctumState();
    this.cameraRig.startEnterLobbyGlide(LOBBY_CONFIG.enterGlideDuration);

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.LOBBY);
    store.setAudioMode(AUDIO_MODES.LOBBY);
    store.setPaused(false);
    this.renderSyncSystem.flushHudSnapshot();

    this.cameraRig.requestLock();
  }

  /**
   * Cleans up any active encounter/diorama and returns the Dark Mage to the walkable
   * Obsidian Spire Sanctum ('LOBBY') with PointerLock engaged.
   */
  public returnToSanctum(): void {
    this.sound.unlock();
    this.isPaused = false;
    this.cameraRig.isPaused = false;
    this.cameraRig.cancelEnterLobbyGlide();
    this.state = GAME_STATES.LOBBY;

    this.chamberSystem.cleanupChambers();
    this.clearAllCombatEntities();
    this.dioramaSystem.cleanupPuppetVisuals();
    this.finisherSystem.resetState();
    this.vfx.clearTransientVfx();
    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    this.activeScenarioId = null;
    this.activeTargetBossEntityId = null;
    const store = useGameStore.getState();
    store.setActiveScenarioId(null);
    store.setScenarioSelectorOpen(false);
    const tier = store.encoreTier;
    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.LOBBY);
    this.hideAllBossRigs();
    this.positionPlayerInSanctum(tier);
    this.lobbySystem.syncSanctumState();

    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.sound.setMode(AUDIO_MODES.LOBBY);

    store.setPaused(false);
    store.setGameState(GAME_STATES.LOBBY);
    store.setAudioMode(AUDIO_MODES.LOBBY);
    store.setLobbyDummyHit(null);
    this.renderSyncSystem.flushHudSnapshot();

    this.cameraRig.requestLock();
  }

  public triggerLobbyInteract(mode: FinisherMode = FINISHER_MODES.KISS): void {
    if (this.state === GAME_STATES.LOBBY) {
      this.sound.unlock();
      this.lobbySystem.executeActiveInteraction(mode);
    }
  }

  public openScenarioSelector(): void {
    this.sound.unlock();
    this.releaseFirstPersonGaze();
    this.isPaused = false;
    this.cameraRig.isPaused = true;
    this.inputSystem.resetTransientInputs();
    this.cameraRig.exitLock();
    const store = useGameStore.getState();
    store.setPaused(false);
    store.setScenarioSelectorOpen(true);
  }

  public closeScenarioSelector(): void {
    const store = useGameStore.getState();
    if (!store.isScenarioSelectorOpen) return;
    store.setScenarioSelectorOpen(false);
    this.cameraRig.isPaused = this.isPaused;
    this.inputSystem.resetTransientInputs();
    if (
      !this.isPaused &&
      (this.state === GAME_STATES.LOBBY ||
        this.state === GAME_STATES.BOSS_COMBAT ||
        this.state === GAME_STATES.CHAMBER_COMBAT)
    ) {
      this.cameraRig.requestLock();
    }
  }

  private getRigByKey(key: SpecialScenarioRigKey): BossRigAdapter {
    switch (key) {
      case 'geralt':
        return this.geraltRig;
      case 'yennefer':
        return this.yenneferRig;
      case 'serena':
        return this.serenaRig;
      case 'miku':
        return this.mikuRig;
      case 'marina':
      default:
        return this.marinaRig;
    }
  }

  private hideAllBossRigs(): void {
    this.marinaRig.root.visible = false;
    this.serenaRig.root.visible = false;
    this.mikuRig.root.visible = false;
    this.geraltRig.root.visible = false;
    this.yenneferRig.root.visible = false;
  }

  private syncBossRigsToSystems(): void {
    this.bossAISystem.setBossRig(this.bossRig);
    this.bossAISystem.setBossRigs(this.activeBossRigMap);
    this.combatSystem.setBossRig(this.bossRig);
    this.combatSystem.setBossRigs(this.activeBossRigMap);
    this.finisherSystem.setBossRig(this.bossRig);
    this.finisherSystem.setBossRigs(this.activeBossRigMap);
    this.dioramaSystem.setBossRig(this.bossRig);
    this.dioramaSystem.setBossRigs(this.activeBossRigMap);
    this.renderSyncSystem.setBossRig(this.bossRig);
    this.renderSyncSystem.setBossRigs(this.activeBossRigMap);
  }

  /**
   * Launches a multi-boss zero-minion Special Scenario (e.g., *The Wolf & The Raven*)
   * from the Sanctum Astral Rift Portal or Pause Menu quick-launch.
   */
  public launchSpecialScenario(scenarioId: string): void {
    const scenario = SPECIAL_SCENARIOS.find(
      (s) => s.id === scenarioId && s.unlocked && s.bosses.length > 0,
    );
    if (!scenario) return;

    this.sound.unlock();
    this.releaseFirstPersonGaze();
    this.isPaused = false;
    this.cameraRig.isPaused = false;
    this.cameraRig.cancelEnterLobbyGlide();
    this.state = GAME_STATES.BOSS_COMBAT;
    this.activeScenarioId = scenario.id;
    this.activeTargetBossEntityId = null;

    this.chamberSystem.cleanupChambers();
    this.clearAllCombatEntities();
    this.dioramaSystem.cleanupPuppetVisuals();
    this.finisherSystem.resetState();
    this.vfx.clearTransientVfx();
    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    // Destroy existing boss entities cleanly and spawn N dynamic scenario bosses
    const oldBosses = this.world.query('bossPhase');
    oldBosses.map((b) => b.id).forEach((id) => this.world.destroyEntity(id));
    this.activeBossRigMap.clear();
    this.hideAllBossRigs();

    const store = useGameStore.getState();
    const nextTier = store.encoreTier;
    const hpScale = Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, nextTier);

    let primarySiphonRig: BossRigAdapter = this.marinaRig;
    let primarySiphonEntityId: EntityId | null = null;
    let primaryMaxHp: number = BOSS_CONFIG.maxHp;

    for (let i = 0; i < scenario.bosses.length; i++) {
      const def = scenario.bosses[i];
      if (!def) continue;
      const rig = this.getRigByKey(def.rigKey);
      rig.resetForEncounter(nextTier);
      rig.root.visible = true;

      const scaledMaxHp = Math.round(def.maxHp * hpScale);
      const spawnX = BOSS_CONFIG.spawnX + def.spawnOffsetX;
      const spawnZ = BOSS_CONFIG.spawnZ + def.spawnOffsetZ;
      const orbitAngle =
        Math.PI + (i - (scenario.bosses.length - 1) * 0.5) * 0.72;

      const entity = this.world.createEntity({
        transform: {
          position: { x: spawnX, y: BOSS_CONFIG.spawnY, z: spawnZ },
          rotationY: BOSS_CONFIG.spawnYaw,
          scale: 1,
        },
        health: {
          current: scaledMaxHp,
          max: scaledMaxHp,
          invulnTimer: 0,
          isInvulnerable: false,
        },
        hurtbox: {
          radius: def.hitRadius,
          minY: BOSS_CONFIG.hitMinY,
          maxY: BOSS_CONFIG.hitHeight + BOSS_CONFIG.floatHeight,
          faction: 'BOSS',
        },
        bossPhase: {
          bossId: def.bossId,
          displayName: def.displayName,
          title: def.title,
          phase: BOSS_PHASES.PHASE_1,
          expression: BOSS_EXPRESSIONS.COMBAT,
          isStaggered: false,
          canBeSiphoned: def.canBeSiphoned,
          isDefeated: false,
          dissolveTimer: -1,
          staggerThreshold: 0,
          guestPedestalIndex: def.guestPedestalIndex,
          barAccentHex: def.barAccentHex,
          orbitAngle,
          orbitDir: i % 2 === 0 ? 1 : -1,
          orbitSwitchTimer: BOSS_CONFIG.phase1.orbitSwitchInitial + i * 0.6,
          attackCooldown: 1.45 + i * 0.75,
          patternIndex: i,
          activePatternId: null,
          activePatternElapsed: 0,
          activePatternDuration: 0,
          activePatternLaunched: false,
          activePatternFireTimer: 0,
          activePatternAngle: 0,
          pendingPhaseOpener: false,
          dashTimer: 0,
          dashVelX: 0,
          dashVelZ: 0,
          ascendHeight: 0,
        },
        ...(def.canBeSiphoned
          ? {
              siphonableBoss: {
                siphonProgress: 0,
                finisherPose: FINISHER_POSE_IDS.UPRIGHT_EMBRACE,
                finisherMode: FINISHER_MODES.KISS,
                drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
                isEndlessSavor: false,
                tauntDizzyTimer: 0,
                tauntCooldown: 0,
                finisherRange: BOSS_CONFIG.finisherRange,
              },
            }
          : {}),
        meshRef: { object3D: rig.root },
      });

      this.activeBossRigMap.set(entity.id, rig);
      if (def.canBeSiphoned && primarySiphonEntityId === null) {
        primarySiphonRig = rig;
        primarySiphonEntityId = entity.id;
        primaryMaxHp = def.maxHp;
      }
    }

    this.bossRig = primarySiphonRig;
    this.activeTargetBossEntityId = primarySiphonEntityId;
    this.syncBossRigsToSystems();
    this.finisherSystem.setTargetBossEntityId(primarySiphonEntityId);
    this.dioramaSystem.setTargetBossEntityId(primarySiphonEntityId);

    // Arena atmosphere: Skellige Obsidian Peak for 'skellige_peak' scenarios (zero minion stage)
    if (scenario.arenaId === 'skellige_peak') {
      this.sceneManager.setEnvironment(ENVIRONMENT_IDS.SKELLIGE_PEAK);
    } else {
      this.sceneManager.setEnvironment(ENVIRONMENT_IDS.SUMMIT);
      this.sceneManager.setPhaseAtmosphere(BOSS_PHASES.PHASE_2);
    }

    // Trigger dramatic side-by-side duo intro camera frame
    this.duoIntroTimer = SPECIAL_SCENARIO_CONFIG.duoIntroDurationSec;

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerCombat',
    );
    if (player) {
      player.transform.position.x = PLAYER_CONFIG.spawnX;
      player.transform.position.y = PLAYER_CONFIG.spawnY;
      player.transform.position.z = PLAYER_CONFIG.spawnZ;
      player.transform.rotationY = PLAYER_CONFIG.spawnYaw;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
      player.health.current = PLAYER_CONFIG.maxHp;
      player.health.max = PLAYER_CONFIG.maxHp;
      player.health.invulnTimer = 0;
      player.health.isInvulnerable = false;
      player.stamina.current = PLAYER_CONFIG.maxStamina;
      player.playerCombat.dashTimer = 0;
      player.playerCombat.dashCooldown = 0;
      player.playerCombat.boltCooldown = 0;
      player.playerCombat.pulseCooldown = 0;
      player.playerCombat.aimFaceTimer = 0;
      player.playerCombat.encoreTier = nextTier;
    }

    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(nextTier);
    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.sound.setMode(AUDIO_MODES.COMBAT_P2);

    store.setScenarioSelectorOpen(false);
    store.setActiveScenarioId(scenario.id);
    store.setHasReachedSummit(true);
    store.setBossIdentity(
      primarySiphonRig.id,
      primarySiphonRig.displayName,
      primarySiphonRig.title,
      Math.round(primaryMaxHp * hpScale),
    );
    store.resetForDuel(
      nextTier,
      primaryMaxHp,
      SPECIAL_SCENARIO_CONFIG.yenneferPhase1Subtitle,
    );
    store.setAudioMode(AUDIO_MODES.COMBAT_P2);
    this.renderSyncSystem.flushHudSnapshot();
    this.cameraRig.requestLock();
  }

  /**
   * Swaps the active sovereign BossRigAdapter cleanly for Realm I (Marina), Realm II (Serena),
   * or Realm III (Miku), restoring a single primary boss entity when returning from multi-boss scenarios.
   */
  private activateBossForRealm(
    realm: 1 | 2 | 3,
    encoreTier: number,
  ): BossRigAdapter {
    const isRealm2 = realm === 2;
    const isRealm3 = realm === 3;
    const nextRig: BossRigAdapter = isRealm3
      ? this.mikuRig
      : isRealm2
        ? this.serenaRig
        : this.marinaRig;

    this.hideAllBossRigs();
    this.bossRig = nextRig;
    this.activeBossRigMap.clear();

    const baseMaxHp = isRealm3
      ? MIKU_CONFIG.maxHp
      : isRealm2
        ? SERENA_CONFIG.maxHp
        : BOSS_CONFIG.maxHp;
    const scaledMaxHp = Math.round(
      baseMaxHp * Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, encoreTier),
    );

    // Ensure exactly 1 single-realm boss entity exists (cleans up multi-boss Special Scenario leftovers)
    const existingBosses = this.world.query('bossPhase');
    let primaryBoss = existingBosses.find((b) => b.siphonableBoss !== undefined);
    for (let i = 0; i < existingBosses.length; i++) {
      const b = existingBosses[i];
      if (b && b !== primaryBoss) {
        this.world.destroyEntity(b.id);
      }
    }

    if (!primaryBoss) {
      primaryBoss = this.world.createEntity({
        transform: {
          position: {
            x: BOSS_CONFIG.spawnX,
            y: BOSS_CONFIG.spawnY,
            z: BOSS_CONFIG.spawnZ,
          },
          rotationY: BOSS_CONFIG.spawnYaw,
          scale: 1,
        },
        health: {
          current: scaledMaxHp,
          max: scaledMaxHp,
          invulnTimer: 0,
          isInvulnerable: false,
        },
        hurtbox: {
          radius: BOSS_CONFIG.hitRadius,
          minY: BOSS_CONFIG.hitMinY,
          maxY: BOSS_CONFIG.hitHeight + BOSS_CONFIG.floatHeight,
          faction: 'BOSS',
        },
        bossPhase: {
          bossId: nextRig.id,
          displayName: nextRig.displayName,
          title: nextRig.title,
          phase: BOSS_PHASES.PHASE_1,
          expression: BOSS_EXPRESSIONS.COMBAT,
          isStaggered: false,
          canBeSiphoned: true,
          isDefeated: false,
          dissolveTimer: -1,
          staggerThreshold: BOSS_CONFIG.staggerThreshold,
          guestPedestalIndex: null,
          barAccentHex: PALETTE.hex.frostRunes,
          orbitAngle: Math.PI,
          orbitDir: 1,
          orbitSwitchTimer: BOSS_CONFIG.phase1.orbitSwitchInitial,
          attackCooldown: BOSS_CONFIG.phase1.attackCooldownInitial,
          patternIndex: 0,
          activePatternId: null,
          activePatternElapsed: 0,
          activePatternDuration: 0,
          activePatternLaunched: false,
          activePatternFireTimer: 0,
          activePatternAngle: 0,
          pendingPhaseOpener: false,
          dashTimer: 0,
          dashVelX: 0,
          dashVelZ: 0,
          ascendHeight: 0,
        },
        siphonableBoss: {
          siphonProgress: 0,
          finisherPose: FINISHER_POSE_IDS.UPRIGHT_EMBRACE,
          finisherMode: FINISHER_MODES.KISS,
          drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
          isEndlessSavor: false,
          tauntDizzyTimer: 0,
          tauntCooldown: 0,
          finisherRange: BOSS_CONFIG.finisherRange,
        },
        meshRef: { object3D: nextRig.root },
      });
    }

    if (primaryBoss.bossPhase && primaryBoss.hurtbox && primaryBoss.meshRef) {
      primaryBoss.bossPhase.bossId = nextRig.id;
      primaryBoss.bossPhase.displayName = nextRig.displayName;
      primaryBoss.bossPhase.title = nextRig.title;
      primaryBoss.bossPhase.canBeSiphoned = true;
      primaryBoss.bossPhase.isDefeated = false;
      primaryBoss.bossPhase.dissolveTimer = -1;
      primaryBoss.bossPhase.staggerThreshold = isRealm3
        ? MIKU_CONFIG.staggerHpThreshold
        : isRealm2
          ? SERENA_CONFIG.staggerHpThreshold
          : BOSS_CONFIG.staggerThreshold;
      primaryBoss.bossPhase.guestPedestalIndex = null;
      primaryBoss.bossPhase.barAccentHex = isRealm3
        ? PALETTE.hex.harmonicEmerald
        : isRealm2
          ? PALETTE.hex.biolumCyan
          : PALETTE.hex.frostRunes;
      primaryBoss.hurtbox.radius = isRealm3
        ? MIKU_CONFIG.hitRadius
        : isRealm2
          ? SERENA_CONFIG.hitRadius
          : BOSS_CONFIG.hitRadius;
      primaryBoss.meshRef.object3D = nextRig.root;
    }

    this.activeBossRigMap.set(primaryBoss.id, nextRig);
    this.activeTargetBossEntityId = primaryBoss.id;
    this.syncBossRigsToSystems();
    this.finisherSystem.setTargetBossEntityId(primaryBoss.id);
    this.dioramaSystem.setTargetBossEntityId(primaryBoss.id);

    useGameStore
      .getState()
      .setBossIdentity(
        nextRig.id,
        nextRig.displayName,
        nextRig.title,
        scaledMaxHp,
      );

    return nextRig;
  }

  /**
   * Launches a fresh Chamber gauntlet (Wave 1) in Realm I (`CHAMBER`), Realm II (`SUNKEN_CHAMBER`),
   * or Realm III (`HARMONIC_CHAMBER`) with `hasReachedSummit = false`.
   */
  public enterChambersRun(
    encoreTier: number,
    realm: 1 | 2 | 3 = useGameStore.getState().activeRealm,
  ): void {
    this.sound.unlock();
    this.isPaused = false;
    this.cameraRig.isPaused = false;
    this.state = GAME_STATES.CHAMBER_COMBAT;

    this.clearAllCombatEntities();
    this.dioramaSystem.cleanupPuppetVisuals();
    this.finisherSystem.resetState();
    this.vfx.clearTransientVfx();
    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    const isRealm2 = realm === 2;
    const isRealm3 = realm === 3;
    this.activateBossForRealm(realm, encoreTier);
    this.sceneManager.setEnvironment(
      isRealm3
        ? ENVIRONMENT_IDS.HARMONIC_CHAMBER
        : isRealm2
          ? ENVIRONMENT_IDS.SUNKEN_CHAMBER
          : ENVIRONMENT_IDS.CHAMBER,
    );
    this.chamberSystem.setActiveLevel(
      isRealm3
        ? this.sceneManager.cyberBackstageLevel
        : isRealm2
          ? this.sceneManager.sunkenAqueductLevel
          : this.sceneManager.icePalaceLevel,
      realm,
    );
    this.marinaRig.root.visible = false;
    this.serenaRig.root.visible = false;
    this.mikuRig.root.visible = false;

    const spawnX = isRealm3
      ? HARMONIC_CHAMBER_CONFIG.playerSpawnX
      : isRealm2
        ? SUNKEN_CHAMBER_CONFIG.playerSpawnX
        : CHAMBER_CONFIG.playerSpawnX;
    const spawnZ = isRealm3
      ? HARMONIC_CHAMBER_CONFIG.playerSpawnZ
      : isRealm2
        ? SUNKEN_CHAMBER_CONFIG.playerSpawnZ
        : CHAMBER_CONFIG.playerSpawnZ;
    const spawnYaw = isRealm3
      ? HARMONIC_CHAMBER_CONFIG.playerSpawnYaw
      : isRealm2
        ? SUNKEN_CHAMBER_CONFIG.playerSpawnYaw
        : CHAMBER_CONFIG.playerSpawnYaw;

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerCombat',
    );
    if (player) {
      player.transform.position.x = spawnX;
      player.transform.position.y = 0;
      player.transform.position.z = spawnZ;
      player.transform.rotationY = spawnYaw;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
      player.health.current = PLAYER_CONFIG.maxHp;
      player.health.max = PLAYER_CONFIG.maxHp;
      player.health.invulnTimer = 0;
      player.health.isInvulnerable = false;
      player.stamina.current = PLAYER_CONFIG.maxStamina;
      player.playerCombat.dashTimer = 0;
      player.playerCombat.dashCooldown = 0;
      player.playerCombat.boltCooldown = 0;
      player.playerCombat.pulseCooldown = 0;
      player.playerCombat.aimFaceTimer = 0;
      player.playerCombat.encoreTier = encoreTier;
    }

    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(encoreTier);
    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );

    const nextAudioMode = isRealm3
      ? AUDIO_MODES.HARMONIC_CHAMBER
      : isRealm2
        ? AUDIO_MODES.SUNKEN_CHAMBER
        : AUDIO_MODES.CHAMBER;
    const store = useGameStore.getState();
    store.setActiveRealm(realm);
    store.setEncoreTier(encoreTier);
    store.setHasReachedSummit(false);
    store.setPaused(false);
    store.setGameState(GAME_STATES.CHAMBER_COMBAT);
    store.setAudioMode(nextAudioMode);

    this.sound.setMode(nextAudioMode);
    this.chamberSystem.enterChambers(encoreTier, realm);
    this.renderSyncSystem.flushHudSnapshot();
  }

  /**
   * Transitions from the ignited Astral Portal warp directly to Marina's Summit arena,
   * locking the Summit Checkpoint (`hasReachedSummit = true`) and carrying over player HP
   * with a minimum 40% safety floor.
   */
  private enterSummitFromPortal(): void {
    const player = this.world.queryFirst('playerTag', 'health');
    const carryoverHp = player
      ? Math.max(
          player.health.current,
          Math.ceil(
            player.health.max * CHAMBER_CONFIG.summitCarryoverMinHpRatio,
          ),
        )
      : PLAYER_CONFIG.maxHp;
    const tier = useGameStore.getState().encoreTier;

    useGameStore.getState().setHasReachedSummit(true);
    this.resetDuel(tier, carryoverHp);
    this.cameraRig.requestLock();
  }

  public toggleAudioMute(): void {
    this.sound.unlock();
    const muted = this.sound.toggleMute();
    useGameStore.getState().setAudioMuted(muted);
  }

  public setMusicVolume(volume: number): void {
    this.sound.unlock();
    this.sound.setMusicVolume(volume);
    useGameStore.getState().setMusicVolume(this.sound.musicVolume);
  }

  public setSfxVolume(volume: number): void {
    this.sound.unlock();
    this.sound.setSfxVolume(volume);
    useGameStore.getState().setSfxVolume(this.sound.sfxVolume);
  }

  public playSfxPreview(): void {
    this.sound.playPreviewChime();
  }

  private togglePause(): void {
    if (this.state === GAME_STATES.TITLE) return;
    if (
      this.isPaused &&
      performance.now() - this.lastAutoPauseTimestamp <
        AUDIO_CONFIG.pauseToggleGuardMs
    ) {
      return;
    }
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.setPaused(true);
    }
  }

  public setPaused(paused: boolean): void {
    if (this.state === GAME_STATES.TITLE && paused) return;
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.cameraRig.isPaused = paused;
    this.inputSystem.resetTransientInputs();

    if (paused) {
      this.releaseFirstPersonGaze();
      this.sound.stopLaserLoop();
      this.cameraRig.exitLock();
    } else {
      // Discard accumulated pause elapsed time on clock
      this.clock.getDelta();
    }

    const store = useGameStore.getState();
    if (store.isPaused !== paused) {
      store.setPaused(paused);
    }
  }

  public resumeGame(): void {
    this.sound.unlock();
    this.setPaused(false);
    if (
      this.state === GAME_STATES.LOBBY ||
      this.state === GAME_STATES.CHAMBER_COMBAT ||
      this.state === GAME_STATES.BOSS_COMBAT
    ) {
      this.cameraRig.requestLock();
    }
  }

  public restartStage(): void {
    this.sound.unlock();
    this.setPaused(false);
    const store = useGameStore.getState();
    const shouldStartAtSummit =
      this.state === GAME_STATES.BOSS_COMBAT ||
      this.state === GAME_STATES.STAGGER ||
      (this.state !== GAME_STATES.CHAMBER_COMBAT && store.hasReachedSummit);

    if (shouldStartAtSummit) {
      this.resetDuel(store.encoreTier);
    } else {
      this.enterChambersRun(store.encoreTier);
    }
    this.cameraRig.requestLock();
  }

  public triggerFinisher(mode: FinisherMode = FINISHER_MODES.KISS): void {
    if (this.state === GAME_STATES.STAGGER) {
      if (mode === FINISHER_MODES.BEAM) {
        this.inputSystem.queueBeamFinisherExecute();
      } else {
        this.inputSystem.queueFinisherExecute();
      }
    }
  }

  public triggerStolenKiss(): void {
    if (this.state === GAME_STATES.BOSS_COMBAT) {
      this.inputSystem.queueStolenKiss();
    }
  }

  /**
   * Transitions from BOSS_COMBAT into the 3-beat Mid-Fight 360° Frontal Guard-Break
   * Stolen Kiss when triggered within maxTriggerDistance during the Sovereign's exposure window.
   */
  private startStolenKiss(bossEntityId?: EntityId): void {
    if (this.state !== GAME_STATES.BOSS_COMBAT) return;
    this.releaseFirstPersonGaze();
    const resolvedId =
      bossEntityId ??
      this.combatSystem.getEligibleStolenKissBossId() ??
      this.activeTargetBossEntityId ??
      undefined;
    if (resolvedId !== undefined) {
      this.activeTargetBossEntityId = resolvedId;
      const rig = this.activeBossRigMap.get(resolvedId);
      if (rig) this.bossRig = rig;
      this.finisherSystem.setTargetBossEntityId(resolvedId);
    }

    this.state = GAME_STATES.STOLEN_KISS;
    this.inputSystem.resetTransientInputs();
    this.bossAISystem.clearAllBossHazards();

    const store = useGameStore.getState();
    store.setBossExposed(false);
    store.setCanExecuteStolenKiss(false);
    store.setGameState(GAME_STATES.STOLEN_KISS);

    this.finisherSystem.startStolenKiss(resolvedId);
  }

  /**
   * Restores third-person BOSS_COMBAT cleanly after the Beat 3 breakaway push & shockwave.
   */
  private completeStolenKiss(): void {
    if (this.state !== GAME_STATES.STOLEN_KISS) return;
    this.state = GAME_STATES.BOSS_COMBAT;
    this.inputSystem.resetTransientInputs();
    this.mageRig.resetCombatPose();
    this.bossRig.setExpression(BOSS_EXPRESSIONS.COMBAT);

    const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
    const boss = this.world.queryFirst('bossPhase', 'transform');
    if (player) {
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
      if (boss) {
        const yawToBoss = Math.atan2(
          boss.transform.position.x - player.transform.position.x,
          boss.transform.position.z - player.transform.position.z,
        );
        player.transform.rotationY = yawToBoss;
        this.cameraRig.setCombatAngles(
          yawToBoss + Math.PI,
          CAMERA_CONFIG.combatInitialPitch,
        );
      }
    }

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.BOSS_COMBAT);
    store.setBossExposed(false);
    store.setCanExecuteStolenKiss(false);
    this.renderSyncSystem.flushHudSnapshot();
    this.bossAISystem.evaluateHealthThresholds();
  }

  public triggerPortalAscend(): void {
    if (this.state === GAME_STATES.CHAMBER_COMBAT) {
      this.chamberSystem.startPortalTransition();
    }
  }

  public setFinisherPose(pose: FinisherPoseId): void {
    this.sound.unlock();
    this.finisherSystem.setPose(pose);
  }

  public setDrainThrottle(mode: DrainThrottleMode | null): void {
    this.sound.unlock();
    this.finisherSystem.setUiDrainThrottle(mode);
  }

  public triggerTaunt(): void {
    this.sound.unlock();
    this.finisherSystem.triggerTaunt();
  }

  public pullUpForEndlessSavor(): void {
    this.sound.unlock();
    if (this.state === GAME_STATES.VICTORY_DIORAMA) {
      this.dioramaSystem.enterEndlessSavor();
    }
  }

  public layDownFromEndlessSavor(): void {
    this.sound.unlock();
    if (
      this.state === GAME_STATES.ENDLESS_SAVOR ||
      this.state === GAME_STATES.SIPHON_FINISHER
    ) {
      this.finisherSystem.hideVisuals();
      this.dioramaSystem.exitEndlessSavor();
    }
  }

  public enterEncoreStage(): void {
    this.sound.unlock();
    const nextTier = useGameStore.getState().encoreTier + 1;
    useGameStore.getState().setEncoreTier(nextTier);
    if (this.activeScenarioId) {
      this.launchSpecialScenario(this.activeScenarioId);
      return;
    }
    useGameStore.getState().setHasReachedSummit(false);
    this.enterChambersRun(nextTier);
    this.cameraRig.requestLock();
  }

  public retryStage(): void {
    this.sound.unlock();
    if (this.activeScenarioId) {
      this.launchSpecialScenario(this.activeScenarioId);
      return;
    }
    const store = useGameStore.getState();
    if (store.hasReachedSummit) {
      this.resetDuel(store.encoreTier);
    } else {
      this.enterChambersRun(store.encoreTier);
    }
    this.cameraRig.requestLock();
  }

  private clearAllCombatEntities(): void {
    this.bossAISystem.clearAllBossHazards();
    const playerProjectiles = this.world.query('projectile');
    const pIds = playerProjectiles.map((e) => e.id);
    pIds.forEach((id) => this.world.destroyEntity(id));
    const playerHazards = this.world.query('hazardZone');
    const hIds = playerHazards.map((e) => e.id);
    hIds.forEach((id) => this.world.destroyEntity(id));
  }

  public triggerTouchBolt(): void {
    this.sound.unlock();
    if (
      this.state === GAME_STATES.BOSS_COMBAT ||
      this.state === GAME_STATES.CHAMBER_COMBAT
    ) {
      this.inputSystem.triggerSingleShotFire();
    }
  }

  public triggerTouchBlink(): void {
    this.sound.unlock();
    if (
      this.state === GAME_STATES.BOSS_COMBAT ||
      this.state === GAME_STATES.CHAMBER_COMBAT ||
      this.state === GAME_STATES.STAGGER
    ) {
      this.inputSystem.queueBlink();
    }
  }

  public triggerTouchPulse(): void {
    this.sound.unlock();
    if (
      this.state === GAME_STATES.BOSS_COMBAT ||
      this.state === GAME_STATES.CHAMBER_COMBAT
    ) {
      this.inputSystem.queuePulse();
    }
  }

  public resetDuel(encoreTier?: number, carryoverPlayerHp?: number): void {
    this.sound.unlock();
    this.isPaused = false;
    this.cameraRig.isPaused = false;
    this.state = GAME_STATES.BOSS_COMBAT;

    // Clear all chamber entities, projectiles, hazards, clones, diorama props & transient particles
    this.chamberSystem.cleanupChambers();
    this.clearAllCombatEntities();
    this.dioramaSystem.cleanupPuppetVisuals();
    this.finisherSystem.resetState();
    this.vfx.clearTransientVfx();

    const activeRealm = useGameStore.getState().activeRealm;
    const isRealm2 = activeRealm === 2;
    const isRealm3 = activeRealm === 3;
    const nextTier = encoreTier ?? useGameStore.getState().encoreTier;
    this.activateBossForRealm(activeRealm, nextTier);
    this.sceneManager.setEnvironment(
      isRealm3
        ? ENVIRONMENT_IDS.HARMONIC_SUMMIT
        : isRealm2
          ? ENVIRONMENT_IDS.SUNKEN_SUMMIT
          : ENVIRONMENT_IDS.SUMMIT,
    );
    this.bossRig.root.visible = true;

    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    const baseBossMaxHp = isRealm3
      ? MIKU_CONFIG.maxHp
      : isRealm2
        ? SERENA_CONFIG.maxHp
        : BOSS_CONFIG.maxHp;
    const scaledBossMaxHp = Math.round(
      baseBossMaxHp *
        Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, nextTier),
    );
    const startingPlayerHp =
      carryoverPlayerHp !== undefined
        ? Math.min(PLAYER_CONFIG.maxHp, Math.max(1, carryoverPlayerHp))
        : PLAYER_CONFIG.maxHp;

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerCombat',
    );
    if (player) {
      player.transform.position.x = PLAYER_CONFIG.spawnX;
      player.transform.position.y = PLAYER_CONFIG.spawnY;
      player.transform.position.z = PLAYER_CONFIG.spawnZ;
      player.transform.rotationY = PLAYER_CONFIG.spawnYaw;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
      player.health.current = startingPlayerHp;
      player.health.max = PLAYER_CONFIG.maxHp;
      player.health.invulnTimer = 0;
      player.health.isInvulnerable = false;
      player.stamina.current = PLAYER_CONFIG.maxStamina;
      player.playerCombat.dashTimer = 0;
      player.playerCombat.dashCooldown = 0;
      player.playerCombat.boltCooldown = 0;
      player.playerCombat.pulseCooldown = 0;
      player.playerCombat.aimFaceTimer = 0;
      player.playerCombat.encoreTier = nextTier;
    }

    const boss = this.world.queryFirst(
      'bossPhase',
      'siphonableBoss',
      'transform',
      'health',
    );
    if (boss) {
      boss.transform.position.x = BOSS_CONFIG.spawnX;
      boss.transform.position.y = BOSS_CONFIG.spawnY;
      boss.transform.position.z = BOSS_CONFIG.spawnZ;
      boss.transform.rotationY = BOSS_CONFIG.spawnYaw;
      boss.health.current = scaledBossMaxHp;
      boss.health.max = scaledBossMaxHp;
      boss.bossPhase.phase = BOSS_PHASES.PHASE_1;
      boss.bossPhase.expression = BOSS_EXPRESSIONS.COMBAT;
      boss.bossPhase.isStaggered = false;
      boss.bossPhase.orbitAngle = Math.PI;
      boss.bossPhase.orbitDir = 1;
      boss.bossPhase.orbitSwitchTimer = BOSS_CONFIG.phase1.orbitSwitchInitial;
      boss.bossPhase.attackCooldown = BOSS_CONFIG.phase1.attackCooldownReset;
      boss.bossPhase.patternIndex = 0;
      boss.bossPhase.activePatternId = null;
      boss.bossPhase.pendingPhaseOpener = false;
      boss.bossPhase.dashTimer = 0;
      boss.bossPhase.ascendHeight = 0;
      boss.siphonableBoss.siphonProgress = 0;
      boss.siphonableBoss.isEndlessSavor = false;
      boss.siphonableBoss.finisherPose = FINISHER_POSE_IDS.UPRIGHT_EMBRACE;
      boss.siphonableBoss.finisherMode = FINISHER_MODES.KISS;
    }

    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(nextTier);
    this.bossRig.resetForEncounter(nextTier);
    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.sceneManager.setPhaseAtmosphere(BOSS_PHASES.PHASE_1);
    const bossAudioMode = isRealm3
      ? AUDIO_MODES.HARMONIC_BOSS
      : isRealm2
        ? AUDIO_MODES.SUNKEN_BOSS
        : AUDIO_MODES.COMBAT_P1;
    this.sound.setMode(bossAudioMode);

    const store = useGameStore.getState();
    store.resetForDuel(
      nextTier,
      baseBossMaxHp,
      isRealm3
        ? MIKU_CONFIG.reverberationArc.subtitle
        : isRealm2
          ? SERENA_CONFIG.tidalSweep.subtitle
          : BOSS_CONFIG.phase1.subtitle,
    );
    store.setAudioMode(bossAudioMode);
    this.renderSyncSystem.flushHudSnapshot();
  }

  private handleBossPhaseChanged(phase: BossPhase): void {
    this.sceneManager.setPhaseAtmosphere(phase);
    const store = useGameStore.getState();
    store.setBossPhase(phase);

    if (store.activeRealm === 3) {
      this.sound.setMode(AUDIO_MODES.HARMONIC_BOSS);
      store.setAudioMode(AUDIO_MODES.HARMONIC_BOSS);
      return;
    }

    if (store.activeRealm === 2) {
      this.sound.setMode(AUDIO_MODES.SUNKEN_BOSS);
      store.setAudioMode(AUDIO_MODES.SUNKEN_BOSS);
      return;
    }

    if (phase === BOSS_PHASES.PHASE_2) {
      this.sound.setMode(AUDIO_MODES.COMBAT_P2);
      store.setAudioMode(AUDIO_MODES.COMBAT_P2);
    } else if (phase === BOSS_PHASES.PHASE_3) {
      this.sound.setMode(AUDIO_MODES.COMBAT_P3);
      store.setAudioMode(AUDIO_MODES.COMBAT_P3);
    }
  }

  private handleBossStaggered(bossEntityId?: EntityId): void {
    if (bossEntityId !== undefined) {
      this.activeTargetBossEntityId = bossEntityId;
      const rig = this.activeBossRigMap.get(bossEntityId);
      if (rig) {
        this.bossRig = rig;
      }
      this.finisherSystem.setTargetBossEntityId(bossEntityId);
      this.dioramaSystem.setTargetBossEntityId(bossEntityId);
    }

    this.state = GAME_STATES.STAGGER;
    this.inputSystem.resetTransientInputs();
    this.cameraRig.exitLock();
    this.sceneManager.setPhaseAtmosphere('STAGGER');
    this.sound.setMode(AUDIO_MODES.STAGGER);

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.STAGGER);
    store.setBossStaggered(true);
    store.setBossExpression(BOSS_EXPRESSIONS.STAGGER);
    store.setAudioMode(AUDIO_MODES.STAGGER);
  }

  /**
   * Called when a SIPHON_FINISHER (Kiss 100% or Beam complete) finishes draining a Sovereign.
   * If other living `canBeSiphoned === true` bosses remain in a future 4-boss scenario, combat
   * resumes; when the final siphonable Sovereign falls, surviving non-siphonable bosses disperse
   * in a violet shockwave and the encounter concludes in VICTORY_DIORAMA.
   */
  private handleSiphonClimax(): void {
    const drainedId = this.activeTargetBossEntityId;
    const allBosses = this.world.query('bossPhase', 'health');
    const remainingSiphonable = allBosses.filter(
      (b) =>
        b.id !== drainedId &&
        b.bossPhase.canBeSiphoned &&
        !b.bossPhase.isDefeated,
    );

    if (remainingSiphonable.length > 0 && drainedId !== null) {
      const drained = this.world.getEntity(drainedId);
      if (drained?.bossPhase) {
        drained.bossPhase.isDefeated = true;
      }
      const rig = this.activeBossRigMap.get(drainedId);
      if (rig) rig.root.visible = false;
      this.finisherSystem.hideVisuals();
      this.state = GAME_STATES.BOSS_COMBAT;
      useGameStore.getState().setGameState(GAME_STATES.BOSS_COMBAT);
      this.cameraRig.requestLock();
      this.renderSyncSystem.flushHudSnapshot();
      return;
    }

    this.dioramaSystem.enterVictoryDiorama(true);
    this.renderSyncSystem.flushHudSnapshot();
  }

  private handlePlayerDefeated(): void {
    this.inputSystem.resetTransientInputs();
    this.finisherSystem.resetState();
    const store = useGameStore.getState();
    if (!this.activeScenarioId) {
      const activeRealm = store.activeRealm;
      this.activateBossForRealm(activeRealm, store.encoreTier);
      if (this.state === GAME_STATES.CHAMBER_COMBAT) {
        this.chamberSystem.cleanupChambers();
        const isRealm2 = activeRealm === 2;
        const isRealm3 = activeRealm === 3;
        this.sceneManager.setEnvironment(
          isRealm3
            ? ENVIRONMENT_IDS.HARMONIC_SUMMIT
            : isRealm2
              ? ENVIRONMENT_IDS.SUNKEN_SUMMIT
              : ENVIRONMENT_IDS.SUMMIT,
        );
        this.bossRig.root.visible = true;
      }
    }
    this.dioramaSystem.enterDefeatDiorama();
  }

  /**
   * Starts either the interactive Arcane Siphon Kiss ([E]) or ranged Umbral Siphon Beam ([R]).
   */
  public startSiphonFinisher(
    mode: FinisherMode = FINISHER_MODES.KISS,
    targetBossEntityId?: EntityId,
  ): void {
    if (targetBossEntityId !== undefined) {
      this.activeTargetBossEntityId = targetBossEntityId;
      const rig = this.activeBossRigMap.get(targetBossEntityId);
      if (rig) this.bossRig = rig;
      this.finisherSystem.setTargetBossEntityId(targetBossEntityId);
      this.dioramaSystem.setTargetBossEntityId(targetBossEntityId);
    }

    this.state = GAME_STATES.SIPHON_FINISHER;
    this.inputSystem.resetTransientInputs();
    this.finisherSystem.resetState();
    this.cameraRig.exitLock();

    const isBeam = mode === FINISHER_MODES.BEAM;
    const boss =
      (this.activeTargetBossEntityId !== null
        ? this.world.getEntity(this.activeTargetBossEntityId)
        : undefined) ?? this.world.queryFirst('siphonableBoss');
    if (boss?.siphonableBoss) {
      boss.siphonableBoss.siphonProgress = 0;
      boss.siphonableBoss.isEndlessSavor = false;
      boss.siphonableBoss.finisherPose = FINISHER_POSE_IDS.UPRIGHT_EMBRACE;
      boss.siphonableBoss.finisherMode = mode;
      boss.siphonableBoss.drainThrottle = DRAIN_THROTTLE_MODES.FLOW;
      boss.siphonableBoss.tauntDizzyTimer = 0;
    }

    const expression = isBeam
      ? BOSS_EXPRESSIONS.STAGGER
      : BOSS_EXPRESSIONS.SIPHON_KISS;
    this.bossRig.setExpression(expression);
    this.sound.setMode(AUDIO_MODES.SIPHON);

    const store = useGameStore.getState();
    if (isBeam) {
      this.finisherSystem.startBeamSiphonAudio(store.activeRealm);
    } else {
      this.finisherSystem.startSiphonAudio(store.activeRealm, 0);
    }
    store.setGameState(GAME_STATES.SIPHON_FINISHER);
    store.setCanExecuteFinisher(false);
    store.setFinisherPose(FINISHER_POSE_IDS.UPRIGHT_EMBRACE);
    store.setFinisherMode(mode);
    store.setDrainThrottle(DRAIN_THROTTLE_MODES.FLOW);
    store.setEndlessSavor(false);
    store.setBossExpression(expression);
    store.setAudioMode(AUDIO_MODES.SIPHON);
    store.syncCombatSnapshot({ siphonProgress: 0, tauntDizzyTimer: 0 });

    if (!isBeam) {
      this.bossRig.root.updateMatrixWorld(true);
      this.bossRig.headAnchor.getWorldPosition(this.orbitCameraTarget.position);
      this.cameraRig.resetSphericalOrbit(
        0.55,
        CAMERA_CONFIG.finisherDefaultElevation,
        CAMERA_CONFIG.finisherDefaultDistance,
      );
    }
  }

  /**
   * Transitions from a Siphon Gallery dais in LOBBY into `LOBBY_SIPHON`
   * against bound captive Marina, Serena, or Miku in either close-range Kiss (`[E]`)
   * or ranged Umbral Siphon Beam (`[R]`) mode.
   */
  public enterLobbySiphon(
    target: LobbySiphonTargetId = 'marina',
    mode: FinisherMode = FINISHER_MODES.KISS,
  ): void {
    const isSerena = target === 'serena';
    const isMiku = target === 'miku';
    const isYennefer = target === 'yennefer';
    const captiveRig = isYennefer
      ? this.sceneManager.mageTowerLevel.captiveYenneferRig
      : isSerena
        ? this.sceneManager.mageTowerLevel.captiveSerenaRig
        : isMiku
          ? this.sceneManager.mageTowerLevel.captiveMikuRig
          : this.sceneManager.mageTowerLevel.captiveMarinaRig;
    if (!captiveRig) return;

    const store = useGameStore.getState();
    const initialCharge = isYennefer
      ? store.yenneferCoreCharge
      : isSerena
        ? store.serenaCoreCharge
        : isMiku
          ? store.mikuCoreCharge
          : store.marinaCoreCharge;
    const isBeam = mode === FINISHER_MODES.BEAM;
    if (isBeam && initialCharge <= 0) return;

    const startsDepleted = isBeam
      ? false
      : initialCharge <= SIPHON_GALLERY_CONFIG.minDrainableCharge;

    const daisPos = isYennefer
      ? SIPHON_GALLERY_CONFIG.guestPedestal1Pos
      : isSerena
        ? SIPHON_GALLERY_CONFIG.serenaDaisPos
        : isMiku
          ? SIPHON_GALLERY_CONFIG.mikuDaisPos
          : SIPHON_GALLERY_CONFIG.marinaDaisPos;
    const facingYaw = isYennefer
      ? SIPHON_GALLERY_CONFIG.guestPedestal1FacingYaw
      : isSerena
        ? SIPHON_GALLERY_CONFIG.serenaFacingYaw
        : isMiku
          ? SIPHON_GALLERY_CONFIG.mikuFacingYaw
          : SIPHON_GALLERY_CONFIG.marinaFacingYaw;

    this.activeLobbySiphonTarget = target;
    this.state = GAME_STATES.LOBBY_SIPHON;
    this.inputSystem.resetTransientInputs();
    this.cameraRig.exitLock();
    this.finisherSystem.setLobbyBossRig(captiveRig);
    this.finisherSystem.beginLobbySiphonSession(
      initialCharge,
      {
        targetId: target,
        daisPos,
        daisHeight: SIPHON_GALLERY_CONFIG.daisHeight,
        facingYaw,
      },
      mode,
    );

    const boss = this.world.queryFirst('siphonableBoss');
    if (boss) {
      boss.siphonableBoss.siphonProgress = startsDepleted
        ? 1.0
        : 1.0 - initialCharge;
      boss.siphonableBoss.isEndlessSavor = startsDepleted;
      boss.siphonableBoss.finisherPose = FINISHER_POSE_IDS.UPRIGHT_EMBRACE;
      boss.siphonableBoss.finisherMode = mode;
      boss.siphonableBoss.drainThrottle = DRAIN_THROTTLE_MODES.FLOW;
      boss.siphonableBoss.tauntDizzyTimer = 0;
    }

    if (isBeam) {
      const mageX =
        daisPos.x +
        Math.sin(facingYaw) * SIPHON_BEAM_CONFIG.lobbyStandoffDistance;
      const mageZ =
        daisPos.z +
        Math.cos(facingYaw) * SIPHON_BEAM_CONFIG.lobbyStandoffDistance;
      const mageYaw = Math.atan2(daisPos.x - mageX, daisPos.z - mageZ);
      const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
      if (player) {
        player.transform.position.x = mageX;
        player.transform.position.y = 0;
        player.transform.position.z = mageZ;
        player.transform.rotationY = mageYaw;
        player.velocity.vx = 0;
        player.velocity.vy = 0;
        player.velocity.vz = 0;
      }
      this.mageRig.setStaffPlanted(false);
    }

    const expression = isBeam
      ? BOSS_EXPRESSIONS.STAGGER
      : BOSS_EXPRESSIONS.SIPHON_KISS;
    captiveRig.setExpression(expression);
    this.sound.setMode(AUDIO_MODES.SIPHON);

    store.setLobbySiphonTarget(target);
    store.setBossIdentity(
      captiveRig.id,
      captiveRig.displayName,
      captiveRig.title,
      isSerena
        ? SERENA_CONFIG.maxHp
        : isMiku
          ? MIKU_CONFIG.maxHp
          : BOSS_CONFIG.maxHp,
    );
    store.setGameState(GAME_STATES.LOBBY_SIPHON);
    store.setLobbyPrompt(null);
    store.setFinisherPose(FINISHER_POSE_IDS.UPRIGHT_EMBRACE);
    store.setFinisherMode(mode);
    store.setDrainThrottle(DRAIN_THROTTLE_MODES.FLOW);
    store.setEndlessSavor(startsDepleted);
    if (startsDepleted) {
      if (isYennefer) {
        store.setYenneferCoreCharge(0);
      } else if (isSerena) {
        store.setSerenaCoreCharge(0);
      } else if (isMiku) {
        store.setMikuCoreCharge(0);
      } else {
        store.setMarinaCoreCharge(0);
      }
    }
    store.setBossExpression(expression);
    store.setAudioMode(AUDIO_MODES.SIPHON);
    store.syncCombatSnapshot({
      siphonProgress: startsDepleted ? 1.0 : 1.0 - initialCharge,
      tauntDizzyTimer: 0,
    });

    if (!isBeam) {
      captiveRig.root.updateMatrixWorld(true);
      captiveRig.headAnchor.getWorldPosition(this.orbitCameraTarget.position);
      this.cameraRig.resetSphericalOrbit(
        isYennefer
          ? SIPHON_GALLERY_CONFIG.guestSiphonInitialAzimuth
          : isSerena
            ? SIPHON_GALLERY_CONFIG.serenaSiphonInitialAzimuth
            : isMiku
              ? SIPHON_GALLERY_CONFIG.mikuSiphonInitialAzimuth
              : SIPHON_GALLERY_CONFIG.siphonInitialAzimuth,
        CAMERA_CONFIG.finisherDefaultElevation,
        CAMERA_CONFIG.finisherDefaultDistance,
      );
    }
  }

  /**
   * Releases the active captive sovereign back onto her bound dais posture at her remaining
   * core charge, returns the Dark Mage standing in front of her dais, re-engages
   * PointerLock, and transitions cleanly back to `LOBBY`.
   */
  public releaseLobbySiphon(): void {
    if (this.state !== GAME_STATES.LOBBY_SIPHON) return;

    const isYennefer = this.activeLobbySiphonTarget === 'yennefer';
    const isSerena = this.activeLobbySiphonTarget === 'serena';
    const isMiku = this.activeLobbySiphonTarget === 'miku';
    const remainingCharge = this.finisherSystem.getLobbyCharge();
    this.finisherSystem.hideVisuals();
    this.finisherSystem.resetState();
    this.sound.stopSiphonLoop();
    this.sound.stopBeamSiphonLoop();
    this.inputSystem.resetTransientInputs();

    const boss = this.world.queryFirst('siphonableBoss');
    if (boss) {
      boss.siphonableBoss.finisherMode = FINISHER_MODES.KISS;
    }

    const store = useGameStore.getState();
    if (isYennefer) {
      store.setYenneferCoreCharge(remainingCharge);
    } else if (isSerena) {
      store.setSerenaCoreCharge(remainingCharge);
    } else if (isMiku) {
      store.setMikuCoreCharge(remainingCharge);
    } else {
      store.setMarinaCoreCharge(remainingCharge);
    }
    store.setEndlessSavor(false);
    store.setFinisherMode(FINISHER_MODES.KISS);

    const daisPos = isYennefer
      ? SIPHON_GALLERY_CONFIG.guestPedestal1Pos
      : isSerena
        ? SIPHON_GALLERY_CONFIG.serenaDaisPos
        : isMiku
          ? SIPHON_GALLERY_CONFIG.mikuDaisPos
          : SIPHON_GALLERY_CONFIG.marinaDaisPos;
    const facingYaw = isYennefer
      ? SIPHON_GALLERY_CONFIG.guestPedestal1FacingYaw
      : isSerena
        ? SIPHON_GALLERY_CONFIG.serenaFacingYaw
        : isMiku
          ? SIPHON_GALLERY_CONFIG.mikuFacingYaw
          : SIPHON_GALLERY_CONFIG.marinaFacingYaw;

    const standX =
      daisPos.x + Math.sin(facingYaw) * SIPHON_GALLERY_CONFIG.releaseStandOffsetZ;
    const standZ =
      daisPos.z + Math.cos(facingYaw) * SIPHON_GALLERY_CONFIG.releaseStandOffsetZ;
    const playerYaw = Math.atan2(daisPos.x - standX, daisPos.z - standZ);

    const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
    if (player) {
      player.transform.position.x = standX;
      player.transform.position.y = 0;
      player.transform.position.z = standZ;
      player.transform.rotationY = playerYaw;
      player.velocity.vx = 0;
      player.velocity.vy = 0;
      player.velocity.vz = 0;
    }

    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(store.encoreTier);
    this.mageRig.root.position.set(standX, 0, standZ);
    this.mageRig.root.rotation.set(0, playerYaw, 0);

    // Restore the active captive sovereign cleanly to her bound dais posture at remaining charge
    if (isYennefer) {
      this.sceneManager.mageTowerLevel.updateYenneferCaptiveState(
        remainingCharge,
        this.elapsed,
        0.016,
      );
    } else if (isSerena) {
      this.sceneManager.mageTowerLevel.updateSerenaCaptiveState(
        remainingCharge,
        this.elapsed,
        0.016,
      );
    } else if (isMiku) {
      this.sceneManager.mageTowerLevel.updateMikuCaptiveState(
        remainingCharge,
        this.elapsed,
        0.016,
      );
    } else {
      this.sceneManager.mageTowerLevel.updateMarinaCaptiveState(
        remainingCharge,
        this.elapsed,
        0.016,
      );
    }

    this.state = GAME_STATES.LOBBY;
    this.sound.setMode(AUDIO_MODES.LOBBY);
    store.setGameState(GAME_STATES.LOBBY);
    store.setAudioMode(AUDIO_MODES.LOBBY);

    // Frame camera behind the Dark Mage looking directly toward the dais
    this.cameraRig.setCombatAngles(
      facingYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.cameraRig.requestLock();
  }

  /**
   * Immediately exits first-person gaze, restores the Dark Mage rig and clears the HUD gaze flag.
   */
  private releaseFirstPersonGaze(): void {
    this.cameraRig.setFirstPersonGaze(false);
    this.rigHiddenByGaze = false;
    this.mageRig.root.visible = true;
    const store = useGameStore.getState();
    if (store.isFirstPersonGaze) store.setFirstPersonGaze(false);
  }

  private startLoop(): void {
    this.clock.start();

    const tick = (): void => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(tick);

      const rawDt = this.clock.getDelta();
      if (this.isPaused || useGameStore.getState().isScenarioSelectorOpen) {
        // Freeze ECS simulation tick while Pause Menu or Scenario Selector modal is open
        this.sceneManager.render(this.cameraRig.camera);
        return;
      }

      const dt = Math.min(rawDt, ARENA_CONFIG.maxDeltaTime);
      this.elapsed += dt;

      // Run ECS Simulation Pipeline in deterministic order
      this.inputSystem.update(dt, this.elapsed);
      const gazeIntent = this.world.queryFirst('playerTag', 'playerIntent');
      this.cameraRig.setFirstPersonGaze(
        gazeIntent?.playerIntent.isFirstPersonGaze === true,
      );
      this.movementSystem.update(dt, this.elapsed);
      this.lobbySystem.update(dt, this.elapsed);
      this.chamberSystem.update(dt, this.elapsed);
      this.bossAISystem.update(dt, this.elapsed);
      this.combatSystem.update(dt, this.elapsed);
      this.finisherSystem.update(dt, this.elapsed);
      this.dioramaSystem.update(dt, this.elapsed);
      this.renderSyncSystem.update(dt, this.elapsed);

      // Update Camera
      const player = this.world.queryFirst('playerTag', 'transform');
      if (player) {
        const p = player.transform.position;
        this.playerCameraTarget.position.set(p.x, p.y, p.z);
        this.titleCameraTarget.position.set(p.x, p.y, p.z);
      }

      if (this.state === GAME_STATES.TITLE) {
        this.cameraRig.update(
          dt,
          this.state,
          this.titleCameraTarget,
          null,
          this.sceneManager,
        );
      } else if (this.state === GAME_STATES.STOLEN_KISS) {
        const activeBoss =
          (this.activeTargetBossEntityId !== null
            ? this.world.getEntity(this.activeTargetBossEntityId)
            : undefined) ?? this.world.queryFirst('bossPhase', 'transform');
        if (activeBoss?.transform) {
          this.scratchBeamBossPos.set(
            activeBoss.transform.position.x,
            activeBoss.transform.position.y,
            activeBoss.transform.position.z,
          );
          this.cameraRig.updateStolenKissCamera(
            dt,
            this.scratchBeamBossPos,
            activeBoss.transform.rotationY,
            this.finisherSystem.stolenKissBeatState,
          );
        }
      } else if (this.state === GAME_STATES.LOBBY_SIPHON) {
        const activeBoss = this.world.queryFirst('siphonableBoss');
        if (
          activeBoss &&
          activeBoss.siphonableBoss.finisherMode === FINISHER_MODES.BEAM &&
          player
        ) {
          const daisPos =
            this.activeLobbySiphonTarget === 'yennefer'
              ? SIPHON_GALLERY_CONFIG.guestPedestal1Pos
              : this.activeLobbySiphonTarget === 'serena'
                ? SIPHON_GALLERY_CONFIG.serenaDaisPos
                : this.activeLobbySiphonTarget === 'miku'
                  ? SIPHON_GALLERY_CONFIG.mikuDaisPos
                  : SIPHON_GALLERY_CONFIG.marinaDaisPos;
          this.scratchBeamMagePos.set(
            player.transform.position.x,
            player.transform.position.y,
            player.transform.position.z,
          );
          this.scratchBeamBossPos.set(
            daisPos.x,
            SIPHON_GALLERY_CONFIG.daisHeight,
            daisPos.z,
          );
          this.cameraRig.updateBeamFinisherCamera(
            dt,
            this.scratchBeamMagePos,
            this.scratchBeamBossPos,
            true,
          );
        } else {
          const captiveRig =
            this.activeLobbySiphonTarget === 'yennefer'
              ? this.sceneManager.mageTowerLevel.captiveYenneferRig
              : this.activeLobbySiphonTarget === 'serena'
                ? this.sceneManager.mageTowerLevel.captiveSerenaRig
                : this.activeLobbySiphonTarget === 'miku'
                  ? this.sceneManager.mageTowerLevel.captiveMikuRig
                  : this.sceneManager.mageTowerLevel.captiveMarinaRig;
          if (captiveRig) {
            captiveRig.root.updateMatrixWorld(true);
            captiveRig.headAnchor.getWorldPosition(
              this.orbitCameraTarget.position,
            );
          }
          this.cameraRig.update(
            dt,
            this.state,
            this.playerCameraTarget,
            this.orbitCameraTarget,
          );
        }
      } else if (
        this.state === GAME_STATES.SIPHON_FINISHER ||
        this.state === GAME_STATES.ENDLESS_SAVOR
      ) {
        const activeBoss = this.world.queryFirst('siphonableBoss', 'transform');
        if (
          this.state === GAME_STATES.SIPHON_FINISHER &&
          activeBoss &&
          activeBoss.siphonableBoss.finisherMode === FINISHER_MODES.BEAM &&
          player
        ) {
          this.scratchBeamMagePos.set(
            player.transform.position.x,
            player.transform.position.y,
            player.transform.position.z,
          );
          this.scratchBeamBossPos.set(
            activeBoss.transform.position.x,
            activeBoss.transform.position.y,
            activeBoss.transform.position.z,
          );
          this.cameraRig.updateBeamFinisherCamera(
            dt,
            this.scratchBeamMagePos,
            this.scratchBeamBossPos,
          );
        } else {
          this.bossRig.root.updateMatrixWorld(true);
          this.bossRig.headAnchor.getWorldPosition(
            this.orbitCameraTarget.position,
          );
          this.cameraRig.update(
            dt,
            this.state,
            this.playerCameraTarget,
            this.orbitCameraTarget,
          );
        }
      } else if (
        this.state === GAME_STATES.VICTORY_DIORAMA ||
        this.state === GAME_STATES.DEFEAT_DIORAMA
      ) {
        this.dioramaSystem.getOrbitFocusTarget(
          this.state,
          this.orbitCameraTarget.position,
        );
        this.cameraRig.update(
          dt,
          this.state,
          this.playerCameraTarget,
          this.orbitCameraTarget,
        );
      } else {
        this.cameraRig.update(
          dt,
          this.state,
          this.playerCameraTarget,
          null,
          this.sceneManager,
        );

        // Smooth dramatic duo intro frame for Special Scenarios (Geralt & Yennefer side-by-side)
        if (this.duoIntroTimer > 0 && this.state === GAME_STATES.BOSS_COMBAT) {
          this.duoIntroTimer = Math.max(0, this.duoIntroTimer - dt);
          const u =
            this.duoIntroTimer / SPECIAL_SCENARIO_CONFIG.duoIntroDurationSec;
          const introWeight = u * u * (3 - 2 * u);
          this.scratchIntroCamPos.set(
            0,
            2.15,
            BOSS_CONFIG.spawnZ + 6.4,
          );
          this.scratchIntroLookAt.set(0, 1.35, BOSS_CONFIG.spawnZ);
          this.cameraRig.camera.position.lerp(
            this.scratchIntroCamPos,
            introWeight,
          );
          if (introWeight > 0.08) {
            this.cameraRig.camera.lookAt(this.scratchIntroLookAt);
          }
        }
      }

      // Hood-clip prevention: hide the Dark Mage rig only while the gaze camera sits at his eye anchor
      const hideRig = this.cameraRig.shouldHideRig;
      if (hideRig !== this.rigHiddenByGaze) {
        this.rigHiddenByGaze = hideRig;
        this.mageRig.root.visible = !hideRig;
      }
      const gazeActive = this.cameraRig.isFirstPersonGazeActive;
      if (useGameStore.getState().isFirstPersonGaze !== gazeActive) {
        useGameStore.getState().setFirstPersonGaze(gazeActive);
      }

      // Close-range player fade when spring-arm camera pulls tight against chamber walls/pillars
      this.mageRig.setCameraProximityDistance(
        this.cameraRig.cameraDistanceToPivot,
      );

      // Render WebGL Scene
      this.sceneManager.render(this.cameraRig.camera);
    };

    tick();
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    window.removeEventListener('resize', this.handleResize);
    this.unsubscribeStore();
    this.inputSystem.dispose();
    this.chamberSystem.dispose();
    this.finisherSystem.dispose();
    this.dioramaSystem.dispose();
    this.cameraRig.exitLock();
    this.cameraRig.dispose();
    this.sound.dispose();
    this.vfx.clearTransientVfx();
    this.world.clear();
    this.unsubscribeEntityRemoved();
    this.mageRig.dispose();
    this.marinaRig.dispose();
    this.serenaRig.dispose();
    this.mikuRig.dispose();
    this.geraltRig.dispose();
    this.yenneferRig.dispose();
    this.sceneManager.dispose();
  }
}
