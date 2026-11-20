import * as THREE from 'three';
import {
  ARENA_BOUNDS_KINDS,
  ARENA_CONFIG,
  BOSS_CONFIG,
  CHAMBER_CONFIG,
  GAME_STATES,
  NG_PLUS_CONFIG,
  PLAYER_CONFIG,
  SERVANT_AI_STATES,
  SERVANT_ARCHETYPES,
  SERVANT_CONFIG,
  type GameState,
} from '../../config/gameConfig';
import type { IArenaGeometry } from '../../engine/SceneManager';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
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
  onBossDamaged: () => void;
  onServantHitFlash?: (entityId: EntityId) => void;
  onServantGuardBreak?: (entityId: EntityId) => void;
  onServantDefeated?: (entityId: EntityId) => void;
  onUrnShattered?: (origin: THREE.Vector3, healValue: number) => void;
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
  private readonly bossRig: BossRigAdapter;
  private readonly callbacks: ICombatCallbacks;

  // Reusable scratch vectors (zero per-frame GC churn)
  private readonly vAimTarget = new THREE.Vector3();
  private readonly vCrystalPos = new THREE.Vector3();
  private readonly vBoltDir = new THREE.Vector3();
  private readonly vBossPos = new THREE.Vector3();
  private readonly vBurstPos = new THREE.Vector3();

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

  public update(dt: number, _elapsed: number): void {
    const state = this.callbacks.getGameState();
    const isCombatActive =
      state === GAME_STATES.BOSS_COMBAT || state === GAME_STATES.CHAMBER_COMBAT;

    if (isCombatActive) {
      this.processPlayerCasts(state);
    }

    this.resolveProjectileCollisions(dt, state);
    this.resolveHazardZones(dt, state);
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

      const boss =
        state === GAME_STATES.BOSS_COMBAT
          ? this.world.queryFirst('bossPhase', 'transform')
          : undefined;
      if (boss) {
        this.vBossPos.set(
          boss.transform.position.x,
          boss.transform.position.y,
          boss.transform.position.z,
        );
      }

      this.callbacks.getReticleTargetPoint(
        this.vAimTarget,
        boss ? this.vBossPos : null,
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

      // Bidirectional Hit Check: Umbral Pulse damages boss on Summit, or servants & Frost Urns in Chambers
      if (state === GAME_STATES.BOSS_COMBAT) {
        const boss = this.world.queryFirst(
          'bossPhase',
          'transform',
          'hurtbox',
          'health',
        );
        if (boss && !boss.bossPhase.isStaggered) {
          const dist = Math.hypot(
            transform.position.x - boss.transform.position.x,
            transform.position.z - boss.transform.position.z,
          );
          if (dist <= PLAYER_CONFIG.umbralPulseRadius + boss.hurtbox.radius) {
            this.damageBoss(BOSS_CONFIG.pulseDamage, null);
          }
        }
      } else if (state === GAME_STATES.CHAMBER_COMBAT) {
        this.applyUmbralPulseToChamberTargets(
          transform.position.x,
          transform.position.z,
        );
      }
    }
  }

  private resolveProjectileCollisions(dt: number, state: GameState): void {
    const projectiles = this.world.query('projectile', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform', 'health');
    const boss = this.world.queryFirst(
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

        // Hit Boss cylindrical hurtbox (Summit BOSS_COMBAT only)
        if (
          state === GAME_STATES.BOSS_COMBAT &&
          boss &&
          !boss.bossPhase.isStaggered &&
          !projectile.hitEntityIds.includes(boss.id)
        ) {
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
            this.damageBoss(projectile.damage, this.vBurstPos);
            if (projectile.pierceRemaining > 0) {
              projectile.pierceRemaining--;
            } else {
              hit = true;
            }
          }
        }

        // Hit Chamber Servants & Destructible Frost Urns (CHAMBER_COMBAT)
        if (!hit && state === GAME_STATES.CHAMBER_COMBAT) {
          hit = this.resolvePlayerProjectileVsChamber(entity, toDestroy);
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
    const player = this.world.queryFirst('playerTag', 'transform', 'health');
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
            this.audio.playIceShatter(0.92);
            this.callbacks.addCameraShake(BOSS_CONFIG.phase3.pillarCameraShake);
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

        const isWardenShielded =
          s.servantAI.archetype === SERVANT_ARCHETYPES.FROSTBITE_WARDEN &&
          s.servantAI.guardBrokenTimer <= 0;

        if (isWardenShielded) {
          const distXZ = Math.hypot(dx, dz) || 1;
          const toBoltX = dx / distXZ;
          const toBoltZ = dz / distXZ;
          const fwdX = Math.sin(s.transform.rotationY);
          const fwdZ = Math.cos(s.transform.rotationY);
          const frontDot = toBoltX * fwdX + toBoltZ * fwdZ;

          if (frontDot > CHAMBER_CONFIG.wardenShieldDotThreshold) {
            if (projectile.kind === 'USURPED_BEAM') {
              // Piercing NG+ Glacial Spear-Beam shatters Warden's hexagonal tower-shield
              this.audio.playGuardBreak();
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 18, 8.0);
              this.callbacks.onServantGuardBreak?.(s.id);
              this.damageServant(s, projectile.damage, this.vBurstPos);
            } else {
              // Standard Void Bolt deflected with metallic ice-steel clang (0 damage)
              this.audio.playShieldClang();
              this.vfx.spawnFrostShatterBurst(this.vBurstPos, 8, 5.8);
              return true;
            }
          } else {
            // Flanked from behind/side via Shadow Blink
            this.damageServant(s, projectile.damage, this.vBurstPos);
          }
        } else {
          const mult =
            s.servantAI.guardBrokenTimer > 0
              ? SERVANT_CONFIG.FROSTBITE_WARDEN.guardBrokenDamageMultiplier
              : 1.0;
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
          s.servantAI.archetype === SERVANT_ARCHETYPES.FROSTBITE_WARDEN &&
          s.servantAI.guardBrokenTimer <= 0
        ) {
          this.audio.playGuardBreak();
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

  private shatterFrostUrn(
    urn: {
      id: EntityId;
      destructibleProp: { hp: number; healValue: number };
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
    this.audio.playUrnShatter();
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

  private damageBoss(amount: number, hitPoint: THREE.Vector3 | null): void {
    const boss = this.world.queryFirst('bossPhase', 'health', 'transform');
    if (!boss || boss.bossPhase.isStaggered) return;

    const staggerFloor = Math.floor(
      boss.health.max * BOSS_CONFIG.staggerThreshold,
    );
    boss.health.current = Math.max(staggerFloor, boss.health.current - amount);
    this.bossRig.triggerHitFlash();

    const burstPos = hitPoint
      ? hitPoint.clone()
      : new THREE.Vector3(
          boss.transform.position.x,
          1.3 + boss.bossPhase.ascendHeight,
          boss.transform.position.z,
        );
    this.vfx.spawnFrostShatterBurst(burstPos, 10, 6.2);
    this.audio.playIceShatter(0.5);
    this.callbacks.onBossDamaged();
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
