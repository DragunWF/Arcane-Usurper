import * as THREE from 'three';
import {
  ARENA_BOUNDS_KINDS,
  ARENA_CONFIG,
  BOSS_CONFIG,
  CHAMBER_CONFIG,
  DESTRUCTIBLE_PROP_TYPES,
  GAME_STATES,
  HARMONIC_SERVANT_CONFIG,
  LOBBY_CONFIG,
  MIKU_CONFIG,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  SERVANT_AI_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  SERENA_CONFIG,
  SPECIAL_SCENARIO_CONFIG,
  STOLEN_KISS_CONFIG,
  SUNKEN_SERVANT_CONFIG,
  WOLF_AND_RAVEN_CONFIG,
  type GameState,
  type ServantArchetype,
} from '../../config/gameConfig';
import {
  isPointInsideCompositeLobby,
  type IArenaGeometry,
} from '../../engine/SceneManager';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import type { GeraltRig } from '../../rigs/bosses/GeraltRig';
import type { EntityId } from '../components';
import type { ECSWorld, ISystem } from '../World';

export interface ICombatCallbacks {
  getGameState: () => GameState;
  getReticleTargetPoint: (
    outVec: THREE.Vector3,
    bossPosition: THREE.Vector3 | null,
  ) => THREE.Vector3;
  getCameraWorldDirection: (outVec: THREE.Vector3) => THREE.Vector3;
  addCameraShake: (amount: number) => void;
  onReticlePulse: () => void;
  onPlayerDamaged: () => void;
  onPlayerDefeated: () => void;
  onBossDamaged: (bossEntityId?: EntityId) => void;
  onServantHitFlash?: (entityId: EntityId) => void;
  onServantGuardBreak?: (entityId: EntityId) => void;
  onServantDefeated?: (entityId: EntityId) => void;
  onUrnShattered?: (origin: THREE.Vector3, healValue: number) => void;
  onLobbyDummyHit?: (
    damage: number,
    isEncore: boolean,
    hitPoint: THREE.Vector3,
  ) => void;
  onLobbySealedPortalHit?: (
    realmIndex: 2 | 3,
    hitPoint: THREE.Vector3,
  ) => void;
  getCameraForwardXZ?: (outVec: THREE.Vector3) => THREE.Vector3;
  onBossExposureChange?: (exposed: boolean) => void;
  onStolenKissAvailabilityChange?: (available: boolean) => void;
  onTriggerStolenKiss?: (bossEntityId?: EntityId) => void;
}

/**
 * Resolves Player weapon casts (Abyssal Void Bolts & Umbral Pulse), bidirectional
 * projectile/laser/nova/ice-pillar hitboxes, damage calculations, and defeat checks (SRP).
 */
export class CombatSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly arena: IArenaGeometry;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly mageRig: DarkMageRig;
  private bossRig: BossRigAdapter;
  private readonly bossRigs = new Map<EntityId, BossRigAdapter>();
  private readonly callbacks: ICombatCallbacks;

  // Reusable scratch vectors (zero per-frame GC churn)
  private readonly vAimTarget = new THREE.Vector3();
  private readonly vCrystalPos = new THREE.Vector3();
  private readonly vBoltDir = new THREE.Vector3();
  private readonly vBossPos = new THREE.Vector3();
  private readonly vBurstPos = new THREE.Vector3();
  private lastBossExposed = false;
  private lastStolenKissEligible = false;
  private eligibleStolenKissBossId: EntityId | null = null;

  constructor(
    world: ECSWorld,
    arena: IArenaGeometry,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    mageRig: DarkMageRig,
    bossRig: BossRigAdapter,
    callbacks: ICombatCallbacks,
  ) {
    this.world = world;
    this.arena = arena;
    this.audio = audio;
    this.vfx = vfx;
    this.mageRig = mageRig;
    this.bossRig = bossRig;
    this.callbacks = callbacks;
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

  public getEligibleStolenKissBossId(): EntityId | null {
    return this.eligibleStolenKissBossId;
  }

  public update(dt: number, _elapsed: number): void {
    const state = this.callbacks.getGameState();
    const isCombatActive =
      state === GAME_STATES.LOBBY ||
      state === GAME_STATES.BOSS_COMBAT ||
      state === GAME_STATES.CHAMBER_COMBAT;

    if (isCombatActive) {
      this.processPlayerCasts(state);
    }

    this.evaluateStolenKissBlindspot(state);
    this.resolveProjectileCollisions(dt, state);
    this.resolveHazardZones(dt, state);
  }

  /**
   * Evaluates 360° frontal guard-break ambush eligibility across dynamic N-Bosses during BOSS_COMBAT.
   * Strictly enforces asymmetric siphon gating (`boss.bossPhase.canBeSiphoned === true`):
   * non-siphonable bosses never open exposure windows and never trigger STOLEN_KISS.
   */
  private evaluateStolenKissBlindspot(state: GameState): void {
    let isExposed = false;
    let eligible = false;
    let closestEligibleId: EntityId | null = null;
    let closestEligibleDist = Infinity;

    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'playerIntent',
    );
    const bosses = this.world.query('bossPhase', 'transform', 'health');

    if (state === GAME_STATES.BOSS_COMBAT && player) {
      for (let i = 0; i < bosses.length; i++) {
        const boss = bosses[i];
        if (!boss) continue;
        const bp = boss.bossPhase;
        if (
          !bp.canBeSiphoned ||
          bp.isStaggered ||
          bp.isDefeated ||
          bp.dissolveTimer >= 0 ||
          boss.health.current <= STOLEN_KISS_CONFIG.minRemainingBossHp
        ) {
          continue;
        }
        const rig = this.getBossRigForEntity(boss.id);
        if (rig.exposureTimer <= 0) continue;

        isExposed = true;
        const dx = player.transform.position.x - boss.transform.position.x;
        const dz = player.transform.position.z - boss.transform.position.z;
        const dist = Math.hypot(dx, dz);

        if (
          dist <= STOLEN_KISS_CONFIG.maxTriggerDistance &&
          dist < closestEligibleDist
        ) {
          eligible = true;
          closestEligibleDist = dist;
          closestEligibleId = boss.id;
        }
      }
    }

    this.eligibleStolenKissBossId = closestEligibleId;

    if (isExposed !== this.lastBossExposed) {
      this.lastBossExposed = isExposed;
      this.callbacks.onBossExposureChange?.(isExposed);
    }

    if (eligible !== this.lastStolenKissEligible) {
      this.lastStolenKissEligible = eligible;
      this.callbacks.onStolenKissAvailabilityChange?.(eligible);
    }

    if (eligible && closestEligibleId !== null && player?.playerIntent.stolenKissRequested) {
      this.lastBossExposed = false;
      this.lastStolenKissEligible = false;
      this.callbacks.onBossExposureChange?.(false);
      this.callbacks.onStolenKissAvailabilityChange?.(false);
      this.callbacks.onTriggerStolenKiss?.(closestEligibleId);
    }
  }

  private processPlayerCasts(state: GameState): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'stamina',
      'playerIntent',
      'playerCombat',
    );
    if (!player) return;

    const { transform, stamina, playerIntent, playerCombat } = player;

    // 1. Primary Fire: Abyssal Void Bolt (rapid-fire while LMB held)
    if (playerIntent.primaryFireHeld && playerCombat.boltCooldown <= 0) {
      playerCombat.boltCooldown = PLAYER_CONFIG.boltCooldown;
      playerCombat.aimFaceTimer = PLAYER_CONFIG.aimFaceDuration;

      let closestBossPos: { x: number; y: number; z: number } | null = null;
      if (state === GAME_STATES.BOSS_COMBAT) {
        const activeBosses = this.world.query('bossPhase', 'transform');
        let bestDistSq = Infinity;
        for (let i = 0; i < activeBosses.length; i++) {
          const b = activeBosses[i];
          if (
            !b ||
            b.bossPhase.isDefeated ||
            b.bossPhase.dissolveTimer >= 0 ||
            b.bossPhase.isStaggered
          ) {
            continue;
          }
          const ddx = b.transform.position.x - transform.position.x;
          const ddz = b.transform.position.z - transform.position.z;
          const dSq = ddx * ddx + ddz * ddz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            closestBossPos = b.transform.position;
          }
        }
      }
      if (closestBossPos) {
        this.vBossPos.set(closestBossPos.x, closestBossPos.y, closestBossPos.z);
      }

      this.callbacks.getReticleTargetPoint(
        this.vAimTarget,
        closestBossPos ? this.vBossPos : null,
      );

      const dx = this.vAimTarget.x - transform.position.x;
      const dz = this.vAimTarget.z - transform.position.z;
      if (dx * dx + dz * dz > 0.25) {
        transform.rotationY = Math.atan2(dx, dz);
      }

      this.mageRig.getStaffCrystalWorldPosition(this.vCrystalPos);
      this.vBoltDir.subVectors(this.vAimTarget, this.vCrystalPos);
      if (this.vBoltDir.lengthSq() < 1.0) {
        this.callbacks.getCameraWorldDirection(this.vBoltDir);
      } else {
        this.vBoltDir.normalize();
      }

      const isEncoreBeam = playerCombat.encoreTier >= 1;
      const boltGroup = isEncoreBeam
        ? this.vfx.createUsurpedFrostBeamGroup(this.vCrystalPos, this.vBoltDir)
        : this.vfx.createVoidBoltGroup(this.vCrystalPos, this.vBoltDir);
      const damage = isEncoreBeam
        ? NG_PLUS_CONFIG.frostBeamDamageBase +
          (playerCombat.encoreTier - 1) * NG_PLUS_CONFIG.frostBeamDamagePerTier
        : PLAYER_CONFIG.boltDamage;
      const speed = isEncoreBeam
        ? NG_PLUS_CONFIG.frostBeamSpeed
        : PLAYER_CONFIG.boltSpeed;
      const radius = isEncoreBeam
        ? NG_PLUS_CONFIG.frostBeamRadius
        : PLAYER_CONFIG.boltRadius;
      const maxLife = isEncoreBeam
        ? NG_PLUS_CONFIG.frostBeamMaxLife
        : PLAYER_CONFIG.boltMaxLife;

      this.world.createEntity({
        transform: {
          position: {
            x: this.vCrystalPos.x,
            y: this.vCrystalPos.y,
            z: this.vCrystalPos.z,
          },
          rotationY: 0,
          scale: 1,
        },
        velocity: {
          vx: this.vBoltDir.x * speed,
          vy: this.vBoltDir.y * speed,
          vz: this.vBoltDir.z * speed,
          maxSpeed: speed,
        },
        projectile: {
          faction: 'PLAYER',
          kind: isEncoreBeam ? 'USURPED_BEAM' : 'VOID_BOLT',
          damage,
          radius,
          life: maxLife,
          maxLife,
          trailTimer: 0,
          spinSpeed: PLAYER_CONFIG.boltSpinSpeed,
          pierceRemaining: isEncoreBeam ? NG_PLUS_CONFIG.frostBeamPierceCount : 0,
          hitEntityIds: [],
          state: 'FLY',
          fireDelay: 0,
          fanAngle: 0,
          baseHeight: this.vCrystalPos.y,
          ownerEntityId: player.id,
        },
        meshRef: { object3D: boltGroup },
      });

      this.mageRig.triggerCastRecoil();
      this.audio.playVoidBolt();
      this.callbacks.onReticlePulse();
    }

    // 2. Secondary Cast: Umbral Pulse (radial damage + projectile clear)
    if (
      playerIntent.pulseRequested &&
      playerCombat.pulseCooldown <= 0 &&
      stamina.current >= PLAYER_CONFIG.pulseStaminaCost
    ) {
      stamina.current -= PLAYER_CONFIG.pulseStaminaCost;
      playerCombat.pulseCooldown = PLAYER_CONFIG.pulseCooldown;

      this.mageRig.triggerPulseAnim();
      const pulseOrigin = new THREE.Vector3(
        transform.position.x,
        0.14,
        transform.position.z,
      );
      const pulseGroup = this.vfx.createUmbralPulseGroup(pulseOrigin);

      this.world.createEntity({
        transform: {
          position: { x: transform.position.x, y: 0.14, z: transform.position.z },
          rotationY: 0,
          scale: PLAYER_CONFIG.pulseStartScale,
        },
        hazardZone: {
          kind: 'UMBRAL_PULSE',
          faction: 'PLAYER',
          damage: PLAYER_CONFIG.pulseDamage,
          elapsed: 0,
          telegraphDuration: 0,
          activeDuration: PLAYER_CONFIG.pulseDuration,
          currentRadius: PLAYER_CONFIG.pulseStartScale,
          maxRadius: PLAYER_CONFIG.umbralPulseRadius,
          hitThickness: 0,
          angle: 0,
          startAngle: 0,
          endAngle: 0,
          beamLength: 0,
          hitCooldown: 0,
          hasHitPlayer: false,
          hasTriggered: true,
        },
        meshRef: { object3D: pulseGroup },
      });

      this.audio.playUmbralPulse();
      this.callbacks.addCameraShake(PLAYER_CONFIG.pulseCameraShake);

      // Clear nearby enemy projectiles within widened Umbral Pulse shockwave radius
      this.clearEnemyProjectilesWithinRadius(
        transform.position.x,
        transform.position.z,
        PLAYER_CONFIG.umbralPulseRadius,
      );

      // Bidirectional Hit Check: Umbral Pulse damages all active bosses on Summit, or servants & Frost Urns in Chambers
      if (state === GAME_STATES.BOSS_COMBAT) {
        const activeBosses = this.world.query(
          'bossPhase',
          'transform',
          'hurtbox',
          'health',
        );
        for (let i = 0; i < activeBosses.length; i++) {
          const boss = activeBosses[i];
          if (
            !boss ||
            boss.bossPhase.isStaggered ||
            boss.bossPhase.isDefeated ||
            boss.bossPhase.dissolveTimer >= 0
          ) {
            continue;
          }
          const dist = Math.hypot(
            transform.position.x - boss.transform.position.x,
            transform.position.z - boss.transform.position.z,
          );
          if (dist <= PLAYER_CONFIG.umbralPulseRadius + boss.hurtbox.radius) {
            // Right-Click Umbral Pulse immediately shatters Geralt's active Quen barrier
            if (boss.bossPhase.quenHitsRemaining > 0) {
              boss.bossPhase.quenHitsRemaining = 0;
              boss.bossPhase.quenTimer = 0;
              boss.bossPhase.quenCooldown = WOLF_AND_RAVEN_CONFIG.quenCooldownSec;
              const rig = this.getBossRigForEntity(boss.id);
              if (boss.bossPhase.bossId === SPECIAL_SCENARIO_CONFIG.geraltId) {
                (rig as GeraltRig).setQuenVisual(false, 0);
              }
              this.vBurstPos.set(
                boss.transform.position.x,
                1.15,
                boss.transform.position.z,
              );
              this.vfx.spawnImpactBurst(
                this.vBurstPos,
                WOLF_AND_RAVEN_CONFIG.quenShatterSparkCount,
              );
              this.audio.playGuardBreak();
              this.callbacks.addCameraShake(
                WOLF_AND_RAVEN_CONFIG.quenShatterCameraShake,
              );
            }
            this.damageBoss(boss, BOSS_CONFIG.pulseDamage, null);
          }
        }

        // Umbral Pulse also damages/shatters Miku's floating Harmonic Amp Nodes
        const ampNodes = this.world.query(
          'harmonicAmpNode',
          'transform',
          'hurtbox',
        );
        const shatteredNodeIds: EntityId[] = [];
        for (let i = 0; i < ampNodes.length; i++) {
          const node = ampNodes[i];
          if (!node) continue;
          const d = Math.hypot(
            transform.position.x - node.transform.position.x,
            transform.position.z - node.transform.position.z,
          );
          if (d <= PLAYER_CONFIG.umbralPulseRadius + node.hurtbox.radius) {
            node.harmonicAmpNode.hp -= PLAYER_CONFIG.pulseDamage;
            this.vBurstPos.set(
              node.transform.position.x,
              node.transform.position.y,
              node.transform.position.z,
            );
            this.vfx.spawnImpactBurst(this.vBurstPos, 14);
            this.audio.playCapacitorShatter();
            if (node.harmonicAmpNode.hp <= 0) {
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 16, 7.5);
              shatteredNodeIds.push(node.id);
            }
          }
        }
        shatteredNodeIds.forEach((id) => this.world.destroyEntity(id));
      } else if (state === GAME_STATES.CHAMBER_COMBAT) {
        this.applyUmbralPulseToChamberTargets(
          transform.position.x,
          transform.position.z,
        );
      } else if (state === GAME_STATES.LOBBY) {
        this.applyUmbralPulseToLobbyTargets(
          transform.position.x,
          transform.position.z,
          playerCombat.encoreTier >= 1,
        );
      }
    }
  }

  private resolveProjectileCollisions(dt: number, state: GameState): void {
    const projectiles = this.world.query('projectile', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform', 'health');
    const activeBosses = this.world.query(
      'bossPhase',
      'transform',
      'hurtbox',
      'health',
    );
    const pillars = this.arena.pillarColliders;
    const toDestroy: EntityId[] = [];

    for (let i = 0; i < projectiles.length; i++) {
      const entity = projectiles[i];
      if (!entity) continue;
      const { projectile, transform } = entity;
      if (projectile.state !== 'FLY') continue;

      const p = transform.position;
      let hit = false;

      if (projectile.faction === 'PLAYER') {
        // Trail sparks along Void Bolt flight path
        projectile.trailTimer -= dt;
        if (projectile.trailTimer <= 0) {
          projectile.trailTimer = PLAYER_CONFIG.boltTrailInterval;
          this.vBurstPos.set(p.x, p.y, p.z);
          this.vfx.spawnTrailSpark(this.vBurstPos);
        }

        // Hit Dynamic N-Boss cylindrical hurtboxes (Summit / Special Scenario BOSS_COMBAT)
        if (state === GAME_STATES.BOSS_COMBAT) {
          for (let bIdx = 0; bIdx < activeBosses.length; bIdx++) {
            const boss = activeBosses[bIdx];
            if (
              !boss ||
              boss.bossPhase.isStaggered ||
              boss.bossPhase.isDefeated ||
              boss.bossPhase.dissolveTimer >= 0 ||
              projectile.hitEntityIds.includes(boss.id)
            ) {
              continue;
            }
            const bPos = boss.transform.position;
            const extraY = boss.bossPhase.ascendHeight;
            const minY = BOSS_CONFIG.hitMinY + extraY * 0.5;
            const maxY =
              BOSS_CONFIG.hitHeight +
              BOSS_CONFIG.floatHeight +
              extraY +
              BOSS_CONFIG.hitMaxYPad;
            const r = boss.hurtbox.radius + projectile.radius;
            const dx = p.x - bPos.x;
            const dz = p.z - bPos.z;

            if (p.y >= minY && p.y <= maxY && dx * dx + dz * dz <= r * r) {
              projectile.hitEntityIds.push(boss.id);
              this.vBurstPos.set(p.x, p.y, p.z);

              // Geralt's Quen Active Shield absorbs frontal bolts (3 hits to shatter);
              // Blinking behind him bypasses Quen for full rear-flank damage!
              let absorbedByQuen = false;
              if (boss.bossPhase.quenHitsRemaining > 0) {
                const distXZ = Math.hypot(dx, dz) || 1;
                const toBoltX = dx / distXZ;
                const toBoltZ = dz / distXZ;
                const fwdX = Math.sin(boss.transform.rotationY);
                const fwdZ = Math.cos(boss.transform.rotationY);
                const frontDot = toBoltX * fwdX + toBoltZ * fwdZ;

                if (frontDot >= WOLF_AND_RAVEN_CONFIG.quenFrontalMinDot) {
                  absorbedByQuen = true;
                  boss.bossPhase.quenHitsRemaining = Math.max(
                    0,
                    boss.bossPhase.quenHitsRemaining - 1,
                  );
                  const rig = this.getBossRigForEntity(boss.id);
                  if (boss.bossPhase.bossId === SPECIAL_SCENARIO_CONFIG.geraltId) {
                    const gRig = rig as GeraltRig;
                    gRig.triggerQuenDeflectFlash();
                    gRig.setQuenVisual(
                      boss.bossPhase.quenHitsRemaining > 0,
                      boss.bossPhase.quenHitsRemaining,
                    );
                  }
                  if (boss.bossPhase.quenHitsRemaining <= 0) {
                    boss.bossPhase.quenTimer = 0;
                    boss.bossPhase.quenCooldown =
                      WOLF_AND_RAVEN_CONFIG.quenCooldownSec;
                    this.vfx.spawnImpactBurst(
                      this.vBurstPos,
                      WOLF_AND_RAVEN_CONFIG.quenShatterSparkCount,
                    );
                    this.audio.playGuardBreak();
                    this.callbacks.addCameraShake(
                      WOLF_AND_RAVEN_CONFIG.quenShatterCameraShake,
                    );
                  } else {
                    this.vfx.spawnImpactBurst(
                      this.vBurstPos,
                      WOLF_AND_RAVEN_CONFIG.quenDeflectSparkCount,
                    );
                    this.audio.playShieldClang();
                  }
                }
              }

              if (!absorbedByQuen) {
                this.damageBoss(boss, projectile.damage, this.vBurstPos);
              }
              if (absorbedByQuen || projectile.pierceRemaining <= 0) {
                hit = true;
                break;
              } else {
                projectile.pierceRemaining--;
              }
            }
          }
        }

        // Hit Floating Harmonic Amp Nodes (Miku Phase II+ destructible targets)
        if (!hit && state === GAME_STATES.BOSS_COMBAT) {
          const ampNodes = this.world.query(
            'harmonicAmpNode',
            'transform',
            'hurtbox',
          );
          for (let j = 0; j < ampNodes.length; j++) {
            const node = ampNodes[j];
            if (!node || projectile.hitEntityIds.includes(node.id)) continue;
            const nPos = node.transform.position;
            const r = node.hurtbox.radius + projectile.radius;
            const dx = p.x - nPos.x;
            const dz = p.z - nPos.z;
            if (
              p.y >= node.hurtbox.minY &&
              p.y <= node.hurtbox.maxY &&
              dx * dx + dz * dz <= r * r
            ) {
              projectile.hitEntityIds.push(node.id);
              node.harmonicAmpNode.hp -= projectile.damage;
              this.vBurstPos.set(p.x, p.y, p.z);
              this.vfx.spawnImpactBurst(this.vBurstPos, 10);
              this.audio.playCapacitorShatter();
              if (node.harmonicAmpNode.hp <= 0) {
                this.vfx.spawnFrostShatterBurst(
                  new THREE.Vector3(nPos.x, nPos.y, nPos.z),
                  16,
                  7.4,
                );
                toDestroy.push(node.id);
              }
              if (projectile.pierceRemaining > 0) {
                projectile.pierceRemaining--;
              } else {
                hit = true;
                break;
              }
            }
          }
        }

        // Hit Chamber Servants & Destructible Frost Urns (CHAMBER_COMBAT)
        if (!hit && state === GAME_STATES.CHAMBER_COMBAT) {
          hit = this.resolvePlayerProjectileVsChamber(entity, toDestroy);
        }

        // Hit Sanctum Abyssal Target Crystal & Sealed Realm Portals (LOBBY)
        if (!hit && state === GAME_STATES.LOBBY) {
          hit = this.resolvePlayerProjectileVsLobby(entity);
        }

        // Perimeter Pillars
        if (!hit) {
          for (let j = 0; j < pillars.length; j++) {
            const pil = pillars[j];
            if (!pil) continue;
            const dx = p.x - pil.x;
            const dz = p.z - pil.z;
            const rad = pil.radius + projectile.radius;
            if (p.y >= 0 && p.y <= pil.height && dx * dx + dz * dz <= rad * rad) {
              hit = true;
              break;
            }
          }
        }

        // Arena Floor & Chamber Wall Bounds
        const bounds = this.arena.bounds;
        if (!hit && p.y <= ARENA_CONFIG.floorCollisionY) {
          if (bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR) {
            if (
              Math.abs(p.x) <= bounds.halfWidth + ARENA_CONFIG.floorCollisionRadiusPad &&
              Math.abs(p.z) <= bounds.halfLength + ARENA_CONFIG.floorCollisionRadiusPad
            ) {
              hit = true;
            }
          } else if (bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY) {
            if (
              isPointInsideCompositeLobby(
                p.x,
                p.z,
                bounds,
                -ARENA_CONFIG.floorCollisionRadiusPad,
              )
            ) {
              hit = true;
            }
          } else {
            const floorR = bounds.radius + ARENA_CONFIG.floorCollisionRadiusPad;
            if (p.x * p.x + p.z * p.z <= floorR * floorR) {
              hit = true;
            }
          }
        }
        if (
          !hit &&
          bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR &&
          (Math.abs(p.x) >= bounds.halfWidth ||
            Math.abs(p.z) >= bounds.halfLength)
        ) {
          hit = true;
        } else if (
          !hit &&
          bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY &&
          !isPointInsideCompositeLobby(p.x, p.z, bounds, -0.75)
        ) {
          hit = true;
        }

        if (hit || projectile.life <= 0) {
          if (hit) {
            this.vBurstPos.set(p.x, p.y, p.z);
            this.vfx.spawnImpactBurst(
              this.vBurstPos,
              PLAYER_CONFIG.boltImpactSparkCount,
            );
          }
          toDestroy.push(entity.id);
        }
      } else {
        // BOSS / SERVANT Projectiles
        let remove = projectile.life <= 0;

        if (projectile.kind === 'ICE_LANCE') {
          if (!remove && p.y <= ARENA_CONFIG.floorCollisionY) remove = true;

          if (!remove) {
            for (let j = 0; j < pillars.length; j++) {
              const pil = pillars[j];
              if (!pil) continue;
              const dx = p.x - pil.x;
              const dz = p.z - pil.z;
              const rad = pil.radius + BOSS_CONFIG.phase1.lancePillarPad;
              if (dx * dx + dz * dz <= rad * rad && p.y <= pil.height) {
                remove = true;
                break;
              }
            }
          }

          if (
            !remove &&
            player &&
            !projectile.hitEntityIds.includes(player.id)
          ) {
            const dx = p.x - player.transform.position.x;
            const dz = p.z - player.transform.position.z;
            if (
              p.y >= 0 &&
              p.y <= BOSS_CONFIG.phase1.lanceHitMaxY &&
              dx * dx + dz * dz <= projectile.radius * projectile.radius
            ) {
              if (!player.health.isInvulnerable) {
                projectile.hitEntityIds.push(player.id);
                this.damagePlayer(projectile.damage, state);
                remove = true;
              }
            }
          }

          if (remove) {
            this.vBurstPos.set(p.x, p.y, p.z);
            this.vfx.spawnFrostShatterBurst(this.vBurstPos, 7, 5.2);
            toDestroy.push(entity.id);
          }
        } else if (projectile.kind === 'GLACIAL_CRESCENT') {
          const radial = Math.hypot(p.x, p.z);
          if (
            player &&
            !projectile.hitEntityIds.includes(player.id) &&
            !player.health.isInvulnerable
          ) {
            const dx = p.x - player.transform.position.x;
            const dz = p.z - player.transform.position.z;
            if (dx * dx + dz * dz <= projectile.radius * projectile.radius) {
              projectile.hitEntityIds.push(player.id);
              this.damagePlayer(projectile.damage, state);
              this.vBurstPos.set(p.x, p.y, p.z);
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 10, 6.0);
            }
          }

          if (
            remove ||
            radial > ARENA_CONFIG.radius + BOSS_CONFIG.phase1.crescentArenaPad
          ) {
            toDestroy.push(entity.id);
          }
        } else if (projectile.kind === 'SPIRAL_ORB') {
          if (
            !remove &&
            Math.hypot(p.x, p.z) >
              ARENA_CONFIG.radius + ARENA_CONFIG.floorCollisionRadiusPad
          ) {
            remove = true;
          }

          if (
            !remove &&
            player &&
            !projectile.hitEntityIds.includes(player.id) &&
            !player.health.isInvulnerable
          ) {
            const dx = p.x - player.transform.position.x;
            const dz = p.z - player.transform.position.z;
            if (dx * dx + dz * dz <= projectile.radius * projectile.radius) {
              projectile.hitEntityIds.push(player.id);
              this.damagePlayer(projectile.damage, state);
              this.vBurstPos.set(p.x, p.y, p.z);
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 8, 5.5);
              remove = true;
            }
          }

          if (!remove) {
            for (let j = 0; j < pillars.length; j++) {
              const pil = pillars[j];
              if (!pil) continue;
              const dx = p.x - pil.x;
              const dz = p.z - pil.z;
              const rad = pil.radius + BOSS_CONFIG.phase3.spiralOrbPillarPad;
              if (dx * dx + dz * dz <= rad * rad) {
                this.vBurstPos.set(p.x, p.y, p.z);
                this.vfx.spawnFrostShatterBurst(this.vBurstPos, 5, 4.5);
                remove = true;
                break;
              }
            }
          }

          if (remove) {
            toDestroy.push(entity.id);
          }
        } else if (projectile.kind === 'SERVANT_BOLT') {
          const bounds = this.arena.getArenaBounds();
          if (
            !remove &&
            bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR &&
            (Math.abs(p.x) >= bounds.halfWidth ||
              Math.abs(p.z) >= bounds.halfLength)
          ) {
            remove = true;
          }

          if (!remove) {
            for (let j = 0; j < pillars.length; j++) {
              const pil = pillars[j];
              if (!pil) continue;
              const dx = p.x - pil.x;
              const dz = p.z - pil.z;
              const rad = pil.radius + projectile.radius * 0.5;
              if (dx * dx + dz * dz <= rad * rad && p.y <= pil.height) {
                remove = true;
                break;
              }
            }
          }

          if (
            !remove &&
            player &&
            !projectile.hitEntityIds.includes(player.id) &&
            !player.health.isInvulnerable
          ) {
            const dx = p.x - player.transform.position.x;
            const dz = p.z - player.transform.position.z;
            const hitR = projectile.radius + PLAYER_CONFIG.radius;
            if (dx * dx + dz * dz <= hitR * hitR) {
              projectile.hitEntityIds.push(player.id);
              this.damagePlayer(projectile.damage, state);
              remove = true;
            }
          }

          if (remove) {
            this.vBurstPos.set(p.x, p.y, p.z);
            this.vfx.spawnFrostShatterBurst(this.vBurstPos, 6, 4.8);
            toDestroy.push(entity.id);
          }
        }
      }
    }

    for (let i = 0; i < toDestroy.length; i++) {
      const id = toDestroy[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }
  }

  private resolveHazardZones(dt: number, state: GameState): void {
    const hazards = this.world.query('hazardZone', 'transform');
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'health',
      'playerCombat',
    );
    const boss = this.world.queryFirst('bossPhase', 'transform');
    const toDestroy: EntityId[] = [];
    let anyActiveLaser = false;

    for (let i = 0; i < hazards.length; i++) {
      const entity = hazards[i];
      if (!entity) continue;
      const { hazardZone: hz, transform } = entity;
      hz.elapsed += dt;

      if (hz.kind === 'UMBRAL_PULSE') {
        const t = THREE.MathUtils.clamp(hz.elapsed / hz.activeDuration, 0, 1);
        const ease = 1 - Math.pow(1 - t, 2.5);
        hz.currentRadius = THREE.MathUtils.lerp(
          PLAYER_CONFIG.pulseStartScale,
          hz.maxRadius,
          ease,
        );
        this.clearEnemyProjectilesWithinRadius(
          transform.position.x,
          transform.position.z,
          hz.currentRadius,
        );
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
        }
      } else if (hz.kind === 'PHASE_SHOCKWAVE') {
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
        }
      } else if (hz.kind === 'FROST_RING_NOVA') {
        const t = hz.elapsed / hz.activeDuration;
        if (t >= 1.0) {
          toDestroy.push(entity.id);
          continue;
        }
        const ease = 1 - Math.pow(1 - t, 2.2);
        hz.currentRadius =
          BOSS_CONFIG.phase1.novaStartRadius + ease * hz.maxRadius;

        if (player && !hz.hasHitPlayer && !player.health.isInvulnerable) {
          const dist = Math.hypot(
            player.transform.position.x - transform.position.x,
            player.transform.position.z - transform.position.z,
          );
          if (Math.abs(dist - hz.currentRadius) <= hz.hitThickness) {
            hz.hasHitPlayer = true;
            this.damagePlayer(hz.damage, state);
          }
        }
      } else if (hz.kind === 'GLACIAL_LASER') {
        hz.hitCooldown = Math.max(0, hz.hitCooldown - dt);
        if (boss) {
          transform.position.x = boss.transform.position.x;
          transform.position.y =
            BOSS_CONFIG.phase2.laserHeight + boss.bossPhase.ascendHeight;
          transform.position.z = boss.transform.position.z;
        }

        if (hz.elapsed < hz.telegraphDuration) {
          hz.angle = hz.startAngle;
          transform.rotationY = hz.startAngle;
        } else if (hz.elapsed < hz.telegraphDuration + hz.activeDuration) {
          anyActiveLaser = true;
          if (!hz.hasTriggered) {
            hz.hasTriggered = true;
            this.audio.playGlacialLaser(hz.activeDuration);
            this.callbacks.addCameraShake(BOSS_CONFIG.phase2.laserCameraShake);
          }

          const t = (hz.elapsed - hz.telegraphDuration) / hz.activeDuration;
          const smoothT = t * t * (3 - 2 * t);
          hz.angle = THREE.MathUtils.lerp(hz.startAngle, hz.endAngle, smoothT);
          transform.rotationY = hz.angle;

          const tailFade =
            t > BOSS_CONFIG.phase2.laserTailFadeStart
              ? (1 - t) / (1 - BOSS_CONFIG.phase2.laserTailFadeStart)
              : 1.0;

          if (
            player &&
            !player.health.isInvulnerable &&
            hz.hitCooldown <= 0 &&
            tailFade > BOSS_CONFIG.phase2.laserMinDamageFade
          ) {
            const dirX = Math.sin(hz.angle);
            const dirZ = Math.cos(hz.angle);
            const relX = player.transform.position.x - transform.position.x;
            const relZ = player.transform.position.z - transform.position.z;
            const proj = relX * dirX + relZ * dirZ;
            if (
              proj >= BOSS_CONFIG.phase2.laserMinProjDist &&
              proj <= hz.beamLength
            ) {
              const perp = Math.abs(relX * -dirZ + relZ * dirX);
              if (perp <= hz.hitThickness) {
                hz.hitCooldown = BOSS_CONFIG.phase2.laserHitCooldown;
                this.damagePlayer(hz.damage, state);
                this.vfx.spawnFrostShatterBurst(
                  new THREE.Vector3(
                    player.transform.position.x,
                    1.1,
                    player.transform.position.z,
                  ),
                  10,
                  6.2,
                );
              }
            }
          }
        } else {
          toDestroy.push(entity.id);
        }
      } else if (hz.kind === 'ICE_PILLAR') {
        if (hz.elapsed < 0) continue;

        if (
          hz.elapsed >= hz.telegraphDuration &&
          hz.elapsed < hz.telegraphDuration + hz.activeDuration
        ) {
          if (!hz.hasTriggered) {
            hz.hasTriggered = true;
            if (boss?.bossPhase.bossId === SERENA_CONFIG.id) {
              this.audio.playGeyserErupt();
              this.callbacks.addCameraShake(
                SERENA_CONFIG.abyssalUndertow.geyserCameraShake,
              );
            } else {
              this.audio.playIceShatter(0.92);
              this.callbacks.addCameraShake(BOSS_CONFIG.phase3.pillarCameraShake);
            }
            this.vfx.spawnFrostShatterBurst(
              new THREE.Vector3(
                transform.position.x,
                0.8,
                transform.position.z,
              ),
              12,
              7.2,
            );

            if (player && !hz.hasHitPlayer && !player.health.isInvulnerable) {
              const dist = Math.hypot(
                player.transform.position.x - transform.position.x,
                player.transform.position.z - transform.position.z,
              );
              if (dist <= hz.currentRadius) {
                hz.hasHitPlayer = true;
                this.damagePlayer(hz.damage, state);
              }
            }
          }
        } else if (hz.elapsed >= hz.telegraphDuration + hz.activeDuration) {
          this.vfx.spawnFrostShatterBurst(
            new THREE.Vector3(transform.position.x, 2.2, transform.position.z),
            14,
            7.6,
          );
          toDestroy.push(entity.id);
        }
      } else if (hz.kind === 'ABYSSAL_WHIRLPOOL') {
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
          continue;
        }
        // Gently pull the Dark Mage inward toward the swirling whirlpool center (respecting Blink i-frames)
        if (
          state === GAME_STATES.BOSS_COMBAT &&
          player &&
          !player.health.isInvulnerable
        ) {
          const toCenterX = transform.position.x - player.transform.position.x;
          const toCenterZ = transform.position.z - player.transform.position.z;
          const dist = Math.hypot(toCenterX, toCenterZ);
          if (dist > 1.35 && dist <= hz.maxRadius) {
            const pullStep =
              SERENA_CONFIG.abyssalUndertow.undertowPullSpeed * dt;
            const nx = toCenterX / dist;
            const nz = toCenterZ / dist;
            player.transform.position.x += nx * pullStep;
            player.transform.position.z += nz * pullStep;
          }
        }
      } else if (hz.kind === 'LASER_WALL') {
        hz.hitCooldown = Math.max(0, hz.hitCooldown - dt);
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
          continue;
        }
        // Persistent magenta hard-light laser fence left behind Miku's dashes (Blink passes safely with i-frames)
        if (
          hz.elapsed >= hz.telegraphDuration &&
          player &&
          !player.health.isInvulnerable &&
          hz.hitCooldown <= 0
        ) {
          const dirX = Math.sin(hz.angle);
          const dirZ = Math.cos(hz.angle);
          const relX = player.transform.position.x - transform.position.x;
          const relZ = player.transform.position.z - transform.position.z;
          const proj = relX * dirX + relZ * dirZ;
          if (proj >= -0.25 && proj <= hz.beamLength + 0.25) {
            const perp = Math.abs(relX * -dirZ + relZ * dirX);
            if (perp <= hz.hitThickness + PLAYER_CONFIG.radius * 0.5) {
              hz.hitCooldown = MIKU_CONFIG.laserWallHitCooldown;
              this.damagePlayer(hz.damage, state);
              this.vfx.spawnImpactBurst(
                new THREE.Vector3(
                  player.transform.position.x,
                  1.1,
                  player.transform.position.z,
                ),
                10,
              );
            }
          }
        }
      } else if (hz.kind === 'YRDEN_TRAP') {
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
          continue;
        }
        if (
          state === GAME_STATES.BOSS_COMBAT &&
          player &&
          !player.health.isInvulnerable
        ) {
          const dist = Math.hypot(
            player.transform.position.x - transform.position.x,
            player.transform.position.z - transform.position.z,
          );
          if (dist <= hz.maxRadius) {
            player.playerCombat.yrdenSlowTimer =
              WOLF_AND_RAVEN_CONFIG.yrdenSlowRefreshSec;
          }
        }
      } else if (hz.kind === 'CHAOS_LIGHTNING') {
        if (hz.elapsed < 0) continue;
        if (
          hz.elapsed >= hz.telegraphDuration &&
          hz.elapsed < hz.telegraphDuration + hz.activeDuration
        ) {
          if (!hz.hasTriggered) {
            hz.hasTriggered = true;
            this.audio.playChordBurst();
            this.callbacks.addCameraShake(
              WOLF_AND_RAVEN_CONFIG.lightningCameraShake,
            );
            this.vBurstPos.set(
              transform.position.x,
              0.6,
              transform.position.z,
            );
            this.vfx.spawnImpactBurst(this.vBurstPos, 14);
            if (player && !hz.hasHitPlayer && !player.health.isInvulnerable) {
              const dist = Math.hypot(
                player.transform.position.x - transform.position.x,
                player.transform.position.z - transform.position.z,
              );
              if (dist <= hz.currentRadius) {
                hz.hasHitPlayer = true;
                this.damagePlayer(hz.damage, state);
              }
            }
          }
        } else if (hz.elapsed >= hz.telegraphDuration + hz.activeDuration) {
          toDestroy.push(entity.id);
        }
      } else if (hz.kind === 'SPATIAL_RIFT') {
        if (hz.elapsed >= hz.activeDuration) {
          toDestroy.push(entity.id);
        }
      }
    }

    for (let i = 0; i < toDestroy.length; i++) {
      const id = toDestroy[i];
      if (id !== undefined) this.world.destroyEntity(id);
    }

    if (!anyActiveLaser) {
      const remainingLasers = this.world
        .query('hazardZone')
        .some((e) => e.hazardZone.kind === 'GLACIAL_LASER');
      if (!remainingLasers) {
        this.audio.stopLaserLoop();
      }
    }
  }

  private clearEnemyProjectilesWithinRadius(
    originX: number,
    originZ: number,
    radius: number,
  ): void {
    const enemyProjectiles = this.world.query('projectile', 'transform');
    const clearedIds: EntityId[] = [];
    for (let i = 0; i < enemyProjectiles.length; i++) {
      const ep = enemyProjectiles[i];
      if (!ep || ep.projectile.faction === 'PLAYER') continue;
      const d = Math.hypot(
        ep.transform.position.x - originX,
        ep.transform.position.z - originZ,
      );
      if (d <= radius) {
        this.vfx.spawnFrostShatterBurst(
          new THREE.Vector3(
            ep.transform.position.x,
            ep.transform.position.y,
            ep.transform.position.z,
          ),
          6,
          5.0,
        );
        clearedIds.push(ep.id);
      }
    }
    clearedIds.forEach((id) => this.world.destroyEntity(id));
  }

  private resolvePlayerProjectileVsLobby(projEntity: {
    projectile: {
      kind: string;
      damage: number;
      radius: number;
    };
    transform: { position: { x: number; y: number; z: number } };
  }): boolean {
    const { projectile, transform } = projEntity;
    const p = transform.position;
    const isEncore = projectile.kind === 'USURPED_BEAM';

    // 1. Abyssal Target Crystal in Eastern Alcove
    const dDummy = Math.hypot(
      p.x - LOBBY_CONFIG.dummyPos.x,
      p.z - LOBBY_CONFIG.dummyPos.z,
    );
    if (
      dDummy <= LOBBY_CONFIG.dummyRadius + projectile.radius &&
      p.y >= 0.2 &&
      p.y <= 2.9
    ) {
      this.vBurstPos.set(p.x, p.y, p.z);
      this.callbacks.onLobbyDummyHit?.(
        projectile.damage,
        isEncore,
        this.vBurstPos,
      );
      return true;
    }

    // 2. Sealed Realm III (Harmonic Citadel) Portal (Realm II is unsealed)
    const dR3 = Math.hypot(
      p.x - LOBBY_CONFIG.realm3PortalPos.x,
      p.z - LOBBY_CONFIG.realm3PortalPos.z,
    );
    if (
      dR3 <= LOBBY_CONFIG.portalRingRadius + projectile.radius &&
      p.y >= 0.2 &&
      p.y <= LOBBY_CONFIG.portalCenterY + LOBBY_CONFIG.portalRingRadius
    ) {
      this.vBurstPos.set(p.x, p.y, p.z);
      this.callbacks.onLobbySealedPortalHit?.(3, this.vBurstPos);
      return true;
    }

    return false;
  }

  private applyUmbralPulseToLobbyTargets(
    originX: number,
    originZ: number,
    isEncore: boolean,
  ): void {
    const pulseR = PLAYER_CONFIG.umbralPulseRadius;

    const dDummy = Math.hypot(
      originX - LOBBY_CONFIG.dummyPos.x,
      originZ - LOBBY_CONFIG.dummyPos.z,
    );
    if (dDummy <= pulseR + LOBBY_CONFIG.dummyRadius) {
      this.vBurstPos.set(
        LOBBY_CONFIG.dummyPos.x,
        LOBBY_CONFIG.dummyCenterY,
        LOBBY_CONFIG.dummyPos.z,
      );
      this.callbacks.onLobbyDummyHit?.(
        PLAYER_CONFIG.pulseDamage,
        isEncore,
        this.vBurstPos,
      );
    }

    const dR3 = Math.hypot(
      originX - LOBBY_CONFIG.realm3PortalPos.x,
      originZ - LOBBY_CONFIG.realm3PortalPos.z,
    );
    if (dR3 <= pulseR + LOBBY_CONFIG.portalRingRadius) {
      this.vBurstPos.set(
        LOBBY_CONFIG.realm3PortalPos.x,
        LOBBY_CONFIG.portalCenterY,
        LOBBY_CONFIG.realm3PortalPos.z,
      );
      this.callbacks.onLobbySealedPortalHit?.(3, this.vBurstPos);
    }
  }

  private resolvePlayerProjectileVsChamber(
    projEntity: {
      projectile: {
        kind: string;
        damage: number;
        radius: number;
        pierceRemaining: number;
        hitEntityIds: EntityId[];
      };
      transform: { position: { x: number; y: number; z: number } };
    },
    extraDestroys: EntityId[],
  ): boolean {
    const { projectile, transform } = projEntity;
    const p = transform.position;

    // 1. Check Chamber Servants (with Frostbite Warden directional frontal tower-shield)
    const servants = this.world.query(
      'servantAI',
      'transform',
      'hurtbox',
      'health',
    );
    for (let i = 0; i < servants.length; i++) {
      const s = servants[i];
      if (!s) continue;
      if (
        s.servantAI.state === SERVANT_AI_STATES.SPAWNING ||
        s.servantAI.state === SERVANT_AI_STATES.DYING ||
        projectile.hitEntityIds.includes(s.id)
      ) {
        continue;
      }

      const sPos = s.transform.position;
      const r = s.hurtbox.radius + projectile.radius;
      const dx = p.x - sPos.x;
      const dz = p.z - sPos.z;
      if (
        p.y >= s.hurtbox.minY &&
        p.y <= s.hurtbox.maxY + 0.3 &&
        dx * dx + dz * dz <= r * r
      ) {
        projectile.hitEntityIds.push(s.id);
        this.vBurstPos.set(p.x, p.y, p.z);

        const isTowerShieldArchetype = this.isTowerShieldServant(
          s.servantAI.archetype,
        );
        const isWardenShielded =
          isTowerShieldArchetype && s.servantAI.guardBrokenTimer <= 0;

        if (isWardenShielded) {
          const distXZ = Math.hypot(dx, dz) || 1;
          const toBoltX = dx / distXZ;
          const toBoltZ = dz / distXZ;
          const fwdX = Math.sin(s.transform.rotationY);
          const fwdZ = Math.cos(s.transform.rotationY);
          const frontDot = toBoltX * fwdX + toBoltZ * fwdZ;

          if (frontDot > CHAMBER_CONFIG.wardenShieldDotThreshold) {
            if (projectile.kind === 'USURPED_BEAM') {
              // Piercing NG+ Spear-Beam shatters Warden / Coral Bastion / Aegis Monolith frontal tower-shield
              if (s.servantAI.archetype === SERVANT_ARCHETYPES.CORAL_BASTION) {
                this.audio.playCoralShatter();
              } else if (
                s.servantAI.archetype === SERVANT_ARCHETYPES.AEGIS_MONOLITH
              ) {
                this.audio.playCapacitorShatter();
                this.audio.playGuardBreak();
              } else {
                this.audio.playGuardBreak();
              }
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 18, 8.0);
              this.callbacks.onServantGuardBreak?.(s.id);
              this.damageServant(s, projectile.damage, this.vBurstPos);
            } else {
              // Standard Void Bolt deflected with shield clang (0 damage)
              this.audio.playShieldClang();
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 8, 5.8);
              return true;
            }
          } else {
            // Flanked from behind/side via Shadow Blink
            this.damageServant(s, projectile.damage, this.vBurstPos);
          }
        } else {
          const guardMult =
            s.servantAI.archetype === SERVANT_ARCHETYPES.AEGIS_MONOLITH
              ? HARMONIC_SERVANT_CONFIG.AEGIS_MONOLITH.guardBrokenDamageMultiplier
              : s.servantAI.archetype === SERVANT_ARCHETYPES.CORAL_BASTION
                ? SUNKEN_SERVANT_CONFIG.CORAL_BASTION.guardBrokenDamageMultiplier
                : SERVANT_CONFIG.FROSTBITE_WARDEN.guardBrokenDamageMultiplier;
          const mult = s.servantAI.guardBrokenTimer > 0 ? guardMult : 1.0;
          this.damageServant(s, Math.round(projectile.damage * mult), this.vBurstPos);
        }

        if (projectile.pierceRemaining > 0) {
          projectile.pierceRemaining--;
        } else {
          return true;
        }
      }
    }

    // 2. Check Destructible Frost Urns
    const urns = this.world.query(
      'destructibleProp',
      'transform',
      'hurtbox',
      'meshRef',
    );
    for (let i = 0; i < urns.length; i++) {
      const u = urns[i];
      if (!u || projectile.hitEntityIds.includes(u.id)) continue;
      const uPos = u.transform.position;
      const r = u.hurtbox.radius + projectile.radius;
      const dx = p.x - uPos.x;
      const dz = p.z - uPos.z;
      if (p.y >= 0 && p.y <= u.hurtbox.maxY && dx * dx + dz * dz <= r * r) {
        projectile.hitEntityIds.push(u.id);
        this.shatterFrostUrn(u, extraDestroys);
        if (projectile.pierceRemaining > 0) {
          projectile.pierceRemaining--;
        } else {
          return true;
        }
      }
    }

    return false;
  }

  private applyUmbralPulseToChamberTargets(
    originX: number,
    originZ: number,
  ): void {
    const pulseR = PLAYER_CONFIG.umbralPulseRadius;
    const servants = this.world.query(
      'servantAI',
      'transform',
      'hurtbox',
      'health',
    );
    for (let i = 0; i < servants.length; i++) {
      const s = servants[i];
      if (!s) continue;
      if (
        s.servantAI.state === SERVANT_AI_STATES.SPAWNING ||
        s.servantAI.state === SERVANT_AI_STATES.DYING
      ) {
        continue;
      }
      const dist = Math.hypot(
        s.transform.position.x - originX,
        s.transform.position.z - originZ,
      );
      if (dist <= pulseR + s.hurtbox.radius) {
        this.vBurstPos.set(
          s.transform.position.x,
          1.2,
          s.transform.position.z,
        );
        if (
          this.isTowerShieldServant(s.servantAI.archetype) &&
          s.servantAI.guardBrokenTimer <= 0
        ) {
          if (s.servantAI.archetype === SERVANT_ARCHETYPES.CORAL_BASTION) {
            this.audio.playCoralShatter();
          } else if (
            s.servantAI.archetype === SERVANT_ARCHETYPES.AEGIS_MONOLITH
          ) {
            this.audio.playCapacitorShatter();
            this.audio.playGuardBreak();
          } else {
            this.audio.playGuardBreak();
          }
          this.vfx.spawnFrostShatterBurst(this.vBurstPos, 18, 8.2);
          this.callbacks.onServantGuardBreak?.(s.id);
        }
        this.damageServant(s, PLAYER_CONFIG.pulseDamage, this.vBurstPos);
      }
    }

    // Umbral Pulse also shatters nearby Destructible Frost Urns
    const urns = this.world.query(
      'destructibleProp',
      'transform',
      'hurtbox',
      'meshRef',
    );
    const urnsToDestroy: EntityId[] = [];
    for (let i = 0; i < urns.length; i++) {
      const u = urns[i];
      if (!u) continue;
      const dist = Math.hypot(
        u.transform.position.x - originX,
        u.transform.position.z - originZ,
      );
      if (dist <= pulseR + u.hurtbox.radius) {
        this.shatterFrostUrn(u, urnsToDestroy);
      }
    }
    urnsToDestroy.forEach((id) => this.world.destroyEntity(id));
  }

  private damageServant(
    servant: {
      id: EntityId;
      health: { current: number };
      transform: { position: { x: number; y: number; z: number } };
    },
    amount: number,
    hitPoint: THREE.Vector3,
  ): void {
    servant.health.current = Math.max(0, servant.health.current - amount);
    this.vfx.spawnFrostShatterBurst(hitPoint, 8, 6.0);
    this.audio.playIceShatter(0.55);
    this.callbacks.onServantHitFlash?.(servant.id);

    if (servant.health.current <= 0) {
      this.vfx.spawnFrostShatterBurst(hitPoint, 16, 7.6);
      this.callbacks.onServantDefeated?.(servant.id);
    }
  }

  private isTowerShieldServant(archetype: ServantArchetype): boolean {
    return (
      archetype === SERVANT_ARCHETYPES.FROSTBITE_WARDEN ||
      archetype === SERVANT_ARCHETYPES.CORAL_BASTION ||
      archetype === SERVANT_ARCHETYPES.AEGIS_MONOLITH
    );
  }

  private shatterFrostUrn(
    urn: {
      id: EntityId;
      destructibleProp: { propType: string; hp: number; healValue: number };
      transform: { position: { x: number; y: number; z: number } };
      meshRef: { object3D: THREE.Object3D };
    },
    destroyQueue: EntityId[],
  ): void {
    urn.destructibleProp.hp -= 1;
    if (urn.destructibleProp.hp > 0) return;

    urn.meshRef.object3D.visible = false;
    const pos = new THREE.Vector3(
      urn.transform.position.x,
      urn.transform.position.y + 0.65,
      urn.transform.position.z,
    );
    this.vfx.spawnFrostShatterBurst(pos, 14, 6.8);
    if (urn.destructibleProp.propType === DESTRUCTIBLE_PROP_TYPES.PEARL_URN) {
      this.audio.playCoralShatter();
    } else if (
      urn.destructibleProp.propType ===
      DESTRUCTIBLE_PROP_TYPES.ACOUSTIC_CAPACITOR
    ) {
      this.audio.playCapacitorShatter();
    } else {
      this.audio.playUrnShatter();
    }
    this.callbacks.onUrnShattered?.(pos, urn.destructibleProp.healValue);
    destroyQueue.push(urn.id);
  }

  /**
   * Public damage entry point so ChamberSystem melee lunges & pounces reuse
   * unified i-frames, frost hit flash, SFX, and defeat routing.
   */
  public applyPlayerDamage(amount: number): void {
    this.damagePlayer(amount, this.callbacks.getGameState());
  }

  private damageBoss(
    boss: {
      readonly id: EntityId;
      bossPhase: {
        isStaggered: boolean;
        canBeSiphoned: boolean;
        isDefeated: boolean;
        dissolveTimer: number;
        staggerThreshold: number;
        ascendHeight: number;
        activePatternId: string | null;
      };
      health: { current: number; max: number };
      transform: { position: { x: number; y: number; z: number } };
    },
    amount: number,
    hitPoint: THREE.Vector3 | null,
  ): void {
    const bp = boss.bossPhase;
    if (bp.isStaggered || bp.isDefeated || bp.dissolveTimer >= 0) return;

    const staggerFloor = bp.canBeSiphoned
      ? Math.floor(boss.health.max * bp.staggerThreshold)
      : 0;
    boss.health.current = Math.max(staggerFloor, boss.health.current - amount);

    const rig = this.getBossRigForEntity(boss.id);
    rig.triggerHitFlash();

    const burstPos = hitPoint
      ? hitPoint.clone()
      : new THREE.Vector3(
          boss.transform.position.x,
          1.3 + bp.ascendHeight,
          boss.transform.position.z,
        );
    this.vfx.spawnFrostShatterBurst(burstPos, 10, 6.2);
    this.audio.playIceShatter(0.5);

    // Non-siphonable boss reaching 0 HP immediately enters lethal stagger-collapse & 1.6s ash/ember dissolution
    if (!bp.canBeSiphoned && boss.health.current <= 0) {
      bp.dissolveTimer = 0;
      bp.activePatternId = null;
      bp.ascendHeight = 0;
      rig.setAscendHeight(0);
      this.vfx.spawnImpactBurst(burstPos, 24);
      this.vfx.spawnFrostShatterBurst(burstPos, 18, 8.8);
      this.audio.playIceShatter(0.95);
      this.callbacks.addCameraShake(SPECIAL_SCENARIO_CONFIG.disperseCameraShake * 0.7);
    }

    this.callbacks.onBossDamaged(boss.id);
  }

  private damagePlayer(amount: number, state: GameState): void {
    if (
      state !== GAME_STATES.BOSS_COMBAT &&
      state !== GAME_STATES.CHAMBER_COMBAT
    ) {
      return;
    }
    const player = this.world.queryFirst('playerTag', 'health');
    if (!player || player.health.isInvulnerable) return;

    player.health.current = Math.max(0, player.health.current - amount);
    this.callbacks.addCameraShake(PLAYER_CONFIG.playerHitCameraShake);
    this.audio.playPlayerHit();
    this.callbacks.onPlayerDamaged();

    if (player.health.current <= 0) {
      this.callbacks.onPlayerDefeated();
    }
  }
}
