import * as THREE from 'three';
import {
  AUDIO_MODES,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  CAMERA_CONFIG,
  DIORAMA_CONFIG,
  FINISHER_CONFIG,
  GAME_STATES,
  MIKU_CONFIG,
  PALETTE,
  SERENA_CONFIG,
  SIPHON_GALLERY_CONFIG,
  type GameState,
} from '../../config/gameConfig';
import type { IAudioTrigger } from '../../engine/SoundEngine';
import type { IVfxSpawner } from '../../engine/VfxFactory';
import type { DarkMageRig } from '../../rigs/DarkMageRig';
import type { BossRigAdapter } from '../../rigs/bosses/BossBase';
import { useGameStore } from '../../state/useGameStore';
import type { ECSWorld, ISystem } from '../World';

export interface IDioramaCallbacks {
  getGameState: () => GameState;
  setGameState: (state: GameState) => void;
  exitPointerLock: () => void;
  addCameraShake: (amount: number) => void;
  resetSphericalOrbit: (
    azimuth: number,
    elevation: number,
    distance: number,
  ) => void;
  clearAllCombatEntities: () => void;
  setAtmosphereStagger: () => void;
  setAtmosphereCombatP1: () => void;
}

interface MarionetteThread {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: Float32Array;
}

/**
 * Governs Building Block 5 Diorama flows (SRP & DIP):
 * - Victory Floor Collapse (VICTORY_DIORAMA) with bleached materials, spinning @_@ eyes & vapor wisps
 * - Endless Savor (ENDLESS_SAVOR) isolation toggle ("Pull Her Up & Keep Kissing" / "Stop & Lay Her Back Down")
 * - Defeat "Forced Frost Puppet" Diorama (DEFEAT_DIORAMA) with 4 live shimmering ice-blue marionette lines
 */
export class DioramaSystem implements ISystem {
  private readonly world: ECSWorld;
  private readonly scene: THREE.Scene;
  private readonly mageRig: DarkMageRig;
  private bossRig: BossRigAdapter;
  private readonly audio: IAudioTrigger;
  private readonly vfx: IVfxSpawner;
  private readonly callbacks: IDioramaCallbacks;

  private vaporAccum = 0;
  private spiralRefreshAccum = 0;
  private spiralPhase = 0;

  // Marionette String & Siren Bubble-Cage Visuals (shown for DEFEAT_DIORAMA, hidden otherwise)
  private readonly marionetteGroup = new THREE.Group();
  private readonly marionetteThreads: MarionetteThread[] = [];
  private dimmedStaffGroup: THREE.Group | null = null;
  private abyssalBubbleMesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | null = null;
  private readonly encoreThrallRingsGroup = new THREE.Group();
  private readonly encoreThrallRings: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>[] = [];

  // Reusable scratch vectors (zero per-frame allocations)
  private readonly scratchBossL = new THREE.Vector3();
  private readonly scratchBossR = new THREE.Vector3();
  private readonly scratchMageL = new THREE.Vector3();
  private readonly scratchMageR = new THREE.Vector3();
  private readonly scratchMageHead = new THREE.Vector3();
  private readonly scratchVaporPos = new THREE.Vector3();
  private readonly scratchOrbitFocus = new THREE.Vector3();

  constructor(
    world: ECSWorld,
    scene: THREE.Scene,
    mageRig: DarkMageRig,
    bossRig: BossRigAdapter,
    audio: IAudioTrigger,
    vfx: IVfxSpawner,
    callbacks: IDioramaCallbacks,
  ) {
    this.world = world;
    this.scene = scene;
    this.mageRig = mageRig;
    this.bossRig = bossRig;
    this.audio = audio;
    this.vfx = vfx;
    this.callbacks = callbacks;

    this.buildMarionetteVisuals();
  }

  public setBossRig(rig: BossRigAdapter): void {
    this.bossRig = rig;
  }

  private buildMarionetteVisuals(): void {
    this.marionetteGroup.visible = false;
    this.scene.add(this.marionetteGroup);

    const threadCount = DIORAMA_CONFIG.puppetMarionetteThreadCount;
    for (let i = 0; i < threadCount; i++) {
      const positions = new Float32Array(6); // 2 vertices x 3 coords
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: i % 2 === 0 ? PALETTE.frostRunes : PALETTE.iceHighlights,
        transparent: true,
        opacity: DIORAMA_CONFIG.puppetThreadOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const line = new THREE.Line(geo, mat);
      line.frustumCulled = false;
      this.marionetteGroup.add(line);
      this.marionetteThreads.push({ line, positions });
    }

    // Dimmed Obsidian Staff lying flat on the ice beside the defeated Dark Mage
    const staffProp = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.019, 2.05, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.obsidianTrim }),
    );
    shaft.rotation.z = Math.PI / 2;
    staffProp.add(shaft);

    const dimCrystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.095, 0),
      new THREE.MeshBasicMaterial({
        color: PALETTE.drainedAshSilver,
        transparent: true,
        opacity: 0.65,
      }),
    );
    dimCrystal.position.set(1.12, 0.04, 0);
    staffProp.add(dimCrystal);

    staffProp.position.set(0.62, 0.05, 0.42);
    staffProp.rotation.y = 0.42;
    this.dimmedStaffGroup = staffProp;
    this.marionetteGroup.add(staffProp);

    // Translucent bioluminescent Abyssal Bubble Cage enclosing the kneeling Dark Mage in Realm II Defeat
    const bubbleGeo = new THREE.SphereGeometry(
      SERENA_CONFIG.defeatBubbleRadius,
      24,
      20,
    );
    const bubbleMat = new THREE.MeshBasicMaterial({
      color: PALETTE.serenaBubbleGlow,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bubbleMesh = new THREE.Mesh(bubbleGeo, bubbleMat);
    bubbleMesh.visible = false;
    this.abyssalBubbleMesh = bubbleMesh;
    this.marionetteGroup.add(bubbleMesh);

    // Glowing Magenta Frequency Rings binding the kneeling Dark Mage in Realm III Defeat ("Captive Encore Thrall")
    this.encoreThrallRingsGroup.visible = false;
    for (let i = 0; i < MIKU_CONFIG.defeatRingCount; i++) {
      const r = MIKU_CONFIG.defeatRingBaseRadius - i * 0.08;
      const ringGeo = new THREE.TorusGeometry(r, 0.028, 8, 36);
      const ringMat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? PALETTE.harmonicMagenta : PALETTE.harmonicEmerald,
        transparent: true,
        opacity: 0.86,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.position.y = 0.28 + i * 0.34;
      this.encoreThrallRingsGroup.add(ringMesh);
      this.encoreThrallRings.push(ringMesh);
    }
    this.marionetteGroup.add(this.encoreThrallRingsGroup);
  }

  /**
   * 100% Siphon Climax -> Radial frost-amethyst shockwave, floor collapse, VICTORY audio,
   * and low floor-level 360° orbit camera focus.
   */
  public enterVictoryDiorama(withClimaxShockwave: boolean): void {
    this.cleanupPuppetVisuals();
    this.callbacks.setGameState(GAME_STATES.VICTORY_DIORAMA);
    this.callbacks.exitPointerLock();

    const boss = this.world.queryFirst('bossPhase', 'siphonableBoss', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');

    if (boss) {
      boss.siphonableBoss.siphonProgress =
        FINISHER_CONFIG.endlessSavorLockedProgress;
      boss.siphonableBoss.isEndlessSavor = false;
      boss.bossPhase.expression = BOSS_EXPRESSIONS.DRAINED_FAINT;

      if (withClimaxShockwave) {
        const bx = boss.transform.position.x;
        const bz = boss.transform.position.z;
        const origin = new THREE.Vector3(bx, 0.2, bz);
        const wave = this.vfx.createPhaseShockwaveGroup(
          origin,
          BOSS_PHASES.PHASE_3,
        );
        this.world.createEntity({
          transform: {
            position: { x: bx, y: 0.2, z: bz },
            rotationY: 0,
            scale: 1,
          },
          hazardZone: {
            kind: 'PHASE_SHOCKWAVE',
            faction: 'PLAYER',
            damage: 0,
            elapsed: 0,
            telegraphDuration: 0,
            activeDuration: DIORAMA_CONFIG.victoryShockwaveDuration,
            currentRadius: 0.8,
            maxRadius: DIORAMA_CONFIG.victoryShockwaveRadius,
            hitThickness: 0,
            angle: 0,
            startAngle: 0,
            endAngle: 0,
            beamLength: 0,
            hitCooldown: 0,
            hasHitPlayer: true,
            hasTriggered: true,
          },
          meshRef: { object3D: wave },
        });

        this.vfx.spawnFrostShatterBurst(new THREE.Vector3(bx, 1.0, bz), 28, 9.5);
        this.vfx.spawnImpactBurst(new THREE.Vector3(bx, 1.0, bz), 22);
        this.callbacks.addCameraShake(DIORAMA_CONFIG.victoryShockwaveShake);
        this.audio.playVictoryClimax();
      }

      if (player) {
        // Position victorious Dark Mage standing beside collapsed Marina
        player.transform.position.x =
          boss.transform.position.x + DIORAMA_CONFIG.collapseMageOffsetX;
        player.transform.position.y = 0;
        player.transform.position.z =
          boss.transform.position.z + DIORAMA_CONFIG.collapseMageOffsetZ;
        player.transform.rotationY = Math.atan2(
          boss.transform.position.x - player.transform.position.x,
          boss.transform.position.z - player.transform.position.z,
        );
      }
    }

    this.audio.stopSiphonLoop();
    this.mageRig.setStaffPlanted(false);
    this.bossRig.applyDrainBleach(1.0);
    this.bossRig.setExpression(BOSS_EXPRESSIONS.DRAINED_FAINT, this.spiralPhase);
    this.audio.setMode(AUDIO_MODES.VICTORY);
    this.callbacks.setAtmosphereStagger();

    const store = useGameStore.getState();
    if (store.activeRealm === 3) {
      store.setMikuDefeated(true);
      store.setMikuCoreCharge(MIKU_CONFIG.defaultCoreCharge);
    } else if (store.activeRealm === 2) {
      store.setSerenaDefeated(true);
      store.setSerenaCoreCharge(SERENA_CONFIG.defaultCoreCharge);
    } else {
      store.setMarinaDefeated(true);
      store.setMarinaCoreCharge(SIPHON_GALLERY_CONFIG.bossDefeatRechargeBonus);
    }
    store.exitEndlessSavor();
    store.setAudioMode(AUDIO_MODES.VICTORY);

    this.callbacks.resetSphericalOrbit(
      0.55,
      DIORAMA_CONFIG.collapseCameraElevation,
      DIORAMA_CONFIG.collapseCameraDistance,
    );
  }

  /**
   * [PULL HER UP & KEEP KISSING] -> Endless Savor mode with siphonProgress locked at 1.0
   * and drainableMaterials bleached to #94A3B8 indefinitely.
   */
  public enterEndlessSavor(): void {
    this.cleanupPuppetVisuals();
    this.callbacks.setGameState(GAME_STATES.ENDLESS_SAVOR);
    this.callbacks.exitPointerLock();

    const boss = this.world.queryFirst('bossPhase', 'siphonableBoss');
    if (boss) {
      boss.siphonableBoss.siphonProgress =
        FINISHER_CONFIG.endlessSavorLockedProgress;
      boss.siphonableBoss.isEndlessSavor = true;
      boss.siphonableBoss.tauntDizzyTimer = 0;
      boss.bossPhase.expression = BOSS_EXPRESSIONS.SIPHON_KISS;
    }

    this.bossRig.applyDrainBleach(1.0);
    this.bossRig.setExpression(BOSS_EXPRESSIONS.SIPHON_KISS);
    this.audio.setMode(AUDIO_MODES.SIPHON);

    const store = useGameStore.getState();
    store.enterEndlessSavor();
    store.setAudioMode(AUDIO_MODES.SIPHON);

    this.callbacks.resetSphericalOrbit(
      0.55,
      CAMERA_CONFIG.finisherDefaultElevation,
      CAMERA_CONFIG.finisherDefaultDistance,
    );
  }

  /**
   * [STOP & LAY HER BACK DOWN] -> Returns bleached Marina to VICTORY_DIORAMA floor collapse.
   */
  public exitEndlessSavor(): void {
    this.enterVictoryDiorama(false);
  }

  /**
   * Forced Frost Puppet Defeat (DEFEAT_DIORAMA when playerHP <= 0):
   * Clears all combat hazards, exits PointerLock, activates DEFEAT music-box loop,
   * seats blushing Dark Mage holding frost crystals wired to Marina's raised fingertips.
   */
  public enterDefeatDiorama(): void {
    this.audio.stopSiphonLoop();
    this.mageRig.setStaffPlanted(false);
    this.callbacks.clearAllCombatEntities();
    this.callbacks.setGameState(GAME_STATES.DEFEAT_DIORAMA);
    this.callbacks.exitPointerLock();

    const boss = this.world.queryFirst('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');

    // Stage diorama neatly at arena center for unobstructed 360° inspection
    const halfDist = DIORAMA_CONFIG.puppetSeatDistance * 0.5;
    if (boss) {
      boss.transform.position.x = 0;
      boss.transform.position.y = 0;
      boss.transform.position.z = -halfDist;
      boss.transform.rotationY = 0;
      boss.bossPhase.expression = BOSS_EXPRESSIONS.COMBAT;
      this.bossRig.root.position.set(0, 0, -halfDist);
      this.bossRig.root.rotation.y = 0;
    }

    if (player) {
      player.transform.position.x = 0;
      player.transform.position.y = 0;
      player.transform.position.z = halfDist;
      player.transform.rotationY = Math.PI;
      this.mageRig.root.position.set(0, 0, halfDist);
      this.mageRig.root.rotation.y = Math.PI;
    }

    if (this.dimmedStaffGroup) {
      this.dimmedStaffGroup.position.set(0.68, 0.05, halfDist + 0.18);
    }

    const activeRealm = useGameStore.getState().activeRealm;
    const isRealm2 = activeRealm === 2;
    const isRealm3 = activeRealm === 3;
    if (this.abyssalBubbleMesh) {
      this.abyssalBubbleMesh.visible = isRealm2;
      this.abyssalBubbleMesh.position.set(0, 0.78, halfDist);
    }
    this.encoreThrallRingsGroup.visible = isRealm3;
    this.encoreThrallRingsGroup.position.set(0, 0, halfDist);
    for (let i = 0; i < this.marionetteThreads.length; i++) {
      const t = this.marionetteThreads[i];
      if (!t) continue;
      t.line.material.color.setHex(
        isRealm3
          ? i % 2 === 0
            ? PALETTE.harmonicMagenta
            : PALETTE.harmonicEmerald
          : isRealm2
            ? i % 2 === 0
              ? PALETTE.biolumCyan
              : PALETTE.serenaHairTips
            : i % 2 === 0
              ? PALETTE.frostRunes
              : PALETTE.iceHighlights,
      );
    }

    this.marionetteGroup.visible = true;
    this.bossRig.setExpression(BOSS_EXPRESSIONS.COMBAT);
    this.callbacks.setAtmosphereCombatP1();
    this.audio.setMode(AUDIO_MODES.DEFEAT);

    const store = useGameStore.getState();
    store.setGameState(GAME_STATES.DEFEAT_DIORAMA);
    store.setAudioMode(AUDIO_MODES.DEFEAT);

    this.callbacks.resetSphericalOrbit(
      0.72,
      DIORAMA_CONFIG.puppetCameraElevation,
      DIORAMA_CONFIG.puppetCameraDistance,
    );
  }

  public cleanupPuppetVisuals(): void {
    this.marionetteGroup.visible = false;
    this.mageRig.resetCombatPose();
  }

  /**
   * Computes the smooth 360° orbit camera focus target for VICTORY_DIORAMA or DEFEAT_DIORAMA.
   */
  public getOrbitFocusTarget(state: GameState, outVec: THREE.Vector3): THREE.Vector3 {
    const boss = this.world.queryFirst('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');

    if (state === GAME_STATES.VICTORY_DIORAMA && boss) {
      return outVec.set(
        boss.transform.position.x,
        DIORAMA_CONFIG.collapseCameraFocusY,
        boss.transform.position.z,
      );
    }

    if (state === GAME_STATES.DEFEAT_DIORAMA && boss && player) {
      return outVec.set(
        (boss.transform.position.x + player.transform.position.x) * 0.5,
        DIORAMA_CONFIG.puppetCameraFocusY,
        (boss.transform.position.z + player.transform.position.z) * 0.5,
      );
    }

    this.bossRig.root.updateMatrixWorld(true);
    this.bossRig.headAnchor.getWorldPosition(this.scratchOrbitFocus);
    return outVec.copy(this.scratchOrbitFocus);
  }

  public update(dt: number, elapsed: number): void {
    const state = this.callbacks.getGameState();

    if (state === GAME_STATES.VICTORY_DIORAMA) {
      this.updateVictoryDiorama(dt, elapsed);
    } else if (state === GAME_STATES.DEFEAT_DIORAMA) {
      this.updateDefeatDiorama(elapsed);
    }
  }

  private updateVictoryDiorama(dt: number, elapsed: number): void {
    const boss = this.world.queryFirst('bossPhase', 'transform');
    const player = this.world.queryFirst('playerTag', 'transform');
    if (!boss || !player) return;

    this.bossRig.root.position.set(
      boss.transform.position.x,
      0,
      boss.transform.position.z,
    );
    this.bossRig.root.rotation.y = boss.transform.rotationY;
    this.bossRig.applyVictoryCollapsePose(elapsed);

    this.mageRig.root.position.set(
      player.transform.position.x,
      0,
      player.transform.position.z,
    );
    this.mageRig.root.rotation.y = player.transform.rotationY;
    this.mageRig.applyVictoryStandPose(elapsed);

    // Smooth spinning @_@ dizzy eyes
    this.spiralPhase += dt * DIORAMA_CONFIG.collapseSpiralSpeed;
    this.spiralRefreshAccum += dt;
    if (this.spiralRefreshAccum >= DIORAMA_CONFIG.collapseSpiralRefreshInterval) {
      this.spiralRefreshAccum = 0;
      this.bossRig.setExpression(BOSS_EXPRESSIONS.DRAINED_FAINT, this.spiralPhase);
    }

    // Subtle rising vapor wisps above Marina's exhausted head
    this.vaporAccum += dt;
    if (this.vaporAccum >= DIORAMA_CONFIG.vaporSpawnInterval) {
      this.vaporAccum = 0;
      this.bossRig.root.updateMatrixWorld(true);
      this.bossRig.headAnchor.getWorldPosition(this.scratchVaporPos);
      this.vfx.spawnVaporWisp(this.scratchVaporPos);
    }
  }

  private updateDefeatDiorama(elapsed: number): void {
    this.bossRig.applyPuppetMasterPose(elapsed);
    this.mageRig.applyDefeatedPuppetPose(elapsed);

    // Update 4 shimmering translucent ice-blue marionette lines from Marina's fingertips
    // to the seated Dark Mage's left wrist, right wrist, and slumped head
    this.bossRig.getLeftHandWorldPosition(this.scratchBossL);
    this.bossRig.getRightHandWorldPosition(this.scratchBossR);
    this.mageRig.getLeftHandWorldPosition(this.scratchMageL);
    this.mageRig.getRightHandWorldPosition(this.scratchMageR);
    this.mageRig.getHeadTopWorldPosition(this.scratchMageHead);

    const endpoints: readonly [THREE.Vector3, THREE.Vector3][] = [
      [this.scratchBossL, this.scratchMageR],
      [this.scratchBossR, this.scratchMageL],
      [this.scratchBossL, this.scratchMageHead],
      [this.scratchBossR, this.scratchMageHead],
    ];

    for (let i = 0; i < this.marionetteThreads.length; i++) {
      const thread = this.marionetteThreads[i];
      const pair = endpoints[i];
      if (!thread || !pair) continue;

      const [from, to] = pair;
      thread.positions[0] = from.x;
      thread.positions[1] = from.y;
      thread.positions[2] = from.z;
      thread.positions[3] = to.x;
      thread.positions[4] = to.y;
      thread.positions[5] = to.z;

      const posAttr = thread.line.geometry.getAttribute(
        'position',
      ) as THREE.BufferAttribute;
      posAttr.needsUpdate = true;

      thread.line.material.opacity =
        DIORAMA_CONFIG.puppetThreadOpacity *
        (0.75 + 0.25 * Math.sin(elapsed * 4.5 + i * 1.1));
    }

    if (this.abyssalBubbleMesh && this.abyssalBubbleMesh.visible) {
      const pulse = 1.0 + Math.sin(elapsed * 2.6) * 0.035;
      this.abyssalBubbleMesh.scale.setScalar(pulse);
      this.abyssalBubbleMesh.rotation.y = elapsed * 0.35;
      this.abyssalBubbleMesh.material.opacity =
        0.2 + 0.07 * Math.sin(elapsed * 3.4);
    }

    if (this.encoreThrallRingsGroup.visible) {
      for (let i = 0; i < this.encoreThrallRings.length; i++) {
        const ring = this.encoreThrallRings[i];
        if (!ring) continue;
        const dir = i % 2 === 0 ? 1 : -1;
        ring.rotation.z = elapsed * (1.15 + i * 0.45) * dir;
        ring.rotation.y = Math.sin(elapsed * 1.8 + i) * 0.14;
        const pulse = 1.0 + Math.sin(elapsed * 4.2 + i * 1.1) * 0.045;
        ring.scale.setScalar(pulse);
      }
    }
  }

  public dispose(): void {
    this.scene.remove(this.marionetteGroup);
    for (let i = 0; i < this.marionetteThreads.length; i++) {
      const t = this.marionetteThreads[i];
      if (!t) continue;
      t.line.geometry.dispose();
      t.line.material.dispose();
    }
    if (this.abyssalBubbleMesh) {
      this.abyssalBubbleMesh.geometry.dispose();
      this.abyssalBubbleMesh.material.dispose();
    }
    for (let i = 0; i < this.encoreThrallRings.length; i++) {
      const ring = this.encoreThrallRings[i];
      if (!ring) continue;
      ring.geometry.dispose();
      ring.material.dispose();
    }
  }
}
