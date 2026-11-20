import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_CONFIG,
  BOSS_PHASES,
  FINISHER_CONFIG,
  GAME_STATES,
  PLAYER_CONFIG,
  type GameState,
} from '../../config/gameConfig';
import type { IArenaGeometry } from '../../engine/SceneManager';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { ECSWorld, ISystem } from '../World';

export interface IMovementCallbacks {
  getGameState: () => GameState;
  getCameraForwardXZ: (outVec: THREE.Vector3) => THREE.Vector3;
  addCameraShake: (amount: number) => void;
  exitPointerLock: () => void;
  onStaggerProximityChange: (inRange: boolean) => void;
  onFinisherApproachComplete: () => void;
}

interface FinisherApproachState {
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  elapsed: number;
  duration: number;
  afterimageTimer: number;
}

/**
 * Integrates Player, Boss, Clone, and Projectile velocities, Shadow Blink i-frames,
 * perimeter pillar & arena boundary clamping, and the Stagger approach blink (SRP).
 */
export class MovementSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly arena: IArenaGeometry;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly mageRig: DarkMageRig;
  private readonly callbacks: IMovementCallbacks;

  private finisherApproach: FinisherApproachState | null = null;
  private releasedLockForStagger = false;

  // Reusable scratch vectors (zero per-frame GC churn)
  private readonly vForward = new THREE.Vector3();
  private readonly vRight = new THREE.Vector3();
  private readonly vMove = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);

  public get isFinisherApproaching(): boolean {
    return this.finisherApproach !== null;
  }

  constructor(
    world: ECSWorld,
    arena: IArenaGeometry,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    mageRig: DarkMageRig,
    callbacks: IMovementCallbacks,
  ) {
    this.world = world;
    this.arena = arena;
    this.audio = audio;
    this.vfx = vfx;
    this.mageRig = mageRig;
    this.callbacks = callbacks;
  }

  public resetTransientState(): void {
    this.finisherApproach = null;
    this.releasedLockForStagger = false;
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();

    if (
      state === GAME_STATES.BOSS_COMBAT ||
      state === GAME_STATES.CHAMBER_COMBAT
    ) {
      this.updatePlayerMovement(dt);
      this.updateBossMovement(dt, state);
    } else if (state === GAME_STATES.STAGGER) {
      if (this.finisherApproach) {
        this.updateFinisherApproach(dt);
      } else {
        this.updatePlayerMovement(dt);
        this.updateStaggerProximity();
      }
      this.updateBossMovement(dt, state);
    }

    this.updateProjectilesMovement(dt);
    this.updateClonesMovement(dt, elapsed);
  }

  private computeInputMoveDirection(
    forwardInput: number,
    rightInput: number,
    outVec: THREE.Vector3,
  ): THREE.Vector3 {
    outVec.set(0, 0, 0);
    if (forwardInput === 0 && rightInput === 0) return outVec;

    this.callbacks.getCameraForwardXZ(this.vForward);
    this.vRight.crossVectors(this.vForward, this.upAxis).normalize();

    outVec.addScaledVector(this.vForward, forwardInput);
    outVec.addScaledVector(this.vRight, rightInput);
    if (outVec.lengthSq() > 0.0001) {
      outVec.normalize();
    }
    return outVec;
  }

  private updatePlayerMovement(dt: number): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'velocity',
      'health',
      'stamina',
      'playerIntent',
      'playerCombat',
    );
    if (!player) return;

    const { transform, velocity, health, stamina, playerIntent, playerCombat } =
      player;

    // Tick timers & stamina regeneration
    playerCombat.dashCooldown = Math.max(0, playerCombat.dashCooldown - dt);
    playerCombat.boltCooldown = Math.max(0, playerCombat.boltCooldown - dt);
    playerCombat.pulseCooldown = Math.max(0, playerCombat.pulseCooldown - dt);
    playerCombat.aimFaceTimer = Math.max(0, playerCombat.aimFaceTimer - dt);
    health.invulnTimer = Math.max(0, health.invulnTimer - dt);

    if (playerCombat.dashTimer <= 0) {
      stamina.current = Math.min(
        stamina.max,
        stamina.current + stamina.regenRate * dt,
      );
    }

    // Attempt Shadow Blink Dash
    if (
      playerIntent.blinkRequested &&
      playerCombat.dashCooldown <= 0 &&
      playerCombat.dashTimer <= 0 &&
      stamina.current >= PLAYER_CONFIG.dashStaminaCost
    ) {
      stamina.current -= PLAYER_CONFIG.dashStaminaCost;
      playerCombat.dashTimer = PLAYER_CONFIG.dashDuration;
      playerCombat.dashCooldown = PLAYER_CONFIG.dashCooldown;
      playerCombat.afterimageTimer = 0;
      health.invulnTimer = Math.max(
        health.invulnTimer,
        PLAYER_CONFIG.dashInvulnDuration,
      );

      this.computeInputMoveDirection(
        playerIntent.moveForward,
        playerIntent.moveRight,
        this.vMove,
      );
      if (this.vMove.lengthSq() > 0.01) {
        playerCombat.dashDirX = this.vMove.x;
        playerCombat.dashDirZ = this.vMove.z;
      } else {
        this.callbacks.getCameraForwardXZ(this.vForward);
        playerCombat.dashDirX = this.vForward.x;
        playerCombat.dashDirZ = this.vForward.z;
      }

      transform.rotationY = Math.atan2(
        playerCombat.dashDirX,
        playerCombat.dashDirZ,
      );
      this.mageRig.triggerInvulnFlash(PLAYER_CONFIG.dashInvulnDuration);
      this.vfx.spawnAfterimage(this.mageRig);
      this.audio.playShadowBlink();
      this.callbacks.addCameraShake(PLAYER_CONFIG.dashCameraShake);
    }

    const isDashing = playerCombat.dashTimer > 0;
    health.isInvulnerable = isDashing || health.invulnTimer > 0;

    if (isDashing) {
      playerCombat.dashTimer = Math.max(0, playerCombat.dashTimer - dt);
      velocity.vx = playerCombat.dashDirX * PLAYER_CONFIG.dashSpeed;
      velocity.vz = playerCombat.dashDirZ * PLAYER_CONFIG.dashSpeed;

      playerCombat.afterimageTimer -= dt;
      if (playerCombat.afterimageTimer <= 0) {
        playerCombat.afterimageTimer = PLAYER_CONFIG.afterimageInterval;
        this.vfx.spawnAfterimage(this.mageRig);
      }
    } else {
      this.computeInputMoveDirection(
        playerIntent.moveForward,
        playerIntent.moveRight,
        this.vMove,
      );
      const targetVx = this.vMove.x * PLAYER_CONFIG.moveSpeed;
      const targetVz = this.vMove.z * PLAYER_CONFIG.moveSpeed;
      const accel = Math.min(1, dt * PLAYER_CONFIG.accelLerp);
      velocity.vx += (targetVx - velocity.vx) * accel;
      velocity.vz += (targetVz - velocity.vz) * accel;

      if (this.vMove.lengthSq() > 0.01 && playerCombat.aimFaceTimer <= 0) {
        const targetYaw = Math.atan2(this.vMove.x, this.vMove.z);
        let diff = targetYaw - transform.rotationY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        transform.rotationY +=
          diff * Math.min(1, dt * PLAYER_CONFIG.turnSpeed);
      }
    }

    // Integrate horizontal displacement
    const pos = transform.position;
    pos.x += velocity.vx * dt;
    pos.z += velocity.vz * dt;

    // Resolve collisions against Perimeter Pillars
    const pillars = this.arena.pillarColliders;
    for (let i = 0; i < pillars.length; i++) {
      const pil = pillars[i];
      if (!pil) continue;
      const dx = pos.x - pil.x;
      const dz = pos.z - pil.z;
      const minR = pil.radius + PLAYER_CONFIG.radius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minR * minR && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        pos.x = pil.x + (dx / dist) * minR;
        pos.z = pil.z + (dz / dist) * minR;
      }
    }

    // Soft body separation from Boss
    const boss = this.world.queryFirst('bossPhase', 'transform', 'hurtbox');
    if (boss) {
      const bx = boss.transform.position.x;
      const bz = boss.transform.position.z;
      const dx = pos.x - bx;
      const dz = pos.z - bz;
      const minSep =
        PLAYER_CONFIG.radius +
        boss.hurtbox.radius * BOSS_CONFIG.bodySeparationFactor;
      const distSq = dx * dx + dz * dz;
      if (distSq < minSep * minSep && distSq > 0.00001) {
        const dist = Math.sqrt(distSq);
        pos.x = bx + (dx / dist) * minSep;
        pos.z = bz + (dz / dist) * minSep;
      }
    }

    // Clamp strictly within 15.5m arena radius
    const radial = Math.hypot(pos.x, pos.z);
    if (radial > ARENA_CONFIG.playerClampRadius) {
      pos.x = (pos.x / radial) * ARENA_CONFIG.playerClampRadius;
      pos.z = (pos.z / radial) * ARENA_CONFIG.playerClampRadius;
    }
  }

  private updateStaggerProximity(): void {
    const player = this.world.queryFirst(
      'playerTag',
      'transform',
      'playerIntent',
    );
    const boss = this.world.queryFirst(
      'bossPhase',
      'siphonableBoss',
      'transform',
    );
    if (!player || !boss) return;

    const pPos = player.transform.position;
    const bPos = boss.transform.position;
    const dist = Math.hypot(pPos.x - bPos.x, pPos.z - bPos.z);
    const inRange = dist <= boss.siphonableBoss.finisherRange;

    this.callbacks.onStaggerProximityChange(inRange);

    if (inRange && !this.releasedLockForStagger) {
      this.releasedLockForStagger = true;
      this.callbacks.exitPointerLock();
    }

    if (inRange && player.playerIntent.finisherExecuteRequested) {
      const dirX = dist > 0.05 ? (pPos.x - bPos.x) / dist : 0;
      const dirZ = dist > 0.05 ? (pPos.z - bPos.z) / dist : 1;
      const destX = bPos.x + dirX * FINISHER_CONFIG.approachArrivalDistance;
      const destZ = bPos.z + dirZ * FINISHER_CONFIG.approachArrivalDistance;

      this.callbacks.onStaggerProximityChange(false);
      this.mageRig.triggerInvulnFlash(FINISHER_CONFIG.approachInvulnDuration);
      this.vfx.spawnAfterimage(this.mageRig);

      this.finisherApproach = {
        startX: pPos.x,
        startZ: pPos.z,
        endX: destX,
        endZ: destZ,
        elapsed: 0,
        duration: FINISHER_CONFIG.approachDashDuration,
        afterimageTimer: 0.05,
      };
    }
  }

  private updateFinisherApproach(dt: number): void {
    const fd = this.finisherApproach;
    const player = this.world.queryFirst('playerTag', 'transform');
    const boss = this.world.queryFirst('bossPhase', 'transform');
    if (!fd || !player || !boss) {
      this.finisherApproach = null;
      return;
    }

    fd.elapsed += dt;
    const t = Math.min(1, fd.elapsed / fd.duration);
    const ease = 1 - Math.pow(1 - t, 3);

    player.transform.position.x = THREE.MathUtils.lerp(
      fd.startX,
      fd.endX,
      ease,
    );
    player.transform.position.z = THREE.MathUtils.lerp(
      fd.startZ,
      fd.endZ,
      ease,
    );
    player.transform.rotationY = Math.atan2(
      boss.transform.position.x - player.transform.position.x,
      boss.transform.position.z - player.transform.position.z,
    );

    fd.afterimageTimer -= dt;
    if (fd.afterimageTimer <= 0) {
      fd.afterimageTimer = FINISHER_CONFIG.approachAfterimageInterval;
      this.vfx.spawnAfterimage(this.mageRig);
    }

    if (t >= 1) {
      this.finisherApproach = null;
      // Orient Mage and Boss facing each other intimately
      player.transform.rotationY = Math.atan2(
        boss.transform.position.x - player.transform.position.x,
        boss.transform.position.z - player.transform.position.z,
      );
      boss.transform.rotationY = Math.atan2(
        player.transform.position.x - boss.transform.position.x,
        player.transform.position.z - boss.transform.position.z,
      );
      this.callbacks.onFinisherApproachComplete();
    }
  }

  private updateBossMovement(dt: number, state: GameState): void {
    const boss = this.world.queryFirst('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');
    if (!boss || !player) return;

    const { bossPhase, transform } = boss;
    const bossPos = transform.position;
    const playerPos = player.transform.position;

    // Smoothly face Dark Mage unless locked in Twin Glacial Laser sweep
    const lockRotation = bossPhase.activePatternId === 'TWIN_GLACIAL_LASER';
    if (!lockRotation) {
      const dx = playerPos.x - bossPos.x;
      const dz = playerPos.z - bossPos.z;
      if (dx * dx + dz * dz > 0.04) {
        const targetYaw = Math.atan2(dx, dz);
        let diff = targetYaw - transform.rotationY;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turnSpeed = bossPhase.isStaggered
          ? BOSS_CONFIG.turnSpeedStagger
          : BOSS_CONFIG.turnSpeedCombat;
        transform.rotationY += diff * Math.min(1, dt * turnSpeed);
      }
    }

    if (state === GAME_STATES.STAGGER) {
      const lerpFactor = Math.min(1, dt * BOSS_CONFIG.staggerCenterLerp);
      bossPos.x += (0 - bossPos.x) * lerpFactor;
      bossPos.z += (0 - bossPos.z) * lerpFactor;
      return;
    }

    if (state !== GAME_STATES.BOSS_COMBAT || bossPhase.isStaggered) return;

    // Sideways dash burst impulse (Phase 2 Frost Clone Illusions)
    if (bossPhase.dashTimer > 0) {
      bossPhase.dashTimer = Math.max(0, bossPhase.dashTimer - dt);
      bossPos.x += bossPhase.dashVelX * dt;
      bossPos.z += bossPhase.dashVelZ * dt;
      const radial = Math.hypot(bossPos.x, bossPos.z);
      if (radial > BOSS_CONFIG.innerTerraceLimit) {
        bossPos.x = (bossPos.x / radial) * BOSS_CONFIG.innerTerraceLimit;
        bossPos.z = (bossPos.z / radial) * BOSS_CONFIG.innerTerraceLimit;
      }
      return;
    }

    // Hold steady gracefully during Twin Glacial Laser or Snowflake Curtain
    if (
      bossPhase.activePatternId === 'TWIN_GLACIAL_LASER' ||
      bossPhase.activePatternId === 'SNOWFLAKE_CURTAIN'
    ) {
      return;
    }

    bossPhase.orbitSwitchTimer -= dt;
    if (bossPhase.orbitSwitchTimer <= 0) {
      const base =
        bossPhase.phase >= BOSS_PHASES.PHASE_2
          ? BOSS_CONFIG.phase2.orbitSwitchBase
          : BOSS_CONFIG.phase1.orbitSwitchBase;
      bossPhase.orbitSwitchTimer =
        base + Math.random() * BOSS_CONFIG.phase1.orbitSwitchJitter;
      bossPhase.orbitDir = bossPhase.orbitDir === 1 ? -1 : 1;
    }

    const speedMult =
      bossPhase.phase === BOSS_PHASES.PHASE_3
        ? BOSS_CONFIG.phase3.moveSpeedMultiplier
        : bossPhase.phase === BOSS_PHASES.PHASE_2
          ? BOSS_CONFIG.phase2.moveSpeedMultiplier
          : 1.0;
    const effectiveSpeed = BOSS_CONFIG.moveSpeed * speedMult;

    const angularRate =
      (effectiveSpeed / BOSS_CONFIG.orbitRadius) *
      BOSS_CONFIG.orbitAngularFactor;
    bossPhase.orbitAngle += bossPhase.orbitDir * angularRate * dt;

    const desiredX = Math.sin(bossPhase.orbitAngle) * BOSS_CONFIG.orbitRadius;
    const desiredZ = Math.cos(bossPhase.orbitAngle) * BOSS_CONFIG.orbitRadius;

    const toBossX = bossPos.x - playerPos.x;
    const toBossZ = bossPos.z - playerPos.z;
    const distToPlayer = Math.hypot(toBossX, toBossZ) || 1;
    let pushX = 0;
    let pushZ = 0;
    if (distToPlayer < BOSS_CONFIG.personalSpaceRadius) {
      pushX = (toBossX / distToPlayer) * BOSS_CONFIG.personalSpacePush;
      pushZ = (toBossZ / distToPlayer) * BOSS_CONFIG.personalSpacePush;
    }

    const stepX = desiredX + pushX - bossPos.x;
    const stepZ = desiredZ + pushZ - bossPos.z;
    const stepLen = Math.hypot(stepX, stepZ);
    if (stepLen > 0.05) {
      const moveDist = Math.min(stepLen, effectiveSpeed * dt);
      bossPos.x += (stepX / stepLen) * moveDist;
      bossPos.z += (stepZ / stepLen) * moveDist;
    }

    const radial = Math.hypot(bossPos.x, bossPos.z);
    if (radial > BOSS_CONFIG.innerTerraceLimit) {
      bossPos.x = (bossPos.x / radial) * BOSS_CONFIG.innerTerraceLimit;
      bossPos.z = (bossPos.z / radial) * BOSS_CONFIG.innerTerraceLimit;
    }
  }

  private updateProjectilesMovement(dt: number): void {
    const projectiles = this.world.query('projectile', 'transform', 'velocity');
    const player = this.world.queryFirst('playerTag', 'transform');
    const boss = this.world.queryFirst('bossPhase');
    const bossPhaseLevel = boss ? boss.bossPhase.phase : BOSS_PHASES.PHASE_1;

    for (let i = 0; i < projectiles.length; i++) {
      const entity = projectiles[i];
      if (!entity) continue;
      const { projectile, transform, velocity } = entity;

      if (projectile.state === 'HOVER') {
        projectile.fireDelay -= dt;

        const owner =
          projectile.ownerEntityId !== null
            ? this.world.getEntity(projectile.ownerEntityId)
            : undefined;
        if (owner && owner.transform) {
          const oPos = owner.transform.position;
          const oYaw = owner.transform.rotationY;
          const rightX = Math.cos(oYaw);
          const rightZ = -Math.sin(oYaw);
          const backX = -Math.sin(oYaw);
          const backZ = -Math.cos(oYaw);

          const spreadX =
            Math.sin(projectile.fanAngle) *
            BOSS_CONFIG.phase1.lanceSpreadRadius;
          const spreadY =
            projectile.baseHeight +
            Math.cos(projectile.fanAngle) *
              BOSS_CONFIG.phase1.lanceArcHeightBoost;

          transform.position.x =
            oPos.x +
            rightX * spreadX +
            backX * BOSS_CONFIG.phase1.lanceBackOffset;
          transform.position.y = spreadY;
          transform.position.z =
            oPos.z +
            rightZ * spreadX +
            backZ * BOSS_CONFIG.phase1.lanceBackOffset;
        }

        if (projectile.fireDelay <= 0) {
          projectile.state = 'FLY';
          const speed =
            bossPhaseLevel >= BOSS_PHASES.PHASE_2
              ? BOSS_CONFIG.phase1.lanceSpeedP2Plus
              : BOSS_CONFIG.phase1.lanceSpeedP1;
          const tx = player ? player.transform.position.x : 0;
          const ty = 1.15;
          const tz = player ? player.transform.position.z : 0;
          const dx = tx - transform.position.x;
          const dy = ty - transform.position.y;
          const dz = tz - transform.position.z;
          const len = Math.hypot(dx, dy, dz) || 1;
          velocity.vx = (dx / len) * speed;
          velocity.vy = (dy / len) * speed;
          velocity.vz = (dz / len) * speed;
          velocity.maxSpeed = speed;
        }
      } else {
        projectile.life -= dt;
        transform.position.x += velocity.vx * dt;
        transform.position.y += velocity.vy * dt;
        transform.position.z += velocity.vz * dt;
      }
    }
  }

  private updateClonesMovement(_dt: number, elapsed: number): void {
    const clones = this.world.query('cloneIllusion', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');
    if (!player) return;

    const pPos = player.transform.position;
    for (let i = 0; i < clones.length; i++) {
      const cl = clones[i];
      if (!cl) continue;
      cl.transform.position.y =
        Math.sin(elapsed * 3.4 + cl.cloneIllusion.side) * 0.08;
      const dx = pPos.x - cl.transform.position.x;
      const dz = pPos.z - cl.transform.position.z;
      if (dx * dx + dz * dz > 0.04) {
        cl.transform.rotationY = Math.atan2(dx, dz);
      }
    }
  }
}
