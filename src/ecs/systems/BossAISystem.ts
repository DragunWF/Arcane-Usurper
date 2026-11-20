import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  GAME_STATES,
  NG_PLUS_CONFIG,
  SERENA_CONFIG,
  type BossPhase,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import type { MarinaRig } from '../../rigs/bosses/MarinaRig';
import type { BossPhaseStateComponent, EntityId, EntityWith } from '../components';
import type { ECSWorld, ISystem } from '../World';

export interface BossPatternProfile {
  readonly bossId: string;
  readonly phase2Threshold: number;
  readonly phase3Threshold: number;
  readonly staggerThreshold: number;
  readonly phase2Opener: string;
  readonly phase3Opener: string;
  readonly closeRangePattern: string | null;
  readonly phase1Cycle: readonly string[];
  readonly phase2Cycle: readonly string[];
  readonly phase3Cycle: readonly string[];
  readonly getCooldown: (phase: BossPhase) => number;
}

export interface BossPatternContext {
  readonly world: ECSWorld;
  readonly bossEntity: EntityWith<'bossPhase' | 'transform'>;
  readonly playerPos: THREE.Vector3;
  readonly playerVel: THREE.Vector3;
  readonly bossRig: BossRigAdapter;
  readonly audio: IAudioTrigger;
  readonly vfx: IVfxSpawner;
  readonly spawnHoverLance: (
    ownerEntityId: EntityId,
    fanAngle: number,
    fireDelay: number,
    baseHeight?: number,
  ) => void;
  readonly clearActiveClones: () => void;
}

/**
 * Pluggable Open/Closed (OCP) Boss Attack Pattern Strategy interface.
 * New realms and boss abilities register strategies without modifying BossAISystem.
 */
export interface AttackPatternStrategy {
  readonly id: string;
  start(ctx: BossPatternContext): void;
  tick?(ctx: BossPatternContext, dt: number): void;
  finish?(ctx: BossPatternContext): void;
}

export interface IBossAICallbacks {
  getGameState: () => GameState;
  addCameraShake: (amount: number) => void;
  onPhaseChanged: (phase: BossPhase) => void;
  onStaggerTriggered: () => void;
}

/**
 * Executes multi-phase sovereign boss attack patterns, holographic clone volleys,
 * phase threshold transitions (55% -> Phase II, 20% -> Phase III), and <= 8% STAGGER.
 */
export class BossAISystem implements ISystem {
  private readonly world: ECSWorld;
  private bossRig: BossRigAdapter;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: IBossAICallbacks;

  private readonly strategies = new Map<string, AttackPatternStrategy>();
  private readonly profiles = new Map<string, BossPatternProfile>();
  private readonly scratchPlayerPos = new THREE.Vector3();
  private readonly scratchPlayerVel = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    bossRig: BossRigAdapter,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: IBossAICallbacks,
  ) {
    this.world = world;
    this.bossRig = bossRig;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;

    this.registerMarinaPatterns();
    this.registerSerenaPatterns();
  }

  public setBossRig(rig: BossRigAdapter): void {
    this.bossRig = rig;
  }

  public registerPattern(strategy: AttackPatternStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  public registerProfile(profile: BossPatternProfile): void {
    this.profiles.set(profile.bossId, profile);
  }

  private getActiveProfile(bossId: string): BossPatternProfile {
    return (
      this.profiles.get(bossId) ??
      (this.profiles.get(BOSS_CONFIG.defaultId) as BossPatternProfile)
    );
  }

  /**
   * Immediately clears all active boss projectiles, hazards, and frost clones.
   */
  public clearAllBossHazards(): void {
    this.audio.stopLaserLoop();
    this.bossRig.setAscendHeight(0);

    const projectiles = this.world.query('projectile');
    const toDestroy: EntityId[] = [];
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (p && p.projectile.faction === 'BOSS') {
        toDestroy.push(p.id);
      }
    }

    const hazards = this.world.query('hazardZone');
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h && h.hazardZone.faction === 'BOSS') {
        toDestroy.push(h.id);
      }
    }

    const clones = this.world.query('cloneIllusion');
    for (let i = 0; i < clones.length; i++) {
      const c = clones[i];
      if (c) toDestroy.push(c.id);
    }

    for (let i = 0; i < toDestroy.length; i++) {
      const id = toDestroy[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }

    const boss = this.world.queryFirst('bossPhase');
    if (boss) {
      boss.bossPhase.activePatternId = null;
      boss.bossPhase.ascendHeight = 0;
    }
  }

  /**
   * Evaluates HP ratios after CombatSystem applies damage, triggering Phase 2, Phase 3,
   * or <= 8% STAGGER cleanly.
   */
  public evaluateHealthThresholds(): void {
    const boss = this.world.queryFirst('bossPhase', 'health', 'transform');
    if (!boss || boss.bossPhase.isStaggered) return;

    const { bossPhase, health, transform } = boss;
    const profile = this.getActiveProfile(bossPhase.bossId);
    const hpRatio = health.current / Math.max(1, health.max);

    if (hpRatio <= profile.staggerThreshold) {
      bossPhase.isStaggered = true;
      bossPhase.expression = BOSS_EXPRESSIONS.STAGGER;
      this.clearAllBossHazards();
      this.bossRig.setPhaseVisuals(BOSS_PHASES.PHASE_1);
      this.bossRig.setAscendHeight(0);

      this.vfx.spawnFrostShatterBurst(
        new THREE.Vector3(
          transform.position.x,
          1.25,
          transform.position.z,
        ),
        38,
        11.0,
      );
      this.bossRig.setExpression(BOSS_EXPRESSIONS.STAGGER);
      this.callbacks.addCameraShake(BOSS_CONFIG.staggerCameraShake);
      this.audio.playIceShatter(1.0);
      this.callbacks.onStaggerTriggered();
      return;
    }

    if (
      bossPhase.phase < BOSS_PHASES.PHASE_3 &&
      hpRatio <= profile.phase3Threshold
    ) {
      this.transitionToPhase(bossPhase, transform.position, BOSS_PHASES.PHASE_3);
    } else if (
      bossPhase.phase < BOSS_PHASES.PHASE_2 &&
      hpRatio <= profile.phase2Threshold
    ) {
      this.transitionToPhase(bossPhase, transform.position, BOSS_PHASES.PHASE_2);
    }
  }

  private transitionToPhase(
    bossPhase: BossPhaseStateComponent,
    pos: { x: number; y: number; z: number },
    newPhase: BossPhase,
  ): void {
    bossPhase.phase = newPhase;
    this.bossRig.setPhaseVisuals(newPhase);
    this.bossRig.triggerCastFlourish();

    // End active lasers cleanly so the new phase opens dramatically
    this.audio.stopLaserLoop();
    const hazards = this.world.query('hazardZone');
    const laserIds: EntityId[] = [];
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h && h.hazardZone.kind === 'GLACIAL_LASER') {
        laserIds.push(h.id);
      }
    }
    laserIds.forEach((id) => this.world.destroyEntity(id));

    this.bossRig.setAscendHeight(0);
    bossPhase.ascendHeight = 0;
    bossPhase.activePatternId = null;
    bossPhase.attackCooldown = BOSS_CONFIG.phase2.transitionCooldown;
    bossPhase.pendingPhaseOpener = true;

    // Spawn dramatic radial frost-indigo phase shockwave
    this.scratchOrigin.set(pos.x, 0.2, pos.z);
    const waveGroup = this.vfx.createPhaseShockwaveGroup(
      this.scratchOrigin,
      newPhase,
    );
    this.world.createEntity({
      transform: {
        position: { x: pos.x, y: 0.2, z: pos.z },
        rotationY: 0,
        scale: 1,
      },
      hazardZone: {
        kind: 'PHASE_SHOCKWAVE',
        faction: 'BOSS',
        damage: 0,
        elapsed: 0,
        telegraphDuration: 0,
        activeDuration: BOSS_CONFIG.phase2.phaseWaveDuration,
        currentRadius: 0.8,
        maxRadius:
          newPhase === BOSS_PHASES.PHASE_3
            ? BOSS_CONFIG.phase3.phaseWaveMaxRadius
            : BOSS_CONFIG.phase2.phaseWaveMaxRadius,
        hitThickness: 0,
        angle: 0,
        startAngle: 0,
        endAngle: 0,
        beamLength: 0,
        hitCooldown: 0,
        hasHitPlayer: true,
        hasTriggered: true,
      },
      meshRef: { object3D: waveGroup },
    });

    this.vfx.spawnFrostShatterBurst(
      new THREE.Vector3(pos.x, 1.35, pos.z),
      30,
      10.2,
    );
    this.audio.playIceShatter(1.0);
    this.callbacks.addCameraShake(
      newPhase === BOSS_PHASES.PHASE_3
        ? BOSS_CONFIG.phase3.transitionCameraShake
        : BOSS_CONFIG.phase2.transitionCameraShake,
    );
    this.callbacks.onPhaseChanged(newPhase);
  }

  public update(dt: number, _elapsed: number): void {
    const state = this.callbacks.getGameState();
    const boss = this.world.queryFirst('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
    if (!boss || !player) return;

    this.updateClonesAI(dt);

    if (state !== GAME_STATES.BOSS_COMBAT || boss.bossPhase.isStaggered) {
      return;
    }

    this.scratchPlayerPos.set(
      player.transform.position.x,
      player.transform.position.y,
      player.transform.position.z,
    );
    this.scratchPlayerVel.set(
      player.velocity.vx,
      player.velocity.vy,
      player.velocity.vz,
    );

    const ctx: BossPatternContext = {
      world: this.world,
      bossEntity: boss,
      playerPos: this.scratchPlayerPos,
      playerVel: this.scratchPlayerVel,
      bossRig: this.bossRig,
      audio: this.audio,
      vfx: this.vfx,
      spawnHoverLance: (ownerEntityId, fanAngle, fireDelay, baseHeight) =>
        this.spawnHoverLance(ownerEntityId, fanAngle, fireDelay, baseHeight),
      clearActiveClones: () => this.clearActiveClones(),
    };

    const bp = boss.bossPhase;
    const profile = this.getActiveProfile(bp.bossId);

    if (bp.activePatternId !== null) {
      bp.activePatternElapsed += dt;
      const strategy = this.strategies.get(bp.activePatternId);
      if (strategy?.tick) {
        strategy.tick(ctx, dt);
      }

      if (bp.activePatternElapsed >= bp.activePatternDuration) {
        if (strategy?.finish) {
          strategy.finish(ctx);
        }
        bp.activePatternId = null;
        bp.attackCooldown = profile.getCooldown(bp.phase);

        const encoreTier =
          this.world.queryFirst('playerTag', 'playerCombat')?.playerCombat
            .encoreTier ?? 0;
        if (encoreTier > 0) {
          const cdScale = Math.max(
            NG_PLUS_CONFIG.minCooldownScale,
            Math.pow(NG_PLUS_CONFIG.bossCooldownReductionPerTier, encoreTier),
          );
          bp.attackCooldown *= cdScale;
        }
      }
      return;
    }

    bp.attackCooldown -= dt;
    if (bp.attackCooldown > 0) return;

    // Showcase signature new attack when entering Phase 2 or Phase 3
    if (bp.pendingPhaseOpener) {
      bp.pendingPhaseOpener = false;
      if (bp.phase === BOSS_PHASES.PHASE_2) {
        this.startPattern(profile.phase2Opener, ctx);
        return;
      }
      if (bp.phase === BOSS_PHASES.PHASE_3) {
        this.startPattern(profile.phase3Opener, ctx);
        return;
      }
    }

    const distToPlayer = Math.hypot(
      this.scratchPlayerPos.x - boss.transform.position.x,
      this.scratchPlayerPos.z - boss.transform.position.z,
    );

    if (
      profile.closeRangePattern !== null &&
      distToPlayer <= BOSS_CONFIG.novaTriggerDist &&
      bp.patternIndex % 2 === 0
    ) {
      bp.patternIndex++;
      this.startPattern(profile.closeRangePattern, ctx);
      return;
    }

    const idx = bp.patternIndex++;
    const cycleList =
      bp.phase === BOSS_PHASES.PHASE_3
        ? profile.phase3Cycle
        : bp.phase === BOSS_PHASES.PHASE_2
          ? profile.phase2Cycle
          : profile.phase1Cycle;
    const chosenId = cycleList[idx % cycleList.length];
    if (chosenId) {
      this.startPattern(chosenId, ctx);
    }
  }

  private startPattern(patternId: string, ctx: BossPatternContext): void {
    const strategy = this.strategies.get(patternId);
    if (!strategy) return;
    const bp = ctx.bossEntity.bossPhase;
    bp.activePatternId = patternId;
    bp.activePatternElapsed = 0;
    bp.activePatternLaunched = false;
    strategy.start(ctx);
  }

  private updateClonesAI(dt: number): void {
    const clones = this.world.query('cloneIllusion', 'transform', 'meshRef');
    const expiredIds: EntityId[] = [];

    for (let i = 0; i < clones.length; i++) {
      const entity = clones[i];
      if (!entity) continue;
      const cl = entity.cloneIllusion;
      cl.life -= dt;

      cl.volleyTimer -= dt;
      if (
        cl.volleyTimer <= 0 &&
        cl.volleyCount < BOSS_CONFIG.phase2.cloneMaxVolleys &&
        cl.life > BOSS_CONFIG.phase2.cloneMinLifeForVolley
      ) {
        cl.volleyCount++;
        cl.volleyTimer = BOSS_CONFIG.phase2.cloneVolleyInterval;
        this.audio.playIceLance();
        this.spawnHoverLance(
          entity.id,
          BOSS_CONFIG.phase2.cloneLanceAngles[0],
          0.45,
          BOSS_CONFIG.phase2.cloneLanceBaseHeight,
        );
        this.spawnHoverLance(
          entity.id,
          BOSS_CONFIG.phase2.cloneLanceAngles[1],
          0.58,
          BOSS_CONFIG.phase2.cloneLanceBaseHeight,
        );
      }

      if (cl.life < BOSS_CONFIG.phase2.cloneFadeWindow) {
        const cloneMat = entity.meshRef.object3D.userData.cloneMat as
          | THREE.MeshToonMaterial
          | undefined;
        if (cloneMat) {
          cloneMat.opacity =
            BOSS_CONFIG.phase2.cloneOpacity *
            Math.max(0, cl.life / BOSS_CONFIG.phase2.cloneFadeWindow);
        }
      }

      if (cl.life <= 0) {
        this.vfx.spawnFrostShatterBurst(
          new THREE.Vector3(
            entity.transform.position.x,
            1.2,
            entity.transform.position.z,
          ),
          16,
          7.2,
        );
        this.audio.playIceShatter(0.72);
        expiredIds.push(entity.id);
      }
    }

    for (let i = 0; i < expiredIds.length; i++) {
      const id = expiredIds[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }
  }

  private clearActiveClones(): void {
    const clones = this.world.query('cloneIllusion', 'transform');
    const ids: EntityId[] = [];
    for (let i = 0; i < clones.length; i++) {
      const cl = clones[i];
      if (!cl) continue;
      this.vfx.spawnFrostShatterBurst(
        new THREE.Vector3(
          cl.transform.position.x,
          1.2,
          cl.transform.position.z,
        ),
        10,
        6.0,
      );
      ids.push(cl.id);
    }
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }
  }

  private spawnHoverLance(
    ownerEntityId: EntityId,
    fanAngle: number,
    fireDelay: number,
    baseHeight: number = BOSS_CONFIG.phase1.lanceBaseHeight,
  ): void {
    const mesh = this.vfx.createIceLanceGroup();
    const owner = this.world.getEntity(ownerEntityId);
    const ox = owner?.transform?.position.x ?? 0;
    const oz = owner?.transform?.position.z ?? 0;

    this.world.createEntity({
      transform: {
        position: { x: ox, y: baseHeight, z: oz },
        rotationY: 0,
        scale: 1,
      },
      velocity: { vx: 0, vy: 0, vz: 0, maxSpeed: BOSS_CONFIG.phase1.lanceSpeedP1 },
      projectile: {
        faction: 'BOSS',
        kind: 'ICE_LANCE',
        damage: BOSS_CONFIG.lanceDamage,
        radius: BOSS_CONFIG.phase1.lanceHitRadius,
        life: BOSS_CONFIG.phase1.lanceLife,
        maxLife: BOSS_CONFIG.phase1.lanceLife,
        trailTimer: 0,
        spinSpeed: BOSS_CONFIG.phase1.lanceFlySpinSpeed,
        pierceRemaining: 0,
        hitEntityIds: [],
        state: 'HOVER',
        fireDelay,
        fanAngle,
        baseHeight,
        ownerEntityId,
      },
      meshRef: { object3D: mesh },
    });
  }

  /**
   * Registers Marina's verbatim Phase I, II, and III attack pattern strategies.
   */
  private registerMarinaPatterns(): void {
    // Phase 1 Pattern 1: Crystalline Ice Lance Fan
    this.registerPattern({
      id: 'ICE_LANCE_FAN',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playIceLance();
        const speedScale =
          bp.phase >= BOSS_PHASES.PHASE_2
            ? BOSS_CONFIG.phase1.lancePhase2SpeedScale
            : 1.0;

        const count = BOSS_CONFIG.phase1.lanceCount;
        for (let i = 0; i < count; i++) {
          const t = i / (count - 1) - 0.5;
          const fanAngle = t * BOSS_CONFIG.phase1.lanceFanArc;
          const delay =
            (BOSS_CONFIG.phase1.lanceHoverDelayBase +
              i * BOSS_CONFIG.phase1.lanceHoverDelayStep) *
            speedScale;
          ctx.spawnHoverLance(
            ctx.bossEntity.id,
            fanAngle,
            delay,
            BOSS_CONFIG.phase1.lanceBaseHeight,
          );
        }

        bp.activePatternDuration =
          BOSS_CONFIG.phase1.lanceAttackDuration * speedScale;
      },
    });

    // Phase 1 Pattern 2: Glacial Crescent Wave
    this.registerPattern({
      id: 'CRESCENT_WAVE',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        const tele =
          bp.phase >= BOSS_PHASES.PHASE_2
            ? BOSS_CONFIG.phase1.crescentTelegraphP2Plus
            : BOSS_CONFIG.phase1.crescentTelegraphP1;
        bp.activePatternFireTimer = tele;
        bp.activePatternDuration =
          tele + BOSS_CONFIG.phase1.crescentRecoveryDuration;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= bp.activePatternFireTimer
        ) {
          bp.activePatternLaunched = true;
          ctx.audio.playIceLance();
          const bPos = ctx.bossEntity.transform.position;
          const dx = ctx.playerPos.x - bPos.x;
          const dz = ctx.playerPos.z - bPos.z;
          const baseYaw = dx * dx + dz * dz < 0.01 ? 0 : Math.atan2(dx, dz);
          const speed =
            bp.phase >= BOSS_PHASES.PHASE_2
              ? BOSS_CONFIG.phase1.crescentSpeedP2Plus
              : BOSS_CONFIG.phase1.crescentSpeedP1;

          BOSS_CONFIG.phase1.crescentSpreadAngles.forEach((offset) => {
            const yaw = baseYaw + offset;
            const dirX = Math.sin(yaw);
            const dirZ = Math.cos(yaw);
            const sx =
              bPos.x + dirX * BOSS_CONFIG.phase1.crescentSpawnForwardOffset;
            const sy = BOSS_CONFIG.phase1.crescentSpawnHeight;
            const sz =
              bPos.z + dirZ * BOSS_CONFIG.phase1.crescentSpawnForwardOffset;

            const group = ctx.vfx.createCrescentBladeGroup(
              new THREE.Vector3(sx, sy, sz),
              yaw,
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: sy, z: sz },
                rotationY: yaw,
                scale: 1,
              },
              velocity: {
                vx: dirX * speed,
                vy: 0,
                vz: dirZ * speed,
                maxSpeed: speed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'GLACIAL_CRESCENT',
                damage: BOSS_CONFIG.crescentDamage,
                radius: BOSS_CONFIG.phase1.crescentHitRadius,
                life: BOSS_CONFIG.phase1.crescentLife,
                maxLife: BOSS_CONFIG.phase1.crescentLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 1,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: sy,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          });
        }
      },
    });

    // Phase 1 Pattern 3: Frost Ring Nova
    this.registerPattern({
      id: 'FROST_RING_NOVA',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        const bPos = ctx.bossEntity.transform.position;
        ctx.vfx.spawnTelegraphRing(new THREE.Vector3(bPos.x, 0.08, bPos.z));
        bp.activePatternFireTimer = BOSS_CONFIG.phase1.novaTelegraph;
        bp.activePatternDuration = BOSS_CONFIG.phase1.novaAttackDuration;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= bp.activePatternFireTimer
        ) {
          bp.activePatternLaunched = true;
          ctx.audio.playIceShatter(0.75);
          const bPos = ctx.bossEntity.transform.position;
          const group = ctx.vfx.createFrostRingNovaGroup(
            new THREE.Vector3(bPos.x, 0.12, bPos.z),
          );
          ctx.world.createEntity({
            transform: {
              position: { x: bPos.x, y: 0.12, z: bPos.z },
              rotationY: 0,
              scale: 1,
            },
            hazardZone: {
              kind: 'FROST_RING_NOVA',
              faction: 'BOSS',
              damage: BOSS_CONFIG.novaDamage,
              elapsed: 0,
              telegraphDuration: 0,
              activeDuration: BOSS_CONFIG.phase1.novaDuration,
              currentRadius: BOSS_CONFIG.phase1.novaStartRadius,
              maxRadius: BOSS_CONFIG.phase1.novaMaxRadius,
              hitThickness: BOSS_CONFIG.phase1.novaRingHitThickness,
              angle: 0,
              startAngle: 0,
              endAngle: 0,
              beamLength: 0,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: true,
            },
            meshRef: { object3D: group },
          });
        }
      },
    });

    // Phase 2 Pattern 1: Frost Clone Illusions
    this.registerPattern({
      id: 'FROST_CLONES',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playIceLance();
        ctx.clearActiveClones();

        const bPos = ctx.bossEntity.transform.position;
        let toX = ctx.playerPos.x - bPos.x;
        let toZ = ctx.playerPos.z - bPos.z;
        const len = Math.hypot(toX, toZ);
        if (len < 0.01) {
          toX = 0;
          toZ = 1;
        } else {
          toX /= len;
          toZ /= len;
        }
        const rightX = -toZ;
        const rightZ = toX;

        // Sideways dash burst for Marina
        bp.dashVelX = rightX * bp.orbitDir * BOSS_CONFIG.phase2.cloneDashSpeed;
        bp.dashVelZ = rightZ * bp.orbitDir * BOSS_CONFIG.phase2.cloneDashSpeed;
        bp.dashTimer = BOSS_CONFIG.phase2.cloneDashDuration;
        ctx.vfx.spawnFrostShatterBurst(
          new THREE.Vector3(bPos.x, 1.2, bPos.z),
          14,
          7.0,
        );

        const marinaRig = ctx.bossRig as unknown as Partial<MarinaRig>;
        if (typeof marinaRig.createIceCloneGroup === 'function') {
          ([-1, 1] as const).forEach((side) => {
            const cloneGroup = marinaRig.createIceCloneGroup!();
            let cx = bPos.x + rightX * (side * BOSS_CONFIG.phase2.cloneFlankOffset);
            let cz = bPos.z + rightZ * (side * BOSS_CONFIG.phase2.cloneFlankOffset);
            const radial = Math.hypot(cx, cz);
            if (radial > BOSS_CONFIG.innerTerraceLimit) {
              const s = BOSS_CONFIG.innerTerraceLimit / radial;
              cx *= s;
              cz *= s;
            }
            const yaw = Math.atan2(ctx.playerPos.x - cx, ctx.playerPos.z - cz);
            cloneGroup.position.set(cx, 0, cz);
            cloneGroup.rotation.y = yaw;
            ctx.vfx.attachToScene(cloneGroup);
            ctx.vfx.spawnFrostShatterBurst(
              new THREE.Vector3(cx, 1.25, cz),
              12,
              6.5,
            );

            ctx.world.createEntity({
              transform: {
                position: { x: cx, y: 0, z: cz },
                rotationY: yaw,
                scale: 1,
              },
              cloneIllusion: {
                ownerEntityId: ctx.bossEntity.id,
                side,
                life: BOSS_CONFIG.phase2.cloneDuration,
                maxLife: BOSS_CONFIG.phase2.cloneDuration,
                volleyTimer: BOSS_CONFIG.phase2.cloneVolleyInitialDelay,
                volleyCount: 0,
              },
              meshRef: { object3D: cloneGroup },
            });
          });
        }

        const mirrorCount = BOSS_CONFIG.phase2.cloneMirrorLanceCount;
        for (let k = 0; k < mirrorCount; k++) {
          const fanAngle =
            (k / (mirrorCount - 1) - 0.5) * BOSS_CONFIG.phase2.cloneMirrorLanceArc;
          ctx.spawnHoverLance(
            ctx.bossEntity.id,
            fanAngle,
            0.65 + k * 0.12,
            BOSS_CONFIG.phase1.lanceBaseHeight,
          );
        }

        bp.activePatternDuration = BOSS_CONFIG.phase2.cloneAttackDuration;
      },
    });

    // Phase 2 Pattern 2: Twin Glacial Laser Sweep
    this.registerPattern({
      id: 'TWIN_GLACIAL_LASER',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();

        const bPos = ctx.bossEntity.transform.position;
        const baseYaw = Math.atan2(
          ctx.playerPos.x - bPos.x,
          ctx.playerPos.z - bPos.z,
        );
        const beamLength = BOSS_CONFIG.phase2.laserLength;

        const configs = [
          {
            side: -1 as const,
            startAngle: baseYaw - BOSS_CONFIG.phase2.laserSweepStartOffset,
            endAngle: baseYaw + BOSS_CONFIG.phase2.laserSweepEndOffset,
          },
          {
            side: 1 as const,
            startAngle: baseYaw + BOSS_CONFIG.phase2.laserSweepStartOffset,
            endAngle: baseYaw - BOSS_CONFIG.phase2.laserSweepEndOffset,
          },
        ];

        configs.forEach((cfg) => {
          const origin = new THREE.Vector3(
            bPos.x,
            BOSS_CONFIG.phase2.laserHeight,
            bPos.z,
          );
          const group = ctx.vfx.createLaserBeamGroup(
            origin,
            cfg.side,
            cfg.startAngle,
            beamLength,
          );
          ctx.world.createEntity({
            transform: {
              position: {
                x: bPos.x,
                y: BOSS_CONFIG.phase2.laserHeight,
                z: bPos.z,
              },
              rotationY: cfg.startAngle,
              scale: 1,
            },
            hazardZone: {
              kind: 'GLACIAL_LASER',
              faction: 'BOSS',
              damage: BOSS_CONFIG.phase2.laserDamage,
              elapsed: 0,
              telegraphDuration: BOSS_CONFIG.phase2.laserTelegraph,
              activeDuration: BOSS_CONFIG.phase2.laserDuration,
              currentRadius: 0,
              maxRadius: 0,
              hitThickness: BOSS_CONFIG.phase2.laserHitWidth,
              angle: cfg.startAngle,
              startAngle: cfg.startAngle,
              endAngle: cfg.endAngle,
              beamLength,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: false,
            },
            meshRef: { object3D: group },
          });
        });

        bp.activePatternDuration =
          BOSS_CONFIG.phase2.laserTelegraph +
          BOSS_CONFIG.phase2.laserDuration +
          BOSS_CONFIG.phase2.laserRecoveryPad;
      },
    });

    // Phase 3 Pattern 1: Snowflake Bullet-Hell Curtain
    this.registerPattern({
      id: 'SNOWFLAKE_CURTAIN',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.bossRig.setAscendHeight(BOSS_CONFIG.phase3.ascendHeight);
        bp.ascendHeight = BOSS_CONFIG.phase3.ascendHeight;
        ctx.audio.playIceLance();

        bp.activePatternDuration = BOSS_CONFIG.phase3.spiralDuration;
        bp.activePatternFireTimer = BOSS_CONFIG.phase3.spiralInitialFireDelay;
        bp.activePatternAngle = 0;
      },
      tick(ctx, dt) {
        const bp = ctx.bossEntity.bossPhase;
        bp.activePatternFireTimer -= dt;
        if (
          bp.activePatternFireTimer <= 0 &&
          bp.activePatternElapsed <
            bp.activePatternDuration - BOSS_CONFIG.phase3.spiralStopBeforeEndPad
        ) {
          bp.activePatternFireTimer = BOSS_CONFIG.phase3.spiralFireInterval;
          const arms = BOSS_CONFIG.phase3.spiralArms;
          const origin = ctx.bossEntity.transform.position;
          const yHeight = BOSS_CONFIG.phase3.spiralOrbHeight;

          for (let i = 0; i < arms; i++) {
            const ang = bp.activePatternAngle + (i / arms) * Math.PI * 2;
            const dirX = Math.sin(ang);
            const dirZ = Math.cos(ang);
            const sx =
              origin.x + dirX * BOSS_CONFIG.phase3.spiralOrbSpawnRadius;
            const sz =
              origin.z + dirZ * BOSS_CONFIG.phase3.spiralOrbSpawnRadius;

            const group = ctx.vfx.createSpiralOrbGroup(
              new THREE.Vector3(sx, yHeight, sz),
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: yHeight, z: sz },
                rotationY: ang,
                scale: 1,
              },
              velocity: {
                vx: dirX * BOSS_CONFIG.phase3.spiralOrbSpeed,
                vy: 0,
                vz: dirZ * BOSS_CONFIG.phase3.spiralOrbSpeed,
                maxSpeed: BOSS_CONFIG.phase3.spiralOrbSpeed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: BOSS_CONFIG.phase3.spiralOrbDamage,
                radius: BOSS_CONFIG.phase3.spiralOrbHitRadius,
                life: BOSS_CONFIG.phase3.spiralOrbLife,
                maxLife: BOSS_CONFIG.phase3.spiralOrbLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: yHeight,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          }

          bp.activePatternAngle += BOSS_CONFIG.phase3.spiralAngleStep;
        }
      },
      finish(ctx) {
        ctx.bossRig.setAscendHeight(0);
        ctx.bossEntity.bossPhase.ascendHeight = 0;
      },
    });

    // Phase 3 Pattern 2: Falling Ice-Pillar Telegraphs
    this.registerPattern({
      id: 'FALLING_ICE_PILLARS',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playIceLance();

        const predX =
          ctx.playerPos.x +
          ctx.playerVel.x * BOSS_CONFIG.phase3.pillarPredictFactor;
        const predZ =
          ctx.playerPos.z +
          ctx.playerVel.z * BOSS_CONFIG.phase3.pillarPredictFactor;
        const radius = BOSS_CONFIG.phase3.pillarRuneRadius;
        const flank = BOSS_CONFIG.phase3.pillarFlankOffset;
        const maxR =
          ARENA_CONFIG.playerClampRadius - BOSS_CONFIG.phase3.pillarEdgeMargin;

        const baseAngle = Math.random() * Math.PI * 2;
        const offsets = [
          { x: 0, z: 0 },
          { x: Math.cos(baseAngle) * flank, z: Math.sin(baseAngle) * flank },
          {
            x: Math.cos(baseAngle + 2.1) * flank,
            z: Math.sin(baseAngle + 2.1) * flank,
          },
          {
            x: Math.cos(baseAngle + 4.2) * flank,
            z: Math.sin(baseAngle + 4.2) * flank,
          },
        ];

        offsets.forEach((off, idx) => {
          let rx = predX + off.x;
          let rz = predZ + off.z;
          const dist = Math.hypot(rx, rz);
          if (dist > maxR && dist > 0.001) {
            rx = (rx / dist) * maxR;
            rz = (rz / dist) * maxR;
          }

          const group = ctx.vfx.createIcePillarGroup(
            new THREE.Vector3(rx, 0.05, rz),
            radius,
          );
          ctx.world.createEntity({
            transform: {
              position: { x: rx, y: 0.05, z: rz },
              rotationY: 0,
              scale: 1,
            },
            hazardZone: {
              kind: 'ICE_PILLAR',
              faction: 'BOSS',
              damage: BOSS_CONFIG.phase3.pillarDamage,
              elapsed: -idx * BOSS_CONFIG.phase3.pillarCascadeStep,
              telegraphDuration: BOSS_CONFIG.phase3.pillarTelegraph,
              activeDuration: BOSS_CONFIG.phase3.pillarEruptDuration,
              currentRadius: radius,
              maxRadius: radius,
              hitThickness: 0,
              angle: 0,
              startAngle: 0,
              endAngle: 0,
              beamLength: 0,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: false,
            },
            meshRef: { object3D: group },
          });
        });

        bp.activePatternDuration = BOSS_CONFIG.phase3.pillarAttackDuration;
      },
    });

    this.registerProfile({
      bossId: BOSS_CONFIG.defaultId,
      phase2Threshold: BOSS_CONFIG.phase2.threshold,
      phase3Threshold: BOSS_CONFIG.phase3.threshold,
      staggerThreshold: BOSS_CONFIG.staggerThreshold,
      phase2Opener: 'FROST_CLONES',
      phase3Opener: 'SNOWFLAKE_CURTAIN',
      closeRangePattern: 'FROST_RING_NOVA',
      phase1Cycle: ['ICE_LANCE_FAN', 'CRESCENT_WAVE', 'FROST_RING_NOVA'],
      phase2Cycle: [
        'TWIN_GLACIAL_LASER',
        'ICE_LANCE_FAN',
        'FROST_CLONES',
        'CRESCENT_WAVE',
        'FROST_RING_NOVA',
      ],
      phase3Cycle: [
        'FALLING_ICE_PILLARS',
        'SNOWFLAKE_CURTAIN',
        'TWIN_GLACIAL_LASER',
        'FROST_CLONES',
        'CRESCENT_WAVE',
      ],
      getCooldown(phase: BossPhase): number {
        if (phase === BOSS_PHASES.PHASE_3) {
          return (
            BOSS_CONFIG.phase3.attackCooldownMin +
            Math.random() *
              (BOSS_CONFIG.phase3.attackCooldownMax -
                BOSS_CONFIG.phase3.attackCooldownMin)
          );
        }
        if (phase === BOSS_PHASES.PHASE_2) {
          return (
            BOSS_CONFIG.phase2.attackCooldownMin +
            Math.random() *
              (BOSS_CONFIG.phase2.attackCooldownMax -
                BOSS_CONFIG.phase2.attackCooldownMin)
          );
        }
        return (
          BOSS_CONFIG.phase1.attackCooldownMin +
          Math.random() *
            (BOSS_CONFIG.phase1.attackCooldownMax -
              BOSS_CONFIG.phase1.attackCooldownMin)
        );
      },
    });
  }

  /**
   * Registers Serena, Voice of the Deep's 3-phase aquatic attack strategies (OCP):
   * - Phase I: TIDAL_SWEEP (low-altitude crescent waves) + BUBBLE_CHORALE (clearable bubble clusters)
   * - Phase II: HARMONIC_SPIRAL (rapid lateral tail-glide + double wave arcs & harmonic spirals)
   * - Phase III: ABYSSAL_UNDERTOW (swirling floor whirlpool pull + delayed boiling geysers)
   */
  private registerSerenaPatterns(): void {
    // Phase I Pattern 1: Tidal Sweep (low-altitude crescent water waves)
    this.registerPattern({
      id: 'TIDAL_SWEEP',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        bp.activePatternFireTimer = SERENA_CONFIG.tidalSweep.waveTelegraphSec;
        bp.activePatternDuration =
          SERENA_CONFIG.tidalSweep.waveTelegraphSec +
          SERENA_CONFIG.tidalSweep.waveRecoverySec;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= bp.activePatternFireTimer
        ) {
          bp.activePatternLaunched = true;
          ctx.audio.playTidalWave();
          const bPos = ctx.bossEntity.transform.position;
          const dx = ctx.playerPos.x - bPos.x;
          const dz = ctx.playerPos.z - bPos.z;
          const baseYaw = dx * dx + dz * dz < 0.01 ? 0 : Math.atan2(dx, dz);

          const count = SERENA_CONFIG.tidalSweep.waveCount;
          const arc = SERENA_CONFIG.tidalSweep.waveArcSpread;
          const speed = SERENA_CONFIG.tidalSweep.waveSpeed;

          for (let i = 0; i < count; i++) {
            const t = count > 1 ? i / (count - 1) - 0.5 : 0;
            const yaw = baseYaw + t * arc;
            const dirX = Math.sin(yaw);
            const dirZ = Math.cos(yaw);
            const sx =
              bPos.x + dirX * SERENA_CONFIG.tidalSweep.waveSpawnForwardOffset;
            const sy = SERENA_CONFIG.tidalSweep.waveSpawnHeight;
            const sz =
              bPos.z + dirZ * SERENA_CONFIG.tidalSweep.waveSpawnForwardOffset;

            const group = ctx.vfx.createCrescentBladeGroup(
              new THREE.Vector3(sx, sy, sz),
              yaw,
              true,
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: sy, z: sz },
                rotationY: yaw,
                scale: 1,
              },
              velocity: {
                vx: dirX * speed,
                vy: 0,
                vz: dirZ * speed,
                maxSpeed: speed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'GLACIAL_CRESCENT',
                damage: SERENA_CONFIG.tidalSweep.waveDamage,
                radius: SERENA_CONFIG.tidalSweep.waveRadius,
                life: SERENA_CONFIG.tidalSweep.waveLife,
                maxLife: SERENA_CONFIG.tidalSweep.waveLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 1,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: sy,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          }
        }
      },
    });

    // Phase I & II Pattern 2: Bubble Chorale (fanning/orbiting bubble clusters clearable by Umbral Pulse)
    this.registerPattern({
      id: 'BUBBLE_CHORALE',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        bp.activePatternDuration = SERENA_CONFIG.bubbleChorale.patternDuration;
        bp.activePatternFireTimer = 0.25;
        bp.activePatternAngle = 0;
      },
      tick(ctx, dt) {
        const bp = ctx.bossEntity.bossPhase;
        bp.activePatternFireTimer -= dt;
        if (
          bp.activePatternFireTimer <= 0 &&
          bp.activePatternElapsed < bp.activePatternDuration - 0.35
        ) {
          bp.activePatternFireTimer = SERENA_CONFIG.bubbleChorale.burstInterval;
          ctx.audio.playBubblePop();

          const bPos = ctx.bossEntity.transform.position;
          const count = SERENA_CONFIG.bubbleChorale.orbCount;
          const speed = SERENA_CONFIG.bubbleChorale.orbSpeed;
          const yHeight = SERENA_CONFIG.bubbleChorale.orbHeight;

          for (let i = 0; i < count; i++) {
            const ang =
              bp.activePatternAngle + (i / count) * Math.PI * 2;
            const dirX = Math.sin(ang);
            const dirZ = Math.cos(ang);
            const sx = bPos.x + dirX * 1.1;
            const sz = bPos.z + dirZ * 1.1;
            const group = ctx.vfx.createSpiralOrbGroup(
              new THREE.Vector3(sx, yHeight, sz),
              true,
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: yHeight, z: sz },
                rotationY: ang,
                scale: 1,
              },
              velocity: {
                vx: dirX * speed,
                vy: 0,
                vz: dirZ * speed,
                maxSpeed: speed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: SERENA_CONFIG.bubbleChorale.orbDamage,
                radius: SERENA_CONFIG.bubbleChorale.orbRadius,
                life: SERENA_CONFIG.bubbleChorale.orbLife,
                maxLife: SERENA_CONFIG.bubbleChorale.orbLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: yHeight,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          }

          bp.activePatternAngle += Math.PI / count;
        }
      },
    });

    // Phase II Signature: Siren's Harmonic Spiral (fast lateral tail-glide + double intersecting wave arcs + harmonic spirals)
    this.registerPattern({
      id: 'HARMONIC_SPIRAL',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playTidalWave();

        const bPos = ctx.bossEntity.transform.position;
        let toX = ctx.playerPos.x - bPos.x;
        let toZ = ctx.playerPos.z - bPos.z;
        const len = Math.hypot(toX, toZ);
        if (len < 0.01) {
          toX = 0;
          toZ = 1;
        } else {
          toX /= len;
          toZ /= len;
        }
        const rightX = -toZ;
        const rightZ = toX;

        // High-speed lateral tail-glide burst
        bp.dashVelX = rightX * bp.orbitDir * SERENA_CONFIG.sirensChorale.dashSpeed;
        bp.dashVelZ = rightZ * bp.orbitDir * SERENA_CONFIG.sirensChorale.dashSpeed;
        bp.dashTimer = SERENA_CONFIG.sirensChorale.dashDuration;

        // First intersecting crescent water wave arc
        const baseYaw = Math.atan2(toX, toZ);
        const count = SERENA_CONFIG.sirensChorale.waveCount;
        const arc = SERENA_CONFIG.sirensChorale.waveArcSpread;
        const speed = SERENA_CONFIG.sirensChorale.waveSpeed;

        for (let i = 0; i < count; i++) {
          const t = count > 1 ? i / (count - 1) - 0.5 : 0;
          const yaw = baseYaw + t * arc;
          const dirX = Math.sin(yaw);
          const dirZ = Math.cos(yaw);
          const sx = bPos.x + dirX * 1.05;
          const sy = SERENA_CONFIG.tidalSweep.waveSpawnHeight;
          const sz = bPos.z + dirZ * 1.05;
          const group = ctx.vfx.createCrescentBladeGroup(
            new THREE.Vector3(sx, sy, sz),
            yaw,
            true,
          );
          ctx.world.createEntity({
            transform: {
              position: { x: sx, y: sy, z: sz },
              rotationY: yaw,
              scale: 1,
            },
            velocity: {
              vx: dirX * speed,
              vy: 0,
              vz: dirZ * speed,
              maxSpeed: speed,
            },
            projectile: {
              faction: 'BOSS',
              kind: 'GLACIAL_CRESCENT',
              damage: SERENA_CONFIG.sirensChorale.waveDamage,
              radius: SERENA_CONFIG.sirensChorale.waveRadius,
              life: SERENA_CONFIG.tidalSweep.waveLife,
              maxLife: SERENA_CONFIG.tidalSweep.waveLife,
              trailTimer: 0,
              spinSpeed: 0,
              pierceRemaining: 1,
              hitEntityIds: [],
              state: 'FLY',
              fireDelay: 0,
              fanAngle: 0,
              baseHeight: sy,
              ownerEntityId: ctx.bossEntity.id,
            },
            meshRef: { object3D: group },
          });
        }

        bp.activePatternDuration = SERENA_CONFIG.sirensChorale.patternDuration;
        bp.activePatternFireTimer = 0.3;
        bp.activePatternAngle = baseYaw;
      },
      tick(ctx, dt) {
        const bp = ctx.bossEntity.bossPhase;
        // Launch counter-arc wave midway through the glide
        if (!bp.activePatternLaunched && bp.activePatternElapsed >= 0.85) {
          bp.activePatternLaunched = true;
          ctx.audio.playTidalWave();
          const bPos = ctx.bossEntity.transform.position;
          const baseYaw = Math.atan2(
            ctx.playerPos.x - bPos.x,
            ctx.playerPos.z - bPos.z,
          );
          const count = SERENA_CONFIG.sirensChorale.waveCount;
          const arc = SERENA_CONFIG.sirensChorale.waveArcSpread;
          const speed = SERENA_CONFIG.sirensChorale.waveSpeed;

          for (let i = 0; i < count; i++) {
            const t = count > 1 ? i / (count - 1) - 0.5 : 0;
            const yaw = baseYaw + t * arc + 0.14;
            const dirX = Math.sin(yaw);
            const dirZ = Math.cos(yaw);
            const sx = bPos.x + dirX * 1.05;
            const sy = SERENA_CONFIG.tidalSweep.waveSpawnHeight;
            const sz = bPos.z + dirZ * 1.05;
            const group = ctx.vfx.createCrescentBladeGroup(
              new THREE.Vector3(sx, sy, sz),
              yaw,
              true,
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: sy, z: sz },
                rotationY: yaw,
                scale: 1,
              },
              velocity: {
                vx: dirX * speed,
                vy: 0,
                vz: dirZ * speed,
                maxSpeed: speed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'GLACIAL_CRESCENT',
                damage: SERENA_CONFIG.sirensChorale.waveDamage,
                radius: SERENA_CONFIG.sirensChorale.waveRadius,
                life: SERENA_CONFIG.tidalSweep.waveLife,
                maxLife: SERENA_CONFIG.tidalSweep.waveLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 1,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: sy,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          }
        }

        // Rotating 6-arm harmonic bubble spiral
        bp.activePatternFireTimer -= dt;
        if (
          bp.activePatternFireTimer <= 0 &&
          bp.activePatternElapsed < bp.activePatternDuration - 0.35
        ) {
          bp.activePatternFireTimer = SERENA_CONFIG.sirensChorale.spiralFireInterval;
          ctx.audio.playBubblePop();
          const bPos = ctx.bossEntity.transform.position;
          const arms = SERENA_CONFIG.sirensChorale.spiralArms;
          const speed = SERENA_CONFIG.sirensChorale.orbSpeed;
          const yHeight = SERENA_CONFIG.bubbleChorale.orbHeight;

          for (let i = 0; i < arms; i++) {
            const ang = bp.activePatternAngle + (i / arms) * Math.PI * 2;
            const dirX = Math.sin(ang);
            const dirZ = Math.cos(ang);
            const sx = bPos.x + dirX * 1.1;
            const sz = bPos.z + dirZ * 1.1;
            const group = ctx.vfx.createSpiralOrbGroup(
              new THREE.Vector3(sx, yHeight, sz),
              true,
            );
            ctx.world.createEntity({
              transform: {
                position: { x: sx, y: yHeight, z: sz },
                rotationY: ang,
                scale: 1,
              },
              velocity: {
                vx: dirX * speed,
                vy: 0,
                vz: dirZ * speed,
                maxSpeed: speed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: SERENA_CONFIG.sirensChorale.orbDamage,
                radius: SERENA_CONFIG.bubbleChorale.orbRadius,
                life: SERENA_CONFIG.bubbleChorale.orbLife,
                maxLife: SERENA_CONFIG.bubbleChorale.orbLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: 0,
                baseHeight: yHeight,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: group },
            });
          }
          bp.activePatternAngle += SERENA_CONFIG.sirensChorale.spiralAngleStep;
        }
      },
    });

    // Phase III Signature: Abyssal Undertow (swirling whirlpool pull + delayed boiling geyser pillars)
    this.registerPattern({
      id: 'ABYSSAL_UNDERTOW',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const cfg = SERENA_CONFIG.abyssalUndertow;
        ctx.bossRig.triggerCastFlourish();
        ctx.bossRig.setAscendHeight(cfg.ascendHeight);
        bp.ascendHeight = cfg.ascendHeight;
        ctx.audio.playTidalWave();

        // Spawn visible swirling floor whirlpool pulling the Dark Mage gently toward center
        const vortexOrigin = new THREE.Vector3(0, 0.08, 0);
        const vortexGroup = ctx.vfx.createAbyssalWhirlpoolGroup(
          vortexOrigin,
          cfg.whirlpoolRadius,
        );
        ctx.world.createEntity({
          transform: {
            position: { x: 0, y: 0.08, z: 0 },
            rotationY: 0,
            scale: 1,
          },
          hazardZone: {
            kind: 'ABYSSAL_WHIRLPOOL',
            faction: 'BOSS',
            damage: 0,
            elapsed: 0,
            telegraphDuration: 0,
            activeDuration: cfg.undertowDuration,
            currentRadius: cfg.whirlpoolRadius,
            maxRadius: cfg.whirlpoolRadius,
            hitThickness: 0,
            angle: 0,
            startAngle: 0,
            endAngle: 0,
            beamLength: 0,
            hitCooldown: 0,
            hasHitPlayer: false,
            hasTriggered: true,
          },
          meshRef: { object3D: vortexGroup },
        });

        // Schedule delayed boiling geyser eruptions around the amphitheater + under player
        const geyserCount = cfg.geyserCount;
        const baseAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < geyserCount; i++) {
          let gx: number;
          let gz: number;
          if (i === 0) {
            gx = ctx.playerPos.x + ctx.playerVel.x * 0.45;
            gz = ctx.playerPos.z + ctx.playerVel.z * 0.45;
          } else {
            const ang = baseAngle + ((i - 1) / (geyserCount - 1)) * Math.PI * 2;
            const ringR =
              cfg.geyserMinRadius +
              (i % 2 === 0 ? 0.62 : 0.25) *
                (cfg.geyserMaxRadius - cfg.geyserMinRadius);
            gx = Math.cos(ang) * ringR;
            gz = Math.sin(ang) * ringR;
          }

          const dist = Math.hypot(gx, gz);
          if (dist > cfg.geyserMaxRadius && dist > 0.001) {
            gx = (gx / dist) * cfg.geyserMaxRadius;
            gz = (gz / dist) * cfg.geyserMaxRadius;
          }

          const geyserGroup = ctx.vfx.createIcePillarGroup(
            new THREE.Vector3(gx, 0.05, gz),
            cfg.geyserRadius,
            true,
          );
          ctx.world.createEntity({
            transform: {
              position: { x: gx, y: 0.05, z: gz },
              rotationY: 0,
              scale: 1,
            },
            hazardZone: {
              kind: 'ICE_PILLAR',
              faction: 'BOSS',
              damage: cfg.geyserDamage,
              elapsed: -i * cfg.geyserCascadeStep,
              telegraphDuration: cfg.geyserTelegraphSec,
              activeDuration: cfg.geyserEruptDuration,
              currentRadius: cfg.geyserRadius,
              maxRadius: cfg.geyserRadius,
              hitThickness: 0,
              angle: 0,
              startAngle: 0,
              endAngle: 0,
              beamLength: 0,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: false,
            },
            meshRef: { object3D: geyserGroup },
          });
        }

        bp.activePatternDuration = cfg.patternDuration;
      },
      finish(ctx) {
        ctx.bossRig.setAscendHeight(0);
        ctx.bossEntity.bossPhase.ascendHeight = 0;
      },
    });

    this.registerProfile({
      bossId: SERENA_CONFIG.id,
      phase2Threshold: SERENA_CONFIG.phase2HpThreshold,
      phase3Threshold: SERENA_CONFIG.phase3HpThreshold,
      staggerThreshold: SERENA_CONFIG.staggerHpThreshold,
      phase2Opener: 'HARMONIC_SPIRAL',
      phase3Opener: 'ABYSSAL_UNDERTOW',
      closeRangePattern: null,
      phase1Cycle: ['TIDAL_SWEEP', 'BUBBLE_CHORALE', 'TIDAL_SWEEP'],
      phase2Cycle: ['HARMONIC_SPIRAL', 'BUBBLE_CHORALE', 'TIDAL_SWEEP'],
      phase3Cycle: [
        'ABYSSAL_UNDERTOW',
        'HARMONIC_SPIRAL',
        'BUBBLE_CHORALE',
        'TIDAL_SWEEP',
      ],
      getCooldown(phase: BossPhase): number {
        if (phase === BOSS_PHASES.PHASE_3) {
          return SERENA_CONFIG.abyssalUndertow.attackCooldown;
        }
        if (phase === BOSS_PHASES.PHASE_2) {
          return SERENA_CONFIG.sirensChorale.attackCooldown;
        }
        return SERENA_CONFIG.tidalSweep.attackCooldown;
      },
    });
  }
}
