import * as THREE from 'three';
import {
  ARENA_CONFIG,
  AUDIO_MODES,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  CAMERA_CONFIG,
  DRAIN_THROTTLE_MODES,
  FINISHER_POSE_IDS,
  GAME_STATES,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../config/gameConfig';
import { BossAISystem } from '../ecs/systems/BossAISystem';
import { CombatSystem } from '../ecs/systems/CombatSystem';
import { DioramaSystem } from '../ecs/systems/DioramaSystem';
import { FinisherSystem } from '../ecs/systems/FinisherSystem';
import { InputSystem } from '../ecs/systems/InputSystem';
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
  resetDuel(encoreTier?: number): void;
  toggleAudioMute(): void;
  triggerFinisher(): void;
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
  private readonly bossAISystem: BossAISystem;
  private readonly combatSystem: CombatSystem;
  private readonly finisherSystem: FinisherSystem;
  private readonly dioramaSystem: DioramaSystem;
  private readonly renderSyncSystem: RenderSyncSystem;

  private readonly clock = new THREE.Clock();
  private readonly unsubscribeEntityRemoved: () => void;
  private readonly handleResize: () => void;

  private state: GameState = GAME_STATES.TITLE;
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

    // Automatic Three.js mesh disposal whenever an ECS projectile/hazard/clone is destroyed
    this.unsubscribeEntityRemoved = this.world.onEntityRemoved((entity) => {
      if (
        entity.meshRef &&
        entity.meshRef.object3D !== this.mageRig.root &&
        entity.meshRef.object3D !== this.bossRig.root
      ) {
        this.vfx.detachAndDispose(entity.meshRef.object3D);
      }
    });

    // Sync PointerLock changes into Zustand HUD store
    this.cameraRig.onPointerLockChange = (locked) => {
      useGameStore.getState().setPointerLocked(locked);
    };

    // Spawn core Player and Boss ECS entities
    this.spawnCoreEntities();

    // Instantiate decoupled ECS systems via narrow service interfaces
    this.inputSystem = new InputSystem(
      this.world,
      this.sceneManager.domElement,
      this.sound,
      {
        getGameState: () => this.state,
        isPointerLocked: () => this.cameraRig.isPointerLocked,
        requestPointerLock: () => this.cameraRig.requestLock(),
        onToggleAudioMute: () => this.toggleAudioMute(),
        onQuickRetry: () => this.resetDuel(),
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

    // Sync initial store identity & HUD snapshot
    const store = useGameStore.getState();
    store.resetToTitle();
    store.setBossIdentity(
      this.bossRig.id,
      this.bossRig.displayName,
      this.bossRig.title,
      BOSS_CONFIG.maxHp,
    );
    this.renderSyncSystem.flushHudSnapshot();
    this.startLoop();
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
    if (this.state !== GAME_STATES.TITLE) return;
    this.sound.unlock();
    this.state = GAME_STATES.BOSS_COMBAT;

    this.cameraRig.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
    this.sceneManager.setPhaseAtmosphere(BOSS_PHASES.PHASE_1);
    this.sound.setMode(AUDIO_MODES.COMBAT_P1);

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.BOSS_COMBAT);
    store.setAudioMode(AUDIO_MODES.COMBAT_P1);
    this.renderSyncSystem.flushHudSnapshot();

    this.cameraRig.requestLock();
  }

  public toggleAudioMute(): void {
    this.sound.unlock();
    const muted = this.sound.toggleMute();
    useGameStore.getState().setAudioMuted(muted);
  }

  public triggerFinisher(): void {
    if (this.state === GAME_STATES.STAGGER) {
      this.inputSystem.queueFinisherExecute();
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
    this.resetDuel(nextTier);
  }

  public retryStage(): void {
    this.sound.unlock();
    this.resetDuel(useGameStore.getState().encoreTier);
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

  public resetDuel(encoreTier?: number): void {
    this.sound.unlock();
    this.state = GAME_STATES.BOSS_COMBAT;

    // Clear all active projectiles, hazards, clones, diorama props & transient particles
    this.clearAllCombatEntities();
    this.dioramaSystem.cleanupPuppetVisuals();
    this.finisherSystem.resetState();
    this.vfx.clearTransientVfx();

    this.inputSystem.resetTransientInputs();
    this.movementSystem.resetTransientState();

    const nextTier = encoreTier ?? useGameStore.getState().encoreTier;
    const scaledBossMaxHp = Math.round(
      BOSS_CONFIG.maxHp *
        Math.pow(NG_PLUS_CONFIG.bossHpMultiplierPerTier, nextTier),
    );

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

      const dt = Math.min(this.clock.getDelta(), ARENA_CONFIG.maxDeltaTime);
      this.elapsed += dt;

      // Run ECS Simulation Pipeline in deterministic order
      this.inputSystem.update(dt, this.elapsed);
      this.movementSystem.update(dt, this.elapsed);
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
        this.cameraRig.update(dt, this.state, this.titleCameraTarget);
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
        this.cameraRig.update(dt, this.state, this.playerCameraTarget);
      }

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
    this.inputSystem.dispose();
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
