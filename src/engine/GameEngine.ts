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
  FINISHER_POSE_IDS,
  GAME_STATES,
  LOBBY_CONFIG,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../config/gameConfig';
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
import { MarinaRig } from '../rigs/bosses/MarinaRig';
import { useGameStore } from '../state/useGameStore';
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
  triggerLobbyInteract(): void;
  resetDuel(encoreTier?: number): void;
  setPaused(paused: boolean): void;
  resumeGame(): void;
  restartStage(): void;
  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;
  playSfxPreview(): void;
  toggleAudioMute(): void;
  triggerFinisher(): void;
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
  private readonly bossRig: BossRigAdapter;

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
  private isPaused = false;
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

  constructor(container: HTMLElement) {
    this.world = new ECSWorld();
    this.sceneManager = new SceneManager(container);
    this.cameraRig = new CameraRig(this.sceneManager.domElement);
    this.cameraRig.attachOrbitRimLights(this.sceneManager.scene);
    this.sound = new SoundEngine();
    this.vfx = new VfxFactory(this.sceneManager.scene);

    this.mageRig = new DarkMageRig(this.sceneManager.scene);
    this.bossRig = new MarinaRig(this.sceneManager.scene);

    // Automatic Three.js mesh disposal whenever an ECS projectile/hazard/clone/wisp is destroyed
    this.unsubscribeEntityRemoved = this.world.onEntityRemoved((entity) => {
      if (
        entity.meshRef &&
        entity.meshRef.object3D !== this.mageRig.root &&
        entity.meshRef.object3D !== this.bossRig.root &&
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
        onFinisherApproachComplete: () => this.startSiphonFinisher(),
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
          this.enterChambersRun(useGameStore.getState().encoreTier);
          this.cameraRig.requestLock();
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
        addCameraShake: (amount) => this.cameraRig.addShake(amount),
        onPlayerDamaged: (amount) => this.combatSystem.applyPlayerDamage(amount),
        onPlayerHealed: () => this.renderSyncSystem.flushHudSnapshot(),
        onPortalWarpStarted: () => {
          this.inputSystem.resetTransientInputs();
          this.clearAllCombatEntities();
        },
        onPortalWarpComplete: () => this.enterSummitFromPortal(),
      },
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
        onStaggerTriggered: () => this.handleBossStaggered(),
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
        onSiphonClimax: () => this.dioramaSystem.enterVictoryDiorama(true),
      },
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
        portalInteractRequested: false,
        tauntRequested: false,
        surgeTapRequested: false,
        requestedPose: null,
        drainThrottle: DRAIN_THROTTLE_MODES.FLOW,
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
        finisherPose: FINISHER_POSE_IDS.CHIN_LIFT,
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

    const store = useGameStore.getState();
    const tier = store.encoreTier;
    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.LOBBY);
    this.bossRig.root.visible = false;
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

  public triggerLobbyInteract(): void {
    if (this.state === GAME_STATES.LOBBY) {
      this.sound.unlock();
      this.lobbySystem.executeActiveInteraction();
    }
  }

  /**
   * Launches a fresh Royal Ice Chambers gauntlet (Wave 1) with `hasReachedSummit = false`.
   */
  public enterChambersRun(encoreTier: number): void {
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

    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.CHAMBER);
    this.bossRig.root.visible = false;

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerCombat',
    );
    if (player) {
      player.transform.position.x = CHAMBER_CONFIG.playerSpawnX;
      player.transform.position.y = 0;
      player.transform.position.z = CHAMBER_CONFIG.playerSpawnZ;
      player.transform.rotationY = CHAMBER_CONFIG.playerSpawnYaw;
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

    const store = useGameStore.getState();
    store.setEncoreTier(encoreTier);
    store.setHasReachedSummit(false);
    store.setPaused(false);
    store.setGameState(GAME_STATES.CHAMBER_COMBAT);
    store.setAudioMode(AUDIO_MODES.CHAMBER);

    this.sound.setMode(AUDIO_MODES.CHAMBER);
    this.chamberSystem.enterChambers(encoreTier);
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

  public triggerFinisher(): void {
    if (this.state === GAME_STATES.STAGGER) {
      this.inputSystem.queueFinisherExecute();
    }
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
    if (this.state === GAME_STATES.ENDLESS_SAVOR) {
      this.finisherSystem.hideVisuals();
      this.dioramaSystem.exitEndlessSavor();
    }
  }

  public enterEncoreStage(): void {
    this.sound.unlock();
    const nextTier = useGameStore.getState().encoreTier + 1;
    useGameStore.getState().setHasReachedSummit(false);
    this.enterChambersRun(nextTier);
    this.cameraRig.requestLock();
  }

  public retryStage(): void {
    this.sound.unlock();
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

    this.sceneManager.setEnvironment(ENVIRONMENT_IDS.SUMMIT);
    this.bossRig.root.visible = true;

    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    const nextTier = encoreTier ?? useGameStore.getState().encoreTier;
    const scaledBossMaxHp = Math.round(
      BOSS_CONFIG.maxHp *
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
      boss.siphonableBoss.finisherPose = FINISHER_POSE_IDS.CHIN_LIFT;
    }

    this.mageRig.resetCombatPose();
    this.mageRig.setEncoreTier(nextTier);
    this.bossRig.resetForEncounter(nextTier);
    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.sceneManager.setPhaseAtmosphere(BOSS_PHASES.PHASE_1);
    this.sound.setMode(AUDIO_MODES.COMBAT_P1);

    const store = useGameStore.getState();
    store.resetForDuel(nextTier);
    store.setAudioMode(AUDIO_MODES.COMBAT_P1);
    this.renderSyncSystem.flushHudSnapshot();
  }

  private handleBossPhaseChanged(phase: BossPhase): void {
    this.sceneManager.setPhaseAtmosphere(phase);
    const store = useGameStore.getState();
    store.setBossPhase(phase);

    if (phase === BOSS_PHASES.PHASE_2) {
      this.sound.setMode(AUDIO_MODES.COMBAT_P2);
      store.setAudioMode(AUDIO_MODES.COMBAT_P2);
    } else if (phase === BOSS_PHASES.PHASE_3) {
      this.sound.setMode(AUDIO_MODES.COMBAT_P3);
      store.setAudioMode(AUDIO_MODES.COMBAT_P3);
    }
  }

  private handleBossStaggered(): void {
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

  private handlePlayerDefeated(): void {
    this.inputSystem.resetTransientInputs();
    this.finisherSystem.resetState();
    if (this.state === GAME_STATES.CHAMBER_COMBAT) {
      this.chamberSystem.cleanupChambers();
      this.sceneManager.setEnvironment(ENVIRONMENT_IDS.SUMMIT);
      this.bossRig.root.visible = true;
    }
    this.dioramaSystem.enterDefeatDiorama();
  }

  /**
   * Starts the full interactive Arcane Siphon Kiss sequence (Block 4).
   */
  public startSiphonFinisher(): void {
    this.state = GAME_STATES.SIPHON_FINISHER;
    this.inputSystem.resetTransientInputs();
    this.finisherSystem.resetState();
    this.cameraRig.exitLock();

    const boss = this.world.queryFirst('siphonableBoss');
    if (boss) {
      boss.siphonableBoss.siphonProgress = 0;
      boss.siphonableBoss.isEndlessSavor = false;
      boss.siphonableBoss.finisherPose = FINISHER_POSE_IDS.CHIN_LIFT;
      boss.siphonableBoss.drainThrottle = DRAIN_THROTTLE_MODES.FLOW;
      boss.siphonableBoss.tauntDizzyTimer = 0;
    }

    this.bossRig.setExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
    this.sound.setMode(AUDIO_MODES.SIPHON);

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.SIPHON_FINISHER);
    store.setCanExecuteFinisher(false);
    store.setFinisherPose(FINISHER_POSE_IDS.CHIN_LIFT);
    store.setDrainThrottle(DRAIN_THROTTLE_MODES.FLOW);
    store.setEndlessSavor(false);
    store.setBossExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
    store.setAudioMode(AUDIO_MODES.SIPHON);
    store.syncCombatSnapshot({ siphonProgress: 0, tauntDizzyTimer: 0 });

    this.bossRig.root.updateMatrixWorld(true);
    this.bossRig.headAnchor.getWorldPosition(this.orbitCameraTarget.position);
    this.cameraRig.resetSphericalOrbit(
      0.55,
      CAMERA_CONFIG.finisherDefaultElevation,
      CAMERA_CONFIG.finisherDefaultDistance,
    );
  }

  private startLoop(): void {
    this.clock.start();

    const tick = (): void => {
      if (this.isDisposed) return;
      this.rafId = requestAnimationFrame(tick);

      const rawDt = this.clock.getDelta();
      if (this.isPaused) {
        // Freeze ECS simulation tick (dt = 0 / skip system updates) while rendering current frame
        this.sceneManager.render(this.cameraRig.camera);
        return;
      }

      const dt = Math.min(rawDt, ARENA_CONFIG.maxDeltaTime);
      this.elapsed += dt;

      // Run ECS Simulation Pipeline in deterministic order
      this.inputSystem.update(dt, this.elapsed);
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
      } else if (
        this.state === GAME_STATES.SIPHON_FINISHER ||
        this.state === GAME_STATES.ENDLESS_SAVOR
      ) {
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
    this.bossRig.dispose();
    this.sceneManager.dispose();
  }
}
