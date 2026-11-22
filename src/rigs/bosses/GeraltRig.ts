import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_PHASES,
  GAME_STATES,
  PALETTE,
  SPECIAL_SCENARIO_CONFIG,
  type BossExpression,
  type BossPhase,
  type DrainThrottleMode,
  type FinisherPoseId,
  type GameState,
} from '../../config/gameConfig';
import { ToonAssets } from '../../engine/ToonAssets';
import {
  applyMaterialBleach,
  BossBase,
  restoreDrainableMaterials,
  type FinisherHeadChoreography,
  type MaterialBleachMetadata,
} from './BossBase';

/**
 * Cel-shaded procedural humanoid rig for **Geralt of Rivia — The White Wolf**
 * (non-siphonable Special Scenario boss in *The Wolf & The Raven*).
 *
 * Implements the full `BossRigAdapter` contract (LSP) so dynamic N-Boss systems
 * manage him identically while enforcing asymmetric siphon gating (`canBeSiphoned: false`):
 * reaching 0 HP triggers a lethal stagger-collapse & 1.6s ash/ember dissolution.
 */
export class GeraltRig extends BossBase {
  public readonly id = SPECIAL_SCENARIO_CONFIG.geraltId;
  public readonly displayName = SPECIAL_SCENARIO_CONFIG.geraltDisplayName;
  public readonly title = SPECIAL_SCENARIO_CONFIG.geraltTitle;
  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly headAccessory = new THREE.Object3D();
  public readonly drainableMaterials: THREE.MeshToonMaterial[] = [];
  public readonly originalColors: THREE.Color[] = [];

  private readonly bleachMetadata: MaterialBleachMetadata[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly leftShoulderPivot = new THREE.Group();
  private readonly leftElbowPivot = new THREE.Group();
  private readonly leftHandAnchor = new THREE.Object3D();
  private readonly rightShoulderPivot = new THREE.Group();
  private readonly rightElbowPivot = new THREE.Group();
  private readonly rightHandAnchor = new THREE.Object3D();
  private readonly leftLegPivot = new THREE.Group();
  private readonly leftKneePivot = new THREE.Group();
  private readonly rightLegPivot = new THREE.Group();
  private readonly rightKneePivot = new THREE.Group();
  private readonly swordGroup = new THREE.Group();
  private readonly auraRing: THREE.Mesh;

  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private ascendHeight = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'GeraltRig';
    this.root.userData.managedByRig = true;

    const armorMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.geraltArmor, {
        emissive: PALETTE.shadowSlate,
        emissiveIntensity: 0.14,
      }),
    );
    const leatherMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.geraltLeather),
    );
    const steelMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.geraltSteel, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.2,
      }),
    );
    const skinMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.marinaSkin),
    );
    const hairMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.geraltHairSilver, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.12,
      }),
    );
    const eyeMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.geraltAmberEye }),
    );
    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.riftAmber,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bodyPivot.position.set(0, 0.96, 0);
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.torsoGroup);

    // Pelvis & Cuirass Torso
    const pelvisMesh = this.outlined(
      new THREE.CylinderGeometry(0.18, 0.16, 0.24, 10),
      leatherMat,
    );
    pelvisMesh.position.y = 0.04;
    this.torsoGroup.add(pelvisMesh);

    const chestMesh = this.outlined(
      new THREE.CylinderGeometry(0.24, 0.18, 0.54, 12),
      armorMat,
    );
    chestMesh.position.y = 0.42;
    this.torsoGroup.add(chestMesh);

    // Crossed Leather Baldric & Wolf Medallion
    const baldric = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.46, 0.07, 0.28)),
      leatherMat,
    );
    baldric.position.set(0, 0.44, 0.02);
    baldric.rotation.z = 0.52;
    this.torsoGroup.add(baldric);

    const medallion = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.052, 0)),
      steelMat,
    );
    medallion.position.set(0, 0.56, 0.22);
    this.torsoGroup.add(medallion);

    // Twin Crossed Back Scabbards & Hilts
    const scabbardGeo = this.trackGeo(new THREE.BoxGeometry(0.055, 1.18, 0.032));
    const hiltGeo = this.trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6));
    const guardGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.028, 0.03));

    const scabbardOffsets = [
      { x: -0.06, zRot: -0.22 },
      { x: 0.06, zRot: -0.34 },
    ];
    for (let i = 0; i < scabbardOffsets.length; i++) {
      const cfg = scabbardOffsets[i]!;
      const sg = new THREE.Group();
      sg.position.set(cfg.x, 0.42, -0.2);
      sg.rotation.z = cfg.zRot;
      sg.add(new THREE.Mesh(scabbardGeo, leatherMat));
      const hilt = new THREE.Mesh(hiltGeo, steelMat);
      hilt.position.y = 0.72;
      const guard = new THREE.Mesh(guardGeo, steelMat);
      guard.position.y = 0.6;
      sg.add(hilt, guard);
      this.torsoGroup.add(sg);
    }

    // Head, Silver Swept Hair, Ponytail & Glowing Amber Cat-Slit Eyes
    this.headGroup.position.set(0, 0.74, 0);
    this.torsoGroup.add(this.headGroup);

    const neck = this.outlined(
      new THREE.CylinderGeometry(0.068, 0.078, 0.12, 8),
      skinMat,
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    const head = this.outlined(new THREE.SphereGeometry(0.145, 14, 12), skinMat);
    head.position.y = 0.18;
    head.scale.set(0.95, 1.06, 0.98);
    this.headGroup.add(head);

    this.headAnchor.position.set(0, 0.14, 0.14);
    this.headGroup.add(this.headAnchor);
    this.headAccessory.position.set(0, 0.31, 0.02);
    this.headGroup.add(this.headAccessory);

    // Glowing Amber Witcher Eyes
    const eyeGeo = this.trackGeo(new THREE.BoxGeometry(0.032, 0.014, 0.012));
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.048, 0.19, 0.138);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.048, 0.19, 0.138);
    this.headGroup.add(leftEye, rightEye);

    // Silver Hair Crown + Side Locks + Back Ponytail
    const hairCrown = this.outlined(
      new THREE.SphereGeometry(0.158, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
      hairMat,
    );
    hairCrown.position.set(0, 0.205, -0.015);
    this.headGroup.add(hairCrown);

    const ponytail = this.outlined(
      new THREE.ConeGeometry(0.075, 0.34, 8),
      hairMat,
    );
    ponytail.position.set(0, 0.14, -0.18);
    ponytail.rotation.x = Math.PI * 0.82;
    this.headGroup.add(ponytail);

    // Arms & Pauldrons + Drawn Silver Sword in Right Hand
    this.buildArm(-1, armorMat, leatherMat, steelMat, skinMat);
    this.buildArm(1, armorMat, leatherMat, steelMat, skinMat);

    const bladeGeo = this.trackGeo(new THREE.BoxGeometry(0.042, 1.12, 0.016));
    const bladeMesh = this.outlined(bladeGeo, steelMat);
    bladeMesh.position.y = 0.62;
    const crossguard = this.outlined(
      new THREE.BoxGeometry(0.24, 0.032, 0.04),
      steelMat,
    );
    crossguard.position.y = 0.06;
    const grip = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6)),
      leatherMat,
    );
    grip.position.y = -0.06;
    this.swordGroup.add(bladeMesh, crossguard, grip);
    this.swordGroup.position.set(0, -0.34, 0.04);
    this.swordGroup.rotation.set(Math.PI * 0.42, 0, 0);
    this.rightElbowPivot.add(this.swordGroup);

    // Armored Legs & Boots
    this.buildLeg(-1, leatherMat, armorMat);
    this.buildLeg(1, leatherMat, armorMat);

    // Subtle Ground Igni/Steel Aura Ring
    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.68, 0.82, 32)),
      auraMat,
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.04;
    this.root.add(this.auraRing);

    scene.add(this.root);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.ownedGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.ownedMaterials.push(mat);
    return mat;
  }

  private trackDrainable(mat: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
    this.ownedMaterials.push(mat);
    this.drainableMaterials.push(mat);
    this.originalColors.push(mat.color.clone());
    this.bleachMetadata.push({
      originalEmissive: mat.emissive.clone(),
      originalEmissiveIntensity: mat.emissiveIntensity,
    });
    return mat;
  }

  private outlined(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
  ): THREE.Group {
    this.trackGeo(geo);
    return ToonAssets.createOutlinedMesh(
      geo,
      mat,
      ARENA_CONFIG.defaultOutlineScale,
      true,
    ).group;
  }

  private buildArm(
    side: -1 | 1,
    armorMat: THREE.MeshToonMaterial,
    leatherMat: THREE.MeshToonMaterial,
    steelMat: THREE.MeshToonMaterial,
    skinMat: THREE.MeshToonMaterial,
  ): void {
    const shoulder = side < 0 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side < 0 ? this.leftElbowPivot : this.rightElbowPivot;
    const hand = side < 0 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.29, 0.62, 0);
    this.torsoGroup.add(shoulder);

    const pauldron = this.outlined(
      new THREE.SphereGeometry(0.105, 10, 8),
      steelMat,
    );
    shoulder.add(pauldron);

    const upperArm = this.outlined(
      new THREE.CylinderGeometry(0.062, 0.054, 0.34, 8),
      armorMat,
    );
    upperArm.position.y = -0.17;
    shoulder.add(upperArm);

    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);

    const forearm = this.outlined(
      new THREE.CylinderGeometry(0.052, 0.044, 0.32, 8),
      leatherMat,
    );
    forearm.position.y = -0.16;
    elbow.add(forearm);

    const glove = this.outlined(
      new THREE.SphereGeometry(0.046, 8, 8),
      skinMat,
    );
    glove.position.y = -0.33;
    elbow.add(glove);

    hand.position.set(0, -0.34, 0);
    elbow.add(hand);
  }

  private buildLeg(
    side: -1 | 1,
    leatherMat: THREE.MeshToonMaterial,
    armorMat: THREE.MeshToonMaterial,
  ): void {
    const legPivot = side < 0 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side < 0 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.12, -0.04, 0);
    this.bodyPivot.add(legPivot);

    const thigh = this.outlined(
      new THREE.CylinderGeometry(0.082, 0.068, 0.44, 8),
      armorMat,
    );
    thigh.position.y = -0.22;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.44, 0);
    legPivot.add(kneePivot);

    const boot = this.outlined(
      new THREE.CylinderGeometry(0.065, 0.056, 0.46, 8),
      leatherMat,
    );
    boot.position.y = -0.23;
    kneePivot.add(boot);
  }

  public setExpression(_expression: BossExpression, _spiralPhase = 0): void {
    // Non-siphonable Witcher uses sharp amber eyes without siphon expression swaps
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.auraRing.scale.setScalar(phase >= BOSS_PHASES.PHASE_2 ? 1.24 : 1.0);
  }

  public setAscendHeight(extraY: number): void {
    this.ascendHeight = extraY;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.14;
  }

  public triggerCastFlourish(): void {
    this.castFlourishTimer = 0.45;
  }

  public triggerAccessoryFlick(): void {
    // No-op on non-siphonable boss
  }

  public getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.leftHandAnchor.getWorldPosition(outVec);
  }

  public getRightHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.rightHandAnchor.getWorldPosition(outVec);
  }

  public updateCombatPose(
    dt: number,
    _state: GameState,
    elapsed: number,
    _staggerProgressOverride?: number | null,
  ): void {
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.castFlourishTimer = Math.max(0, this.castFlourishTimer - dt);

    const breathe = Math.sin(elapsed * 2.8) * 0.018;
    const flourish = this.castFlourishTimer > 0 ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI) : 0;

    this.bodyPivot.position.set(0, 0.96 + breathe + this.ascendHeight, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(0.1 + flourish * 0.18, -0.18 + flourish * 0.35, 0);
    this.headGroup.rotation.set(-0.04, 0.16, 0);

    // Wide Witcher sword-fighting stance
    this.leftLegPivot.rotation.set(-0.24, 0, -0.09);
    this.rightLegPivot.rotation.set(0.24, 0, 0.09);
    this.leftKneePivot.rotation.x = 0.34;
    this.rightKneePivot.rotation.x = 0.24;

    // Left hand poised for Witcher Signs (Igni / Aard); right arm guards with silver blade
    this.leftShoulderPivot.rotation.set(-0.62 - flourish * 0.72, 0.18, 0.26);
    this.leftElbowPivot.rotation.set(-0.76 + flourish * 0.42, 0, 0);
    this.rightShoulderPivot.rotation.set(-0.54 - flourish * 0.55, -0.24, -0.28);
    this.rightElbowPivot.rotation.set(-0.82 + flourish * 0.3, 0, 0);

    this.auraRing.rotation.z = elapsed * 0.85;

    // Subtle hit flash tint
    if (this.hitFlashTimer > 0) {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        if (m) m.emissiveIntensity = 1.4;
      }
    } else {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        const meta = this.bleachMetadata[i];
        if (m && meta) m.emissiveIntensity = meta.originalEmissiveIntensity;
      }
    }
  }

  public override applyAshDissolve(progress: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const slump = p * p * (3 - 2 * p);
    // Lethal stagger-collapse onto one knee as glowing embers & ash consume the Witcher
    this.bodyPivot.position.set(0, THREE.MathUtils.lerp(0.96, 0.46, slump), 0);
    this.torsoGroup.rotation.set(THREE.MathUtils.lerp(0.1, 0.54, slump), 0, 0);
    this.headGroup.rotation.set(THREE.MathUtils.lerp(-0.04, 0.42, slump), 0, 0);
    this.leftLegPivot.rotation.set(-0.88 * slump, 0, -0.1);
    this.leftKneePivot.rotation.x = 1.48 * slump;
    this.rightLegPivot.rotation.set(0.32 * slump, 0, 0.1);
    this.rightKneePivot.rotation.x = 1.32 * slump;
    this.leftShoulderPivot.rotation.set(0.16 * slump, 0, 0.42 * slump);
    this.rightShoulderPivot.rotation.set(0.22 * slump, 0, -0.42 * slump);
    this.auraRing.visible = false;
    super.applyAshDissolve(p);
  }

  public applyFinisherPose(
    _poseId: FinisherPoseId,
    _drainProgress: number,
    _time: number,
    _dt?: number,
    _throttleMode?: DrainThrottleMode,
    _isTauntStunned?: boolean,
    _headChoreography?: FinisherHeadChoreography,
  ): void {
    // Non-siphonable boss never enters SIPHON_FINISHER
  }

  public applyBeamFinisherPose(_drainProgress: number, _time: number): void {
    // Non-siphonable boss never enters SIPHON_FINISHER
  }

  public applyStolenKissPose(
    _beat: 1 | 2 | 3,
    _beatProgress: number,
    _time: number,
  ): void {
    // Non-siphonable boss never enters STOLEN_KISS
  }

  public applyVictoryCollapsePose(_time: number): void {
    this.applyAshDissolve(1.0);
  }

  public applyVictoryDioramaPose(time: number): void {
    this.applyVictoryCollapsePose(time);
  }

  public applyPuppetMasterPose(time: number): void {
    this.updateCombatPose(0.016, GAME_STATES.DEFEAT_DIORAMA, time, null);
  }

  public applyDrainBleach(drainProgress: number): void {
    applyMaterialBleach(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
      drainProgress,
    );
  }

  public resetForEncounter(_encoreTier: number): void {
    this.resetAshDissolve();
    this.resetBlindspotState();
    this.hitFlashTimer = 0;
    this.castFlourishTimer = 0;
    this.ascendHeight = 0;
    this.auraRing.visible = true;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
  }

  public dispose(): void {
    this.disposeBlindspotGlint();
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i]?.dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]?.dispose();
    }
  }
}
