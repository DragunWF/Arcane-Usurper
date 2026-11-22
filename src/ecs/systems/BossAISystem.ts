import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  GAME_STATES,
  MIKU_CONFIG,
  NG_PLUS_CONFIG,
  PALETTE,
  SERENA_CONFIG,
  SPECIAL_SCENARIO_CONFIG,
  STOLEN_KISS_CONFIG,
  WOLF_AND_RAVEN_CONFIG,
  type BossPhase,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type {
  FrostRingMeshHandles,
  IVfxSpawner,
} from '../../engine/VfxFactory';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import type { GeraltRig } from '../../rigs/bosses/GeraltRig';
import type { MarinaRig } from '../../rigs/bosses/MarinaRig';
import type { YenneferRig } from '../../rigs/bosses/YenneferRig';
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
  readonly addCameraShake: (amount: number) => void;
  readonly damagePlayerMelee: (amount: number) => void;
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
  onStaggerTriggered: (bossEntityId?: EntityId) => void;
  onDuoAllyVanquished?: (bannerTitle: string, bannerSubtext: string) => void;
  onPlayerMeleeHit?: (amount: number) => void;
}

/**
 * Executes multi-phase sovereign boss attack patterns, holographic clone volleys,
 * phase threshold transitions, dynamic N-Boss AI, ash-dissolve ticks, and STAGGER.
 */
export class BossAISystem implements ISystem {
  private readonly world: ECSWorld;
  private bossRig: BossRigAdapter;
  private readonly bossRigs = new Map<EntityId, BossRigAdapter>();
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
    this.registerMikuPatterns();
    this.registerSpecialScenarioPatterns();
  }

  public setBossRig(rig: BossRigAdapter): void {
    this.bossRig = rig;
  }

  public setBossRigs(rigs: ReadonlyMap<EntityId, BossRigAdapter>): void {
    this.bossRigs.clear();
    rigs.forEach((rig, id) => {
      this.bossRigs.set(id, rig);
    });
  }

  private getBossRigForEntity(entityId: EntityId): BossRigAdapter {
    return this.bossRigs.get(entityId) ?? this.bossRig;
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

    const ampNodes = this.world.query('harmonicAmpNode');
    for (let i = 0; i < ampNodes.length; i++) {
      const n = ampNodes[i];
      if (n) toDestroy.push(n.id);
    }

    for (let i = 0; i < toDestroy.length; i++) {
      const id = toDestroy[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }

    const allBosses = this.world.query('bossPhase');
    for (let i = 0; i < allBosses.length; i++) {
      const b = allBosses[i];
      if (!b) continue;
      b.bossPhase.activePatternId = null;
      b.bossPhase.ascendHeight = 0;
      this.getBossRigForEntity(b.id).setAscendHeight(0);
    }
  }

  /**
   * Evaluates HP ratios across all active bosses after CombatSystem applies damage,
   * triggering Phase 2, Phase 3, or lethal STAGGER strictly for `canBeSiphoned === true` bosses.
   */
  public evaluateHealthThresholds(): void {
    const bosses = this.world.query('bossPhase', 'health', 'transform');
    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      if (!boss) continue;
      const { bossPhase, health, transform } = boss;
      if (
        bossPhase.isStaggered ||
        bossPhase.isDefeated ||
        bossPhase.dissolveTimer >= 0
      ) {
        continue;
      }

      const rig = this.getBossRigForEntity(boss.id);
      const profile = this.getActiveProfile(bossPhase.bossId);
      const hpRatio = health.current / Math.max(1, health.max);

      // Asymmetric Siphon Gate: only `canBeSiphoned === true` bosses enter STAGGER for [E]/[R] finishers
      if (
        bossPhase.canBeSiphoned &&
        (bossPhase.staggerThreshold <= 0
          ? health.current <= 0
          : hpRatio <= bossPhase.staggerThreshold)
      ) {
        bossPhase.isStaggered = true;
        bossPhase.expression = BOSS_EXPRESSIONS.STAGGER;
        this.clearAllBossHazards();
        rig.setPhaseVisuals(BOSS_PHASES.PHASE_1);
        rig.setAscendHeight(0);

        this.vfx.spawnFrostShatterBurst(
          new THREE.Vector3(
            transform.position.x,
            1.25,
            transform.position.z,
          ),
          38,
          11.0,
        );
        rig.setExpression(BOSS_EXPRESSIONS.STAGGER);
        this.callbacks.addCameraShake(BOSS_CONFIG.staggerCameraShake);
        this.audio.playIceShatter(1.0);
        this.callbacks.onStaggerTriggered(boss.id);
        return;
      }

      if (
        bossPhase.phase < BOSS_PHASES.PHASE_3 &&
        hpRatio <= profile.phase3Threshold
      ) {
        this.transitionToPhase(
          bossPhase,
          rig,
          transform.position,
          BOSS_PHASES.PHASE_3,
        );
      } else if (
        bossPhase.phase < BOSS_PHASES.PHASE_2 &&
        hpRatio <= profile.phase2Threshold
      ) {
        this.transitionToPhase(
          bossPhase,
          rig,
          transform.position,
          BOSS_PHASES.PHASE_2,
        );
      }
    }
  }

  private transitionToPhase(
    bossPhase: BossPhaseStateComponent,
    rig: BossRigAdapter,
    pos: { x: number; y: number; z: number },
    newPhase: BossPhase,
  ): void {
    bossPhase.phase = newPhase;
    rig.setPhaseVisuals(newPhase);
    rig.triggerCastFlourish();

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

    rig.setAscendHeight(0);
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
    if (bossPhase.canBeSiphoned) {
      this.callbacks.onPhaseChanged(newPhase);
    }
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();
    const bosses = this.world.query('bossPhase', 'transform', 'health');
    const player = this.world.queryFirst('playerTag', 'transform', 'velocity');
    if (bosses.length === 0 || !player) return;

    this.updateClonesAI(dt);
    this.updateHarmonicAmpNodes(dt, player.transform.position);

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

    const encoreTier =
      this.world.queryFirst('playerTag', 'playerCombat')?.playerCombat
        .encoreTier ?? 0;

    for (let i = 0; i < bosses.length; i++) {
      const boss = bosses[i];
      if (!boss) continue;
      const bp = boss.bossPhase;
      if (bp.isDefeated) continue;

      const rig = this.getBossRigForEntity(boss.id);

      // Step lethal stagger-collapse & 1.6s ash/ember dissolution for defeated non-siphonable bosses
      if (bp.dissolveTimer >= 0) {
        // First frame of Geralt's collapse: notify HUD banner & enrage surviving Sovereign partner
        if (bp.dissolveTimer === 0) {
          bp.quenHitsRemaining = 0;
          bp.quenTimer = 0;
          if (bp.bossId === SPECIAL_SCENARIO_CONFIG.geraltId) {
            this.audio.playAshDissolve();
            (rig as GeraltRig).setQuenVisual(false, 0);
            (rig as GeraltRig).setAmberBladeTrail(0);
            (rig as GeraltRig).setIgniChannel(0);
            for (let j = 0; j < bosses.length; j++) {
              const ally = bosses[j];
              if (
                ally &&
                ally.id !== boss.id &&
                !ally.bossPhase.isDefeated &&
                ally.bossPhase.canBeSiphoned
              ) {
                ally.bossPhase.isSoloEnraged = true;
                ally.bossPhase.attackCooldown = Math.min(
                  ally.bossPhase.attackCooldown,
                  0.45,
                );
                ally.bossPhase.riftCooldown = Math.min(
                  ally.bossPhase.riftCooldown,
                  0.6,
                );
                this.getBossRigForEntity(ally.id).triggerCastFlourish();
              }
            }
            this.callbacks.onDuoAllyVanquished?.(
              WOLF_AND_RAVEN_CONFIG.geraltVanquishedBannerText,
              WOLF_AND_RAVEN_CONFIG.geraltVanquishedSubtext,
            );
          }
        }

        const prevStep = Math.floor(
          bp.dissolveTimer / SPECIAL_SCENARIO_CONFIG.ashEmberBurstIntervalSec,
        );
        bp.dissolveTimer += dt;
        const nextStep = Math.floor(
          bp.dissolveTimer / SPECIAL_SCENARIO_CONFIG.ashEmberBurstIntervalSec,
        );
        const progress = THREE.MathUtils.clamp(
          bp.dissolveTimer / SPECIAL_SCENARIO_CONFIG.ashDissolveDurationSec,
          0,
          1,
        );
        rig.applyAshDissolve(progress);

        if (nextStep > prevStep) {
          this.scratchOrigin.set(
            boss.transform.position.x,
            0.75 + (1 - progress) * 0.65,
            boss.transform.position.z,
          );
          this.vfx.spawnImpactBurst(this.scratchOrigin, 8);
        }

        if (bp.dissolveTimer >= SPECIAL_SCENARIO_CONFIG.ashDissolveDurationSec) {
          bp.isDefeated = true;
          rig.root.visible = false;
          this.scratchOrigin.set(
            boss.transform.position.x,
            0.85,
            boss.transform.position.z,
          );
          this.vfx.spawnFrostShatterBurst(this.scratchOrigin, 16, 7.2);
        }
        continue;
      }

      // Tick Geralt Quen Shield & Yennefer Spatial Rift Cooldowns
      if (bp.quenTimer > 0) {
        bp.quenTimer = Math.max(0, bp.quenTimer - dt);
        if (bp.quenTimer <= 0 && bp.quenHitsRemaining > 0) {
          bp.quenHitsRemaining = 0;
          bp.quenCooldown = WOLF_AND_RAVEN_CONFIG.quenCooldownSec;
          if (bp.bossId === SPECIAL_SCENARIO_CONFIG.geraltId) {
            (rig as GeraltRig).setQuenVisual(false, 0);
          }
        }
      } else if (bp.quenCooldown > 0) {
        bp.quenCooldown = Math.max(0, bp.quenCooldown - dt);
      }

      if (bp.riftCooldown > 0) {
        bp.riftCooldown = Math.max(0, bp.riftCooldown - dt);
      }

      // Asymmetric Siphon Gate: only siphonable bosses tick STOLEN_KISS exposure windows
      if (bp.canBeSiphoned) {
        const allowBlindspot =
          state === GAME_STATES.BOSS_COMBAT &&
          !bp.isStaggered &&
          boss.health.current > STOLEN_KISS_CONFIG.minRemainingBossHp;
        rig.tickBlindspotState(dt, elapsed, allowBlindspot);
      }

      if (state !== GAME_STATES.BOSS_COMBAT || bp.isStaggered) {
        continue;
      }

      const ctx: BossPatternContext = {
        world: this.world,
        bossEntity: boss,
        playerPos: this.scratchPlayerPos,
        playerVel: this.scratchPlayerVel,
        bossRig: rig,
        audio: this.audio,
        vfx: this.vfx,
        addCameraShake: (amount) => this.callbacks.addCameraShake(amount),
        damagePlayerMelee: (amount) => this.callbacks.onPlayerMeleeHit?.(amount),
        spawnHoverLance: (ownerEntityId, fanAngle, fireDelay, baseHeight) =>
          this.spawnHoverLance(ownerEntityId, fanAngle, fireDelay, baseHeight),
        clearActiveClones: () => this.clearActiveClones(),
      };

      const profile = this.getActiveProfile(bp.bossId);
      const distToPlayer = Math.hypot(
        this.scratchPlayerPos.x - boss.transform.position.x,
        this.scratchPlayerPos.z - boss.transform.position.z,
      );

      // Yennefer Spatial Rift Repositioning when Dark Mage pressures her closely outside exposure/channel windows
      if (
        bp.bossId === SPECIAL_SCENARIO_CONFIG.yenneferId &&
        bp.activePatternId === null &&
        rig.exposureTimer <= 0 &&
        bp.riftCooldown <= 0 &&
        distToPlayer < WOLF_AND_RAVEN_CONFIG.riftTriggerDist
      ) {
        this.executeYenneferSpatialRift(boss, rig as YenneferRig);
      }

      if (bp.activePatternId !== null) {
        const patternDt = bp.isSoloEnraged
          ? dt * WOLF_AND_RAVEN_CONFIG.soloEnrageSpeedMult
          : dt;
        bp.activePatternElapsed += patternDt;
        const strategy = this.strategies.get(bp.activePatternId);
        if (strategy?.tick) {
          strategy.tick(ctx, patternDt);
        }

        if (bp.activePatternElapsed >= bp.activePatternDuration) {
          const finishedPatternId = bp.activePatternId;
          if (strategy?.finish) {
            strategy.finish(ctx);
          }
          bp.activePatternId = null;
          bp.patternSubStage = 0;
          bp.attackCooldown = profile.getCooldown(bp.phase);
          if (bp.isSoloEnraged) {
            bp.attackCooldown /= WOLF_AND_RAVEN_CONFIG.soloEnrageSpeedMult;
          }

          // Open Mid-Fight Stolen Kiss 360° frontal guard-break window strictly for siphonable bosses
          if (
            bp.canBeSiphoned &&
            !bp.isStaggered &&
            boss.health.current > STOLEN_KISS_CONFIG.minRemainingBossHp &&
            rig.stolenKissCooldownTimer <= 0 &&
            (
              STOLEN_KISS_CONFIG.heavyExposurePatterns as readonly string[]
            ).includes(finishedPatternId)
          ) {
            if (rig.triggerBlindspotExposure()) {
              this.audio.playStolenKissWindowChime();
            }
          }

          if (encoreTier > 0) {
            const cdScale = Math.max(
              NG_PLUS_CONFIG.minCooldownScale,
              Math.pow(NG_PLUS_CONFIG.bossCooldownReductionPerTier, encoreTier),
            );
            bp.attackCooldown *= cdScale;
          }
        }
        continue;
      }

      const cooldownDt = bp.isSoloEnraged
        ? dt * WOLF_AND_RAVEN_CONFIG.soloEnrageSpeedMult
        : dt;
      bp.attackCooldown -= cooldownDt;
      if (bp.attackCooldown > 0) continue;

      if (bp.pendingPhaseOpener) {
        bp.pendingPhaseOpener = false;
        if (bp.phase === BOSS_PHASES.PHASE_2) {
          this.startPattern(profile.phase2Opener, ctx);
          continue;
        }
        if (bp.phase === BOSS_PHASES.PHASE_3) {
          this.startPattern(profile.phase3Opener, ctx);
          continue;
        }
      }

      // Geralt proactively refreshes Quen barrier when cooldown is ready
      if (
        bp.bossId === SPECIAL_SCENARIO_CONFIG.geraltId &&
        bp.quenHitsRemaining <= 0 &&
        bp.quenCooldown <= 0
      ) {
        this.startPattern('GERALT_QUEN_SHIELD', ctx);
        continue;
      }

      if (
        profile.closeRangePattern !== null &&
        distToPlayer <= BOSS_CONFIG.novaTriggerDist &&
        bp.patternIndex % 2 === 0
      ) {
        bp.patternIndex++;
        this.startPattern(profile.closeRangePattern, ctx);
        continue;
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
  }

  private executeYenneferSpatialRift(
    boss: EntityWith<'bossPhase' | 'transform'>,
    rig: YenneferRig,
  ): void {
    const bp = boss.bossPhase;
    const pos = boss.transform.position;
    const cfg = WOLF_AND_RAVEN_CONFIG;

    // 1. Spawn royal-violet vertical Spatial Rift at departure point
    this.scratchOrigin.set(pos.x, 0, pos.z);
    const departMesh = this.vfx.createSpatialRiftGroup(this.scratchOrigin);
    this.world.createEntity({
      transform: {
        position: { x: pos.x, y: 0, z: pos.z },
        rotationY: boss.transform.rotationY,
        scale: 1,
      },
      hazardZone: {
        kind: 'SPATIAL_RIFT',
        faction: 'BOSS',
        damage: 0,
        elapsed: 0,
        telegraphDuration: 0,
        activeDuration: cfg.riftVisualDurationSec,
        currentRadius: 1.0,
        maxRadius: 1.0,
        hitThickness: 0,
        angle: 0,
        startAngle: 0,
        endAngle: 0,
        beamLength: 0,
        hitCooldown: 0,
        hasHitPlayer: true,
        hasTriggered: true,
      },
      meshRef: { object3D: departMesh },
    });

    // 2. Relocate across the arena away from the Dark Mage
    const awayAngle =
      Math.atan2(
        pos.x - this.scratchPlayerPos.x,
        pos.z - this.scratchPlayerPos.z,
      ) + (bp.orbitDir * 0.85);
    const destX = Math.sin(awayAngle) * cfg.riftTeleportRadius;
    const destZ = Math.cos(awayAngle) * cfg.riftTeleportRadius;
    pos.x = destX;
    pos.z = destZ;
    bp.orbitAngle = awayAngle;
    boss.transform.rotationY = Math.atan2(
      this.scratchPlayerPos.x - destX,
      this.scratchPlayerPos.z - destZ,
    );

    // 3. Spawn royal-violet vertical Spatial Rift at arrival point
    this.scratchOrigin.set(destX, 0, destZ);
    const arriveMesh = this.vfx.createSpatialRiftGroup(this.scratchOrigin);
    this.world.createEntity({
      transform: {
        position: { x: destX, y: 0, z: destZ },
        rotationY: boss.transform.rotationY,
        scale: 1,
      },
      hazardZone: {
        kind: 'SPATIAL_RIFT',
        faction: 'BOSS',
        damage: 0,
        elapsed: 0,
        telegraphDuration: 0,
        activeDuration: cfg.riftVisualDurationSec,
        currentRadius: 1.0,
        maxRadius: 1.0,
        hitThickness: 0,
        angle: 0,
        startAngle: 0,
        endAngle: 0,
        beamLength: 0,
        hitCooldown: 0,
        hasHitPlayer: true,
        hasTriggered: true,
      },
      meshRef: { object3D: arriveMesh },
    });

    rig.triggerCastFlourish();
    rig.triggerRiftArrivePulse();
    this.audio.playSpatialRiftWarp();
    bp.riftCooldown = bp.isSoloEnraged
      ? cfg.riftSoloCooldownSec
      : cfg.riftCooldownSec;
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
        if (
          'triggerSignFlash' in ctx.bossRig &&
          typeof ctx.bossRig.triggerSignFlash === 'function'
        ) {
          ctx.bossRig.triggerSignFlash('IGNI');
        }
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
        if (
          'triggerSignFlash' in ctx.bossRig &&
          typeof ctx.bossRig.triggerSignFlash === 'function'
        ) {
          ctx.bossRig.triggerSignFlash('IGNI');
        }
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
        if (
          'triggerSignFlash' in ctx.bossRig &&
          typeof ctx.bossRig.triggerSignFlash === 'function'
        ) {
          ctx.bossRig.triggerSignFlash('IGNI');
        }
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

  /**
   * Steps floating destructible Harmonic Amp Nodes summoned by Miku in Phase II+:
   * each active node fires cross-stage frequency bolts toward the Dark Mage until shattered.
   */
  private updateHarmonicAmpNodes(
    dt: number,
    playerPos: { x: number; y: number; z: number },
  ): void {
    const nodes = this.world.query('harmonicAmpNode', 'transform');
    const expiredIds: EntityId[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const amp = node.harmonicAmpNode;
      amp.life -= dt;
      amp.fireTimer -= dt;

      if (amp.life <= 0) {
        this.vfx.spawnFrostShatterBurst(
          new THREE.Vector3(
            node.transform.position.x,
            node.transform.position.y,
            node.transform.position.z,
          ),
          10,
          5.5,
        );
        expiredIds.push(node.id);
        continue;
      }

      if (amp.fireTimer <= 0) {
        amp.fireTimer = amp.fireInterval;
        const nx = node.transform.position.x;
        const ny = node.transform.position.y;
        const nz = node.transform.position.z;
        const dx = playerPos.x - nx;
        const dz = playerPos.z - nz;
        const dist = Math.hypot(dx, dz) || 1;
        const dirX = dx / dist;
        const dirZ = dz / dist;
        const yaw = Math.atan2(dirX, dirZ);

        // Fire a tight 3-bolt cross-stage chord burst toward the Dark Mage
        const spreadOffsets = [-0.14, 0, 0.14];
        for (let k = 0; k < spreadOffsets.length; k++) {
          const ang = yaw + (spreadOffsets[k] ?? 0);
          const vx = Math.sin(ang) * MIKU_CONFIG.ampNodeBeamSpeed;
          const vz = Math.cos(ang) * MIKU_CONFIG.ampNodeBeamSpeed;
          const sx = nx + Math.sin(ang) * 0.65;
          const sz = nz + Math.cos(ang) * 0.65;
          const orbGroup = this.vfx.createSpiralOrbGroup(
            new THREE.Vector3(sx, 1.15, sz),
            false,
            true,
          );
          this.world.createEntity({
            transform: {
              position: { x: sx, y: 1.15, z: sz },
              rotationY: ang,
              scale: 1,
            },
            velocity: {
              vx,
              vy: 0,
              vz,
              maxSpeed: MIKU_CONFIG.ampNodeBeamSpeed,
            },
            projectile: {
              faction: 'BOSS',
              kind: 'SPIRAL_ORB',
              damage: MIKU_CONFIG.ampNodeBeamDamage,
              radius: MIKU_CONFIG.ampNodeBeamRadius,
              life: MIKU_CONFIG.ampNodeBeamLife,
              maxLife: MIKU_CONFIG.ampNodeBeamLife,
              trailTimer: 0,
              spinSpeed: 8,
              pierceRemaining: 0,
              hitEntityIds: [],
              state: 'FLY',
              fireDelay: 0,
              fanAngle: 0,
              baseHeight: ny,
              ownerEntityId: node.id,
            },
            meshRef: { object3D: orbGroup },
          });
        }
        this.audio.playChordBurst();
      }
    }

    for (let i = 0; i < expiredIds.length; i++) {
      const id = expiredIds[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }
  }

  /**
   * Registers Miku, the Harmonic Sovereign's unique 3-phase cyber-concert strategies (OCP):
   * - Phase I: MIKU_LASER_DASH (persistent magenta laser fence) + MIKU_BEAT_DROP_RINGS (expanding equalizer rings)
   * - Phase II: MIKU_AMP_NODES (destructible floating perimeter amp nodes) + MIKU_LASER_LATTICE (multi-dash fences)
   * - Phase III: MIKU_CRESCENDO_OVERDRIVE (twin rotating emerald/magenta concert spotlights + beat-drop rings)
   */
  private registerMikuPatterns(): void {
    const spawnMikuBeatRing = (
      ctx: BossPatternContext,
      ox: number,
      oz: number,
    ): void => {
      const origin = new THREE.Vector3(ox, 0.12, oz);
      const ringGroup = ctx.vfx.createFrostRingNovaGroup(origin);
      const handles = ringGroup.userData.frostRingHandles as
        | FrostRingMeshHandles
        | undefined;
      if (handles) {
        handles.ringMat.color.setHex(PALETTE.harmonicEmerald);
        handles.wallMat.color.setHex(PALETTE.harmonicMagenta);
      }

      ctx.world.createEntity({
        transform: {
          position: { x: ox, y: 0.12, z: oz },
          rotationY: 0,
          scale: 1,
        },
        hazardZone: {
          kind: 'FROST_RING_NOVA',
          faction: 'BOSS',
          damage: MIKU_CONFIG.beatRingDamage,
          elapsed: 0,
          telegraphDuration: 0,
          activeDuration: MIKU_CONFIG.beatRingDuration,
          currentRadius: 0.85,
          maxRadius: MIKU_CONFIG.beatRingMaxRadius,
          hitThickness: MIKU_CONFIG.beatRingHitThickness,
          angle: 0,
          startAngle: 0,
          endAngle: 0,
          beamLength: 0,
          hitCooldown: 0,
          hasHitPlayer: false,
          hasTriggered: true,
        },
        meshRef: { object3D: ringGroup },
      });
      ctx.audio.playBassDrop();
    };

    const launchMikuLaserDash = (
      ctx: BossPatternContext,
      dashSpeed: number,
      dashDuration: number,
      angleBiasRad: number,
    ): void => {
      const bp = ctx.bossEntity.bossPhase;
      const bPos = ctx.bossEntity.transform.position;
      const toPlayerYaw = Math.atan2(
        ctx.playerPos.x - bPos.x,
        ctx.playerPos.z - bPos.z,
      );
      const dashYaw = toPlayerYaw + angleBiasRad * bp.orbitDir;
      const dirX = Math.sin(dashYaw);
      const dirZ = Math.cos(dashYaw);

      const intendedDist = dashSpeed * dashDuration;
      let endX = bPos.x + dirX * intendedDist;
      let endZ = bPos.z + dirZ * intendedDist;
      const endRadial = Math.hypot(endX, endZ);
      if (endRadial > BOSS_CONFIG.innerTerraceLimit && endRadial > 0.001) {
        endX = (endX / endRadial) * BOSS_CONFIG.innerTerraceLimit;
        endZ = (endZ / endRadial) * BOSS_CONFIG.innerTerraceLimit;
      }

      const segDx = endX - bPos.x;
      const segDz = endZ - bPos.z;
      const segLen = Math.max(2.2, Math.hypot(segDx, segDz));
      const segAngle = Math.atan2(segDx, segDz);

      bp.dashVelX = (segDx / Math.max(0.05, dashDuration));
      bp.dashVelZ = (segDz / Math.max(0.05, dashDuration));
      bp.dashTimer = dashDuration;

      const wallGroup = ctx.vfx.createLaserWallGroup(
        new THREE.Vector3(bPos.x, 0.04, bPos.z),
        segAngle,
        segLen,
        MIKU_CONFIG.laserWallHeight,
      );
      ctx.world.createEntity({
        transform: {
          position: { x: bPos.x, y: 0.04, z: bPos.z },
          rotationY: segAngle,
          scale: 1,
        },
        hazardZone: {
          kind: 'LASER_WALL',
          faction: 'BOSS',
          damage: MIKU_CONFIG.laserWallDamage,
          elapsed: 0,
          telegraphDuration: 0.16,
          activeDuration: MIKU_CONFIG.laserWallDuration,
          currentRadius: 0,
          maxRadius: 0,
          hitThickness: MIKU_CONFIG.laserWallHalfWidth,
          angle: segAngle,
          startAngle: segAngle,
          endAngle: segAngle,
          beamLength: segLen,
          hitCooldown: 0,
          hasHitPlayer: false,
          hasTriggered: true,
        },
        meshRef: { object3D: wallGroup },
      });

      ctx.audio.playLaserSlash();
      ctx.bossRig.triggerCastFlourish();
      bp.orbitDir = bp.orbitDir === 1 ? -1 : 1;
    };

    // Phase I Pattern 1: Laser-Trail Dash (zips across stage leaving persistent magenta hard-light fence)
    this.registerPattern({
      id: 'MIKU_LASER_DASH',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        launchMikuLaserDash(
          ctx,
          MIKU_CONFIG.dashSpeed,
          MIKU_CONFIG.dashDuration,
          0.42,
        );
        bp.activePatternFireTimer = MIKU_CONFIG.dashDuration + 0.12;
        bp.activePatternDuration = MIKU_CONFIG.dashDuration + 0.65;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= bp.activePatternFireTimer
        ) {
          bp.activePatternLaunched = true;
          const bPos = ctx.bossEntity.transform.position;
          spawnMikuBeatRing(ctx, bPos.x, bPos.z);
        }
      },
    });

    // Phase I Pattern 2: Beat-Drop Equalizer Rings (staggered ground-level concentric rings)
    this.registerPattern({
      id: 'MIKU_BEAT_DROP_RINGS',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        const bPos = ctx.bossEntity.transform.position;
        spawnMikuBeatRing(ctx, bPos.x, bPos.z);
        bp.activePatternFireTimer = MIKU_CONFIG.reverberationArc.beatRingInterval;
        bp.activePatternDuration =
          MIKU_CONFIG.reverberationArc.beatRingInterval * 2 + 0.45;
      },
      tick(ctx, dt) {
        const bp = ctx.bossEntity.bossPhase;
        bp.activePatternFireTimer -= dt;
        if (
          bp.activePatternFireTimer <= 0 &&
          bp.activePatternElapsed < bp.activePatternDuration - 0.35
        ) {
          bp.activePatternFireTimer =
            MIKU_CONFIG.reverberationArc.beatRingInterval;
          const bPos = ctx.bossEntity.transform.position;
          spawnMikuBeatRing(ctx, bPos.x, bPos.z);
        }
      },
    });

    // Phase II Signature: Harmonic Amp Nodes (summons destructible perimeter amp nodes firing cross-stage beams)
    this.registerPattern({
      id: 'MIKU_AMP_NODES',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playChordBurst();

        const existingNodes = ctx.world.query('harmonicAmpNode');
        const missingCount = Math.max(
          0,
          MIKU_CONFIG.ampNodeCount - existingNodes.length,
        );
        const baseAngle = Math.random() * Math.PI * 2;
        for (let i = 0; i < missingCount; i++) {
          const ang = baseAngle + (i / MIKU_CONFIG.ampNodeCount) * Math.PI * 2;
          const nx = Math.cos(ang) * MIKU_CONFIG.ampNodeRingRadius;
          const nz = Math.sin(ang) * MIKU_CONFIG.ampNodeRingRadius;
          const ny = MIKU_CONFIG.ampNodeHeight;
          const nodeGroup = ctx.vfx.createHarmonicAmpNodeGroup(
            new THREE.Vector3(nx, ny, nz),
          );
          ctx.world.createEntity({
            transform: {
              position: { x: nx, y: ny, z: nz },
              rotationY: 0,
              scale: 1,
            },
            hurtbox: {
              radius: MIKU_CONFIG.ampNodeHitRadius,
              minY: ny - 0.95,
              maxY: ny + 0.95,
              faction: 'BOSS',
            },
            harmonicAmpNode: {
              hp: MIKU_CONFIG.ampNodeHp,
              maxHp: MIKU_CONFIG.ampNodeHp,
              fireTimer: 0.75 + i * 0.38,
              fireInterval: MIKU_CONFIG.ampNodeFireInterval,
              life: MIKU_CONFIG.ampNodeDuration,
              maxLife: MIKU_CONFIG.ampNodeDuration,
              orbitIndex: i,
            },
            meshRef: { object3D: nodeGroup },
          });
        }

        // Pair node summon with a beat-drop ring pulse
        const bPos = ctx.bossEntity.transform.position;
        spawnMikuBeatRing(ctx, bPos.x, bPos.z);
        bp.activePatternDuration = 1.25;
      },
    });

    // Phase II Pattern 2: Multi-Dash Laser Lattice (2 consecutive crossing laser fences)
    this.registerPattern({
      id: 'MIKU_LASER_LATTICE',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        launchMikuLaserDash(
          ctx,
          MIKU_CONFIG.twinTailDash.dashSpeed,
          MIKU_CONFIG.twinTailDash.dashDuration,
          0.35,
        );
        bp.activePatternFireTimer = MIKU_CONFIG.twinTailDash.latticeDashInterval;
        bp.activePatternDuration =
          MIKU_CONFIG.twinTailDash.latticeDashInterval +
          MIKU_CONFIG.twinTailDash.dashDuration +
          0.45;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= bp.activePatternFireTimer
        ) {
          bp.activePatternLaunched = true;
          launchMikuLaserDash(
            ctx,
            MIKU_CONFIG.twinTailDash.dashSpeed,
            MIKU_CONFIG.twinTailDash.dashDuration,
            0.35,
          );
        }
      },
    });

    // Phase III Signature: Crescendo Overdrive (twin rotating emerald/magenta concert spotlight lasers + beat rings)
    this.registerPattern({
      id: 'MIKU_CRESCENDO_OVERDRIVE',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.bossRig.setAscendHeight(MIKU_CONFIG.crescendoOverdrive.ascendHeight);
        bp.ascendHeight = MIKU_CONFIG.crescendoOverdrive.ascendHeight;
        ctx.audio.playChordBurst();

        const bPos = ctx.bossEntity.transform.position;
        const baseAngle = Math.atan2(
          ctx.playerPos.x - bPos.x,
          ctx.playerPos.z - bPos.z,
        );
        const sweepRad =
          MIKU_CONFIG.spotlightRotateSpeed * MIKU_CONFIG.spotlightDurationSec;
        const dir = bp.orbitDir;

        ([-1, 1] as const).forEach((side) => {
          const startAngle = baseAngle + (side < 0 ? 0.55 : Math.PI + 0.55);
          const endAngle = startAngle + sweepRad * dir;
          const beamOrigin = new THREE.Vector3(
            bPos.x,
            BOSS_CONFIG.phase2.laserHeight + bp.ascendHeight,
            bPos.z,
          );
          const laserGroup = ctx.vfx.createLaserBeamGroup(
            beamOrigin,
            side,
            startAngle,
            MIKU_CONFIG.spotlightLength,
            true,
          );
          ctx.world.createEntity({
            transform: {
              position: {
                x: beamOrigin.x,
                y: beamOrigin.y,
                z: beamOrigin.z,
              },
              rotationY: startAngle,
              scale: 1,
            },
            hazardZone: {
              kind: 'GLACIAL_LASER',
              faction: 'BOSS',
              damage: MIKU_CONFIG.spotlightDamage,
              elapsed: 0,
              telegraphDuration: MIKU_CONFIG.spotlightTelegraphSec,
              activeDuration: MIKU_CONFIG.spotlightDurationSec,
              currentRadius: 0,
              maxRadius: 0,
              hitThickness: MIKU_CONFIG.spotlightHitWidth,
              angle: startAngle,
              startAngle,
              endAngle,
              beamLength: MIKU_CONFIG.spotlightLength,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: false,
            },
            meshRef: { object3D: laserGroup },
          });
        });

        bp.activePatternFireTimer = MIKU_CONFIG.spotlightTelegraphSec + 0.25;
        bp.activePatternDuration =
          MIKU_CONFIG.spotlightTelegraphSec +
          MIKU_CONFIG.spotlightDurationSec +
          0.2;
      },
      tick(ctx, dt) {
        const bp = ctx.bossEntity.bossPhase;
        bp.activePatternFireTimer -= dt;
        if (
          bp.activePatternFireTimer <= 0 &&
          bp.activePatternElapsed < bp.activePatternDuration - 0.5
        ) {
          bp.activePatternFireTimer =
            MIKU_CONFIG.crescendoOverdrive.bassDropInterval;
          const bPos = ctx.bossEntity.transform.position;
          spawnMikuBeatRing(ctx, bPos.x, bPos.z);
        }
      },
      finish(ctx) {
        ctx.bossRig.setAscendHeight(0);
        ctx.bossEntity.bossPhase.ascendHeight = 0;
        ctx.bossEntity.bossPhase.orbitDir =
          ctx.bossEntity.bossPhase.orbitDir === 1 ? -1 : 1;
      },
    });

    this.registerProfile({
      bossId: MIKU_CONFIG.id,
      phase2Threshold: MIKU_CONFIG.phase2HpThreshold,
      phase3Threshold: MIKU_CONFIG.phase3HpThreshold,
      staggerThreshold: MIKU_CONFIG.staggerHpThreshold,
      phase2Opener: 'MIKU_AMP_NODES',
      phase3Opener: 'MIKU_CRESCENDO_OVERDRIVE',
      closeRangePattern: 'MIKU_BEAT_DROP_RINGS',
      phase1Cycle: [
        'MIKU_LASER_DASH',
        'MIKU_BEAT_DROP_RINGS',
        'MIKU_LASER_DASH',
      ],
      phase2Cycle: [
        'MIKU_LASER_LATTICE',
        'MIKU_AMP_NODES',
        'MIKU_BEAT_DROP_RINGS',
      ],
      phase3Cycle: [
        'MIKU_CRESCENDO_OVERDRIVE',
        'MIKU_LASER_LATTICE',
        'MIKU_AMP_NODES',
        'MIKU_BEAT_DROP_RINGS',
      ],
      getCooldown(phase: BossPhase): number {
        if (phase === BOSS_PHASES.PHASE_3) {
          return MIKU_CONFIG.crescendoOverdrive.attackCooldown;
        }
        if (phase === BOSS_PHASES.PHASE_2) {
          return MIKU_CONFIG.twinTailDash.attackCooldown;
        }
        return MIKU_CONFIG.reverberationArc.attackCooldown;
      },
    });
  }

  /**
   * Registers full asymmetric duo combat strategies & profiles for *The Wolf & The Raven*
   * (Geralt of Rivia & Yennefer of Vengerberg) via Open/Closed (OCP) strategy hooks.
   */
  private registerSpecialScenarioPatterns(): void {
    const sc = SPECIAL_SCENARIO_CONFIG;
    const wr = WOLF_AND_RAVEN_CONFIG;
    const scratchOrigin = this.scratchOrigin;

    // =========================================================================
    // GERALT OF RIVIA — VANGUARD PRESSURE & WITCHER SIGNS (Quen / Igni / Yrden)
    // =========================================================================

    // 1. 2-Hit Silver Sword Dash-Slash with Glowing Amber Blade-Trail Telegraph
    this.registerPattern({
      id: 'GERALT_VANGUARD_COMBO',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const geralt = ctx.bossRig as GeraltRig;
        bp.patternSubStage = 0;
        geralt.setAmberBladeTrail(0.92);
        geralt.triggerCastFlourish();
        bp.activePatternDuration =
          wr.swordTelegraph1Sec +
          wr.swordDash1DurationSec +
          wr.swordChainWindupSec +
          wr.swordDash2DurationSec +
          wr.swordRecoverySec;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const bPos = ctx.bossEntity.transform.position;
        const geralt = ctx.bossRig as GeraltRig;
        const t = bp.activePatternElapsed;

        const tSlash1 = wr.swordTelegraph1Sec;
        const tChainWindup = tSlash1 + wr.swordDash1DurationSec;
        const tSlash2 = tChainWindup + wr.swordChainWindupSec;
        const tRecovery = tSlash2 + wr.swordDash2DurationSec;

        if (bp.patternSubStage === 0 && t >= tSlash1) {
          bp.patternSubStage = 1;
          const dx = ctx.playerPos.x - bPos.x;
          const dz = ctx.playerPos.z - bPos.z;
          const dist = Math.hypot(dx, dz) || 1;
          const ang = Math.atan2(dx, dz);
          ctx.bossEntity.transform.rotationY = ang;
          bp.dashVelX = (dx / dist) * wr.swordDashSpeed;
          bp.dashVelZ = (dz / dist) * wr.swordDashSpeed;
          bp.dashTimer = wr.swordDash1DurationSec;
          geralt.triggerSwordSlash(1);
          geralt.setAmberBladeTrail(1.0);
          ctx.audio.playLaserSlash();

          // Launch tight amber-silver crescent slash wave
          scratchOrigin.set(bPos.x, 1.05, bPos.z);
          const waveMesh = ctx.vfx.createCrescentBladeGroup(
            scratchOrigin,
            ang,
            false,
            { blade: PALETTE.riftAmber, edge: PALETTE.steelSilver },
          );
          ctx.world.createEntity({
            transform: {
              position: { x: bPos.x, y: 1.05, z: bPos.z },
              rotationY: ang,
              scale: 0.85,
            },
            velocity: {
              vx: Math.sin(ang) * wr.swordWaveSpeed,
              vy: 0,
              vz: Math.cos(ang) * wr.swordWaveSpeed,
              maxSpeed: wr.swordWaveSpeed,
            },
            projectile: {
              faction: 'BOSS',
              kind: 'GLACIAL_CRESCENT',
              damage: wr.swordWaveDamage,
              radius: wr.swordWaveRadius,
              life: wr.swordWaveLife,
              maxLife: wr.swordWaveLife,
              trailTimer: 0,
              spinSpeed: 0,
              pierceRemaining: 0,
              hitEntityIds: [],
              state: 'FLY',
              fireDelay: 0,
              fanAngle: 0,
              baseHeight: 1.05,
              ownerEntityId: ctx.bossEntity.id,
            },
            meshRef: { object3D: waveMesh },
          });
        } else if (bp.patternSubStage === 1 && t >= tSlash1 + wr.swordDash1DurationSec * 0.55) {
          bp.patternSubStage = 2;
          const dist = Math.hypot(
            ctx.playerPos.x - bPos.x,
            ctx.playerPos.z - bPos.z,
          );
          if (dist <= wr.swordSlashHitRadius) {
            ctx.damagePlayerMelee(wr.swordSlashDamage);
          }
        } else if (bp.patternSubStage === 2 && t >= tChainWindup) {
          bp.patternSubStage = 3;
          geralt.setAmberBladeTrail(0.95);
        } else if (bp.patternSubStage === 3 && t >= tSlash2) {
          bp.patternSubStage = 4;
          const dx = ctx.playerPos.x - bPos.x;
          const dz = ctx.playerPos.z - bPos.z;
          const dist = Math.hypot(dx, dz) || 1;
          const ang = Math.atan2(dx, dz);
          ctx.bossEntity.transform.rotationY = ang;
          bp.dashVelX = (dx / dist) * (wr.swordDashSpeed * 1.12);
          bp.dashVelZ = (dz / dist) * (wr.swordDashSpeed * 1.12);
          bp.dashTimer = wr.swordDash2DurationSec;
          geralt.triggerSwordSlash(2);
          geralt.setAmberBladeTrail(1.0);
          ctx.audio.playLaserSlash();

          // Second cross-slash wave with slight twin spread
          for (const spread of [-0.18, 0.18] as const) {
            const sAng = ang + spread;
            scratchOrigin.set(bPos.x, 1.05, bPos.z);
            const waveMesh = ctx.vfx.createCrescentBladeGroup(
              scratchOrigin,
              sAng,
              false,
              { blade: PALETTE.riftAmber, edge: PALETTE.steelSilver },
            );
            ctx.world.createEntity({
              transform: {
                position: { x: bPos.x, y: 1.05, z: bPos.z },
                rotationY: sAng,
                scale: 0.85,
              },
              velocity: {
                vx: Math.sin(sAng) * wr.swordWaveSpeed,
                vy: 0,
                vz: Math.cos(sAng) * wr.swordWaveSpeed,
                maxSpeed: wr.swordWaveSpeed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'GLACIAL_CRESCENT',
                damage: wr.swordWaveDamage,
                radius: wr.swordWaveRadius,
                life: wr.swordWaveLife,
                maxLife: wr.swordWaveLife,
                trailTimer: 0,
                spinSpeed: 0,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: spread,
                baseHeight: 1.05,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: waveMesh },
            });
          }
        } else if (bp.patternSubStage === 4 && t >= tSlash2 + wr.swordDash2DurationSec * 0.55) {
          bp.patternSubStage = 5;
          const dist = Math.hypot(
            ctx.playerPos.x - bPos.x,
            ctx.playerPos.z - bPos.z,
          );
          if (dist <= wr.swordSlashHitRadius) {
            ctx.damagePlayerMelee(wr.swordSlashDamage);
          }
        } else if (t >= tRecovery) {
          geralt.setAmberBladeTrail(0);
        }
      },
      finish(ctx) {
        (ctx.bossRig as GeraltRig).setAmberBladeTrail(0);
      },
    });

    // 2. Quen Active Hexagonal Barrier (3 frontal hits OR shattered by RMB Umbral Pulse / bypassed from rear)
    this.registerPattern({
      id: 'GERALT_QUEN_SHIELD',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const geralt = ctx.bossRig as GeraltRig;
        bp.quenHitsRemaining = wr.quenMaxHits;
        bp.quenTimer = wr.quenDurationSec;
        bp.quenCooldown = wr.quenCooldownSec;
        geralt.triggerCastFlourish();
        geralt.triggerSignFlash('QUEN');
        geralt.setQuenVisual(true, wr.quenMaxHits);
        ctx.audio.playSummonGlyphChime();
        bp.activePatternDuration = wr.quenCastDurationSec;
      },
    });

    // 3. Igni Fire Arc (0.65s orange left-palm Sign telegraph -> wide close-range cone of fire sparks)
    this.registerPattern({
      id: 'GERALT_IGNI_ARC',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const geralt = ctx.bossRig as GeraltRig;
        bp.activePatternLaunched = false;
        geralt.triggerCastFlourish();
        geralt.setIgniChannel(1.0);
        ctx.audio.playSummonGlyphChime();
        bp.activePatternDuration = wr.igniTelegraphSec + wr.igniRecoverySec;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const geralt = ctx.bossRig as GeraltRig;
        if (!bp.activePatternLaunched && bp.activePatternElapsed >= wr.igniTelegraphSec) {
          bp.activePatternLaunched = true;
          geralt.setIgniChannel(0);
          geralt.triggerSignFlash('IGNI');
          ctx.audio.playIgniBurst();

          const bPos = ctx.bossEntity.transform.position;
          const baseAngle = Math.atan2(
            ctx.playerPos.x - bPos.x,
            ctx.playerPos.z - bPos.z,
          );
          ctx.bossEntity.transform.rotationY = baseAngle;
          const count = wr.igniSparkCount;
          for (let i = 0; i < count; i++) {
            const offset = ((i / (count - 1)) - 0.5) * wr.igniConeRad;
            const ang = baseAngle + offset;
            const vx = Math.sin(ang) * wr.igniSparkSpeed;
            const vz = Math.cos(ang) * wr.igniSparkSpeed;
            scratchOrigin.set(
              bPos.x + Math.sin(ang) * 0.65,
              1.1,
              bPos.z + Math.cos(ang) * 0.65,
            );
            const orbGroup = ctx.vfx.createSpiralOrbGroup(
              scratchOrigin,
              false,
              false,
              { core: PALETTE.pureWhite, halo: PALETTE.geraltIgniOrange },
            );
            ctx.world.createEntity({
              transform: {
                position: {
                  x: scratchOrigin.x,
                  y: scratchOrigin.y,
                  z: scratchOrigin.z,
                },
                rotationY: ang,
                scale: 0.92,
              },
              velocity: { vx, vy: 0, vz, maxSpeed: wr.igniSparkSpeed },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: wr.igniDamage,
                radius: wr.igniSparkRadius,
                life: wr.igniSparkLife,
                maxLife: wr.igniSparkLife,
                trailTimer: 0,
                spinSpeed: 8,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: offset,
                baseHeight: 1.1,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: orbGroup },
            });
          }
        }
      },
      finish(ctx) {
        (ctx.bossRig as GeraltRig).setIgniChannel(0);
      },
    });

    // 4. Yrden Violet Floor Trap (6.0s duration, 3.2m radius, 0.55x slow + visible violet tether)
    this.registerPattern({
      id: 'GERALT_YRDEN_TRAP',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const geralt = ctx.bossRig as GeraltRig;
        geralt.triggerCastFlourish();
        geralt.triggerSignFlash('YRDEN');
        ctx.audio.playYrdenPulse();

        const tx = ctx.playerPos.x;
        const tz = ctx.playerPos.z;
        scratchOrigin.set(tx, 0.06, tz);
        const trapGroup = ctx.vfx.createYrdenTrapGroup(
          scratchOrigin,
          wr.yrdenRadius,
        );
        ctx.world.createEntity({
          transform: {
            position: { x: tx, y: 0.06, z: tz },
            rotationY: 0,
            scale: 1,
          },
          hazardZone: {
            kind: 'YRDEN_TRAP',
            faction: 'BOSS',
            damage: 0,
            elapsed: 0,
            telegraphDuration: 0,
            activeDuration: wr.yrdenDurationSec,
            currentRadius: wr.yrdenRadius,
            maxRadius: wr.yrdenRadius,
            hitThickness: 0,
            angle: 0,
            startAngle: 0,
            endAngle: 0,
            beamLength: 0,
            hitCooldown: 0,
            hasHitPlayer: false,
            hasTriggered: true,
          },
          meshRef: { object3D: trapGroup },
        });
        bp.activePatternDuration = wr.yrdenCastDurationSec;
      },
    });

    this.registerProfile({
      bossId: sc.geraltId,
      phase2Threshold: 0.5,
      phase3Threshold: -1,
      staggerThreshold: 0,
      phase2Opener: 'GERALT_QUEN_SHIELD',
      phase3Opener: 'GERALT_QUEN_SHIELD',
      closeRangePattern: 'GERALT_IGNI_ARC',
      phase1Cycle: [
        'GERALT_VANGUARD_COMBO',
        'GERALT_IGNI_ARC',
        'GERALT_YRDEN_TRAP',
        'GERALT_VANGUARD_COMBO',
      ],
      phase2Cycle: [
        'GERALT_VANGUARD_COMBO',
        'GERALT_IGNI_ARC',
        'GERALT_YRDEN_TRAP',
        'GERALT_VANGUARD_COMBO',
      ],
      phase3Cycle: [
        'GERALT_VANGUARD_COMBO',
        'GERALT_IGNI_ARC',
        'GERALT_YRDEN_TRAP',
      ],
      getCooldown(phase: BossPhase): number {
        return phase >= BOSS_PHASES.PHASE_2
          ? wr.geraltAttackCooldownP2
          : wr.geraltAttackCooldownP1;
      },
    });

    // =========================================================================
    // YENNEFER OF VENGERBERG — CHAOS MAGIC, RIFT ZONING & STOLEN KISS WINDOW
    // =========================================================================

    // 1. Chaos Lightning (3 duo / 5 solo-enraged forked royal-violet strikes with brief ground telegraphs)
    this.registerPattern({
      id: 'YENNEFER_CHAOS_LIGHTNING',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        ctx.audio.playSummonGlyphChime();
        bp.patternSubStage = 0;
        const count = bp.isSoloEnraged
          ? wr.lightningCountSolo
          : wr.lightningCountDuo;

        for (let i = 0; i < count; i++) {
          const leadX =
            i === 0
              ? ctx.playerPos.x
              : ctx.playerPos.x +
                ctx.playerVel.x * 0.35 +
                Math.cos((i / count) * Math.PI * 2) * wr.lightningSpreadRadius;
          const leadZ =
            i === 0
              ? ctx.playerPos.z
              : ctx.playerPos.z +
                ctx.playerVel.z * 0.35 +
                Math.sin((i / count) * Math.PI * 2) * wr.lightningSpreadRadius;

          const radial = Math.hypot(leadX, leadZ);
          const clampR = BOSS_CONFIG.innerTerraceLimit - 1.0;
          const sx = radial > clampR ? (leadX / radial) * clampR : leadX;
          const sz = radial > clampR ? (leadZ / radial) * clampR : leadZ;

          scratchOrigin.set(sx, 0.06, sz);
          const boltGroup = ctx.vfx.createChaosLightningGroup(
            scratchOrigin,
            wr.lightningRadius,
          );
          ctx.world.createEntity({
            transform: {
              position: { x: sx, y: 0.06, z: sz },
              rotationY: 0,
              scale: 1,
            },
            hazardZone: {
              kind: 'CHAOS_LIGHTNING',
              faction: 'BOSS',
              damage: wr.lightningDamage,
              elapsed: -i * wr.lightningCascadeStepSec,
              telegraphDuration: wr.lightningTelegraphSec,
              activeDuration: wr.lightningActiveSec,
              currentRadius: wr.lightningRadius,
              maxRadius: wr.lightningRadius,
              hitThickness: 0,
              angle: 0,
              startAngle: 0,
              endAngle: 0,
              beamLength: 0,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: false,
            },
            meshRef: { object3D: boltGroup },
          });
        }
        bp.activePatternDuration = wr.lightningAttackDurationSec;
      },
    });

    // 2. Obsidian Feather Volley (sweeping arc of 7 duo / 11 solo dark obsidian-violet shards)
    this.registerPattern({
      id: 'YENNEFER_OBSIDIAN_FEATHERS',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        ctx.bossRig.triggerCastFlourish();
        bp.activePatternLaunched = false;
        bp.activePatternDuration = wr.featherAttackDurationSec;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= wr.featherTelegraphSec
        ) {
          bp.activePatternLaunched = true;
          ctx.audio.playIceLance();
          const bPos = ctx.bossEntity.transform.position;
          const baseAngle = Math.atan2(
            ctx.playerPos.x - bPos.x,
            ctx.playerPos.z - bPos.z,
          );
          const count = bp.isSoloEnraged
            ? wr.featherCountSolo
            : wr.featherCountDuo;
          for (let i = 0; i < count; i++) {
            const offset = ((i / (count - 1)) - 0.5) * wr.featherArcRad;
            const ang = baseAngle + offset;
            scratchOrigin.set(
              bPos.x + Math.sin(ang) * 0.75,
              1.18,
              bPos.z + Math.cos(ang) * 0.75,
            );
            const shardMesh = ctx.vfx.createSpiralOrbGroup(
              scratchOrigin,
              false,
              false,
              { core: PALETTE.yenneferLilac, halo: PALETTE.amethystTrim },
            );
            ctx.world.createEntity({
              transform: {
                position: {
                  x: scratchOrigin.x,
                  y: scratchOrigin.y,
                  z: scratchOrigin.z,
                },
                rotationY: ang,
                scale: 0.9,
              },
              velocity: {
                vx: Math.sin(ang) * wr.featherSpeed,
                vy: 0,
                vz: Math.cos(ang) * wr.featherSpeed,
                maxSpeed: wr.featherSpeed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: wr.featherDamage,
                radius: wr.featherRadius,
                life: wr.featherLife,
                maxLife: wr.featherLife,
                trailTimer: 0,
                spinSpeed: 10,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: offset,
                baseHeight: 1.18,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: shardMesh },
            });
          }
        }
      },
    });

    // 3. Chaos Maelstrom -> Heavy Channeled Storm Burst Opening the 1.8s 360° Stolen Kiss Window!
    this.registerPattern({
      id: 'YENNEFER_CHAOS_MAELSTROM',
      start(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const yen = ctx.bossRig as YenneferRig;
        bp.activePatternLaunched = false;
        yen.triggerCastFlourish();
        yen.setMaelstromCharge(0.35);
        ctx.audio.playSummonGlyphChime();
        const bPos = ctx.bossEntity.transform.position;
        scratchOrigin.set(bPos.x, 0.08, bPos.z);
        ctx.vfx.spawnTelegraphRing(scratchOrigin);
        bp.activePatternDuration = wr.maelstromChannelSec + wr.maelstromRecoverySec;
      },
      tick(ctx) {
        const bp = ctx.bossEntity.bossPhase;
        const yen = ctx.bossRig as YenneferRig;
        const p = THREE.MathUtils.clamp(
          bp.activePatternElapsed / wr.maelstromChannelSec,
          0,
          1,
        );
        if (!bp.activePatternLaunched) {
          yen.setMaelstromCharge(0.35 + p * 0.65);
        }

        if (
          !bp.activePatternLaunched &&
          bp.activePatternElapsed >= wr.maelstromChannelSec
        ) {
          bp.activePatternLaunched = true;
          yen.setMaelstromCharge(0);
          ctx.audio.playChordBurst();
          ctx.addCameraShake(wr.maelstromCameraShake);

          const bPos = ctx.bossEntity.transform.position;
          scratchOrigin.set(bPos.x, 0.22, bPos.z);
          const novaGroup = ctx.vfx.createFrostRingNovaGroup(scratchOrigin);
          const handles = novaGroup.userData.frostRingHandles as
            | FrostRingMeshHandles
            | undefined;
          if (handles) {
            handles.ringMat.color.setHex(PALETTE.amethystTrim);
            handles.wallMat.color.setHex(PALETTE.yenneferLilac);
          }
          ctx.world.createEntity({
            transform: {
              position: { x: bPos.x, y: 0.22, z: bPos.z },
              rotationY: 0,
              scale: 1,
            },
            hazardZone: {
              kind: 'FROST_RING_NOVA',
              faction: 'BOSS',
              damage: wr.maelstromDamage,
              elapsed: 0,
              telegraphDuration: 0,
              activeDuration: wr.maelstromRingDurationSec,
              currentRadius: 1.0,
              maxRadius: wr.maelstromRadius,
              hitThickness: wr.maelstromRingHitThickness,
              angle: 0,
              startAngle: 0,
              endAngle: 0,
              beamLength: 0,
              hitCooldown: 0,
              hasHitPlayer: false,
              hasTriggered: true,
            },
            meshRef: { object3D: novaGroup },
          });

          // Radial swirling obsidian-violet maelstrom shards
          const orbCount = bp.isSoloEnraged
            ? wr.maelstromOrbCountSolo
            : wr.maelstromOrbCountDuo;
          for (let i = 0; i < orbCount; i++) {
            const ang = (i / orbCount) * Math.PI * 2;
            scratchOrigin.set(
              bPos.x + Math.sin(ang) * 0.9,
              1.1,
              bPos.z + Math.cos(ang) * 0.9,
            );
            const orbMesh = ctx.vfx.createSpiralOrbGroup(
              scratchOrigin,
              false,
              false,
              { core: PALETTE.yenneferVioletEye, halo: PALETTE.amethystTrim },
            );
            ctx.world.createEntity({
              transform: {
                position: {
                  x: scratchOrigin.x,
                  y: scratchOrigin.y,
                  z: scratchOrigin.z,
                },
                rotationY: ang,
                scale: 1,
              },
              velocity: {
                vx: Math.sin(ang) * wr.maelstromOrbSpeed,
                vy: 0,
                vz: Math.cos(ang) * wr.maelstromOrbSpeed,
                maxSpeed: wr.maelstromOrbSpeed,
              },
              projectile: {
                faction: 'BOSS',
                kind: 'SPIRAL_ORB',
                damage: wr.maelstromOrbDamage,
                radius: 0.68,
                life: 2.6,
                maxLife: 2.6,
                trailTimer: 0,
                spinSpeed: 8,
                pierceRemaining: 0,
                hitEntityIds: [],
                state: 'FLY',
                fireDelay: 0,
                fanAngle: ang,
                baseHeight: 1.1,
                ownerEntityId: ctx.bossEntity.id,
              },
              meshRef: { object3D: orbMesh },
            });
          }
        }
      },
      finish(ctx) {
        (ctx.bossRig as YenneferRig).setMaelstromCharge(0);
      },
    });

    this.registerProfile({
      bossId: sc.yenneferId,
      phase2Threshold: 0.6,
      phase3Threshold: 0.28,
      staggerThreshold: 0,
      phase2Opener: 'YENNEFER_CHAOS_MAELSTROM',
      phase3Opener: 'YENNEFER_CHAOS_MAELSTROM',
      closeRangePattern: null,
      phase1Cycle: [
        'YENNEFER_CHAOS_LIGHTNING',
        'YENNEFER_OBSIDIAN_FEATHERS',
        'YENNEFER_CHAOS_MAELSTROM',
      ],
      phase2Cycle: [
        'YENNEFER_CHAOS_LIGHTNING',
        'YENNEFER_OBSIDIAN_FEATHERS',
        'YENNEFER_CHAOS_MAELSTROM',
      ],
      phase3Cycle: [
        'YENNEFER_CHAOS_LIGHTNING',
        'YENNEFER_CHAOS_MAELSTROM',
        'YENNEFER_OBSIDIAN_FEATHERS',
      ],
      getCooldown(phase: BossPhase): number {
        if (phase === BOSS_PHASES.PHASE_3) return wr.yenneferAttackCooldownP3;
        if (phase === BOSS_PHASES.PHASE_2) return wr.yenneferAttackCooldownP2;
        return wr.yenneferAttackCooldownP1;
      },
    });
  }
}
