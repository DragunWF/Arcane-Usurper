import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  FINISHER_RESISTANCE_CONFIG,
  GAME_STATES,
  PALETTE,
  SIPHON_GALLERY_CONFIG,
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

interface HairStrand {
  readonly root: THREE.Group;
  readonly mid: THREE.Group;
  readonly phase: number;
  readonly spread: number;
}

/**
 * Cel-shaded procedural humanoid rig for **Yennefer of Vengerberg — Sorceress of Obsidian & Lilac**
 * (siphonable Guest Sovereign in *The Wolf & The Raven* & Siphon Gallery Guest Pedestal 1).
 *
 * Honors the complete `BossRigAdapter` contract (LSP) with a `512x512` `CanvasTexture` anime face
 * (vivid violet eyes across COMBAT / STAGGER / SIPHON_KISS / DRAINED_FAINT), obsidian star choker
 * (`headAccessory`), full `[1]` & `[2]` finisher poses with resistance-to-limp physics,
 * `[R]` Umbral Beam shield-to-slump pose, 360° Frontal Stolen Kiss, Victory Floor Collapse,
 * Defeat Puppet pose, and Captive Guest Pedestal dais idle pose.
 */
export class YenneferRig extends BossBase {
  public readonly id = SPECIAL_SCENARIO_CONFIG.yenneferId;
  public readonly displayName = SPECIAL_SCENARIO_CONFIG.yenneferDisplayName;
  public readonly title = SPECIAL_SCENARIO_CONFIG.yenneferTitle;
  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly headAccessory = new THREE.Object3D();
  public override readonly waistWrapRadius = FINISHER_CONFIG.mikuWaistWrapRadius;
  public readonly drainableMaterials: THREE.MeshToonMaterial[] = [];
  public readonly originalColors: THREE.Color[] = [];

  private readonly bleachMetadata: MaterialBleachMetadata[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];

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
  private readonly hairStrands: HairStrand[] = [];
  private readonly auraRing: THREE.Mesh;
  private readonly starChokerMesh: THREE.Mesh;

  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D | null;
  private readonly faceTexture: THREE.CanvasTexture;
  private currentExpression: BossExpression = BOSS_EXPRESSIONS.COMBAT;
  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private accessoryFlickTimer = 0;
  private ascendHeight = 0;
  private captiveFaceTimer = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'YenneferRig';
    this.root.userData.managedByRig = true;

    // 512x512 Procedural Anime Face CanvasTexture (vivid violet eyes & raven brows)
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = 512;
    this.faceCanvas.height = 512;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.ownedTextures.push(this.faceTexture);
    this.drawFace(BOSS_EXPRESSIONS.COMBAT, 0);

    const velvetMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.yenneferVelvet, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.16,
      }),
    );
    const laceMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.yenneferLace, {
        emissive: PALETTE.yenneferLilac,
        emissiveIntensity: 0.12,
      }),
    );
    const ravenHairMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.yenneferRaven, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.14,
      }),
    );
    const lilacTrimMat = this.trackDrainable(
      ToonAssets.createToonMaterial(PALETTE.yenneferLilac, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.42,
      }),
    );
    const skinMat = this.trackMat(
      ToonAssets.createToonMaterial(PALETTE.marinaSkin),
    );
    const faceMat = this.trackMat(
      new THREE.MeshBasicMaterial({ map: this.faceTexture }),
    );
    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bodyPivot.position.set(0, 0.9, 0);
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.torsoGroup);

    // Attach front-facing pooled chest telegraph onto upper torso
    this.attachBlindspotGlint(this.torsoGroup);

    // Slender Sorceress Corset, Feathered Mantle & Flowing Black-and-White Skirt
    const waistMesh = this.outlined(
      new THREE.CylinderGeometry(0.14, 0.17, 0.24, 12),
      velvetMat,
    );
    waistMesh.position.y = 0.06;
    this.torsoGroup.add(waistMesh);

    const bodice = this.outlined(
      new THREE.CylinderGeometry(0.19, 0.14, 0.44, 12),
      velvetMat,
    );
    bodice.position.y = 0.36;
    this.torsoGroup.add(bodice);

    // White Lace Bust Trim & Feathered Raven Collar
    const laceCollar = this.outlined(
      new THREE.TorusGeometry(0.175, 0.032, 8, 18),
      laceMat,
    );
    laceCollar.rotation.x = Math.PI / 2;
    laceCollar.position.y = 0.56;
    this.torsoGroup.add(laceCollar);

    const skirt = this.outlined(
      new THREE.CylinderGeometry(0.18, 0.44, 0.86, 16, 1, true),
      velvetMat,
    );
    skirt.position.y = -0.34;
    this.torsoGroup.add(skirt);

    const skirtTrim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.43, 0.022, 6, 24)),
      lilacTrimMat,
    );
    skirtTrim.rotation.x = Math.PI / 2;
    skirtTrim.position.y = -0.76;
    this.torsoGroup.add(skirtTrim);

    // Head, 512x512 Anime Face, Obsidian Star Choker & Cascading Raven Waves
    this.headGroup.position.set(0, 0.64, 0);
    this.torsoGroup.add(this.headGroup);

    const neck = this.outlined(
      new THREE.CylinderGeometry(0.052, 0.06, 0.11, 8),
      skinMat,
    );
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    // Obsidian Star Choker (`headAccessory` for [F] Taunt Flick)
    this.headAccessory.position.set(0, 0.055, 0.058);
    this.headGroup.add(this.headAccessory);
    const chokerBand = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.058, 0.01, 6, 16)),
      velvetMat,
    );
    chokerBand.rotation.x = Math.PI / 2;
    chokerBand.position.set(0, 0, -0.058);
    this.starChokerMesh = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.032, 0)),
      lilacTrimMat,
    );
    this.headAccessory.add(chokerBand, this.starChokerMesh);

    const headSphere = this.outlined(
      new THREE.SphereGeometry(0.138, 16, 14),
      skinMat,
    );
    headSphere.position.y = 0.18;
    headSphere.scale.set(0.94, 1.03, 0.96);
    this.headGroup.add(headSphere);

    // Curved Front Anime Face Plate
    const facePlateGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.141,
        16,
        14,
        -Math.PI * 0.36,
        Math.PI * 0.72,
        Math.PI * 0.24,
        Math.PI * 0.56,
      ),
    );
    const facePlate = new THREE.Mesh(facePlateGeo, faceMat);
    facePlate.position.y = 0.18;
    facePlate.rotation.y = Math.PI * 0.5;
    facePlate.scale.set(0.94, 1.03, 0.96);
    this.headGroup.add(facePlate);

    // Exact Lip Contact Anchor
    this.headAnchor.position.set(0, 0.125, 0.136);
    this.headGroup.add(this.headAnchor);

    // Raven-Black Hair Crown & Cascading Wavy Ribbons
    const hairCrown = this.outlined(
      new THREE.SphereGeometry(0.152, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.65),
      ravenHairMat,
    );
    hairCrown.position.set(0, 0.2, -0.015);
    this.headGroup.add(hairCrown);

    const strandGeo1 = this.trackGeo(new THREE.CylinderGeometry(0.052, 0.042, 0.38, 8));
    const strandGeo2 = this.trackGeo(new THREE.ConeGeometry(0.044, 0.36, 8));
    const strandSpecs = [
      { x: -0.11, z: -0.04, spread: -0.32, phase: 0.0 },
      { x: -0.06, z: -0.11, spread: -0.14, phase: 1.1 },
      { x: 0.0, z: -0.13, spread: 0.0, phase: 2.2 },
      { x: 0.06, z: -0.11, spread: 0.14, phase: 3.3 },
      { x: 0.11, z: -0.04, spread: 0.32, phase: 4.4 },
    ];
    for (let i = 0; i < strandSpecs.length; i++) {
      const sp = strandSpecs[i]!;
      const rootSeg = new THREE.Group();
      rootSeg.position.set(sp.x, 0.18, sp.z);
      const upper = this.outlined(strandGeo1, ravenHairMat);
      upper.position.y = -0.18;
      rootSeg.add(upper);

      const midSeg = new THREE.Group();
      midSeg.position.set(0, -0.36, 0);
      const lower = this.outlined(strandGeo2, ravenHairMat);
      lower.position.y = -0.18;
      lower.rotation.x = Math.PI;
      midSeg.add(lower);
      rootSeg.add(midSeg);

      this.headGroup.add(rootSeg);
      this.hairStrands.push({
        root: rootSeg,
        mid: midSeg,
        phase: sp.phase,
        spread: sp.spread,
      });
    }

    // Slender Arms with Lace Cuffs
    this.buildArm(-1, velvetMat, laceMat, skinMat);
    this.buildArm(1, velvetMat, laceMat, skinMat);

    // Slender Legs & High Velvet Boots
    this.buildLeg(-1, velvetMat);
    this.buildLeg(1, velvetMat);

    // Lilac-Violet Chaos Aura Ring
    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.72, 0.88, 36)),
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
    velvetMat: THREE.MeshToonMaterial,
    laceMat: THREE.MeshToonMaterial,
    skinMat: THREE.MeshToonMaterial,
  ): void {
    const shoulder = side < 0 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side < 0 ? this.leftElbowPivot : this.rightElbowPivot;
    const hand = side < 0 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.22, 0.54, 0);
    this.torsoGroup.add(shoulder);

    const upper = this.outlined(
      new THREE.CylinderGeometry(0.046, 0.04, 0.3, 8),
      velvetMat,
    );
    upper.position.y = -0.15;
    shoulder.add(upper);

    elbow.position.set(0, -0.3, 0);
    shoulder.add(elbow);

    const forearm = this.outlined(
      new THREE.CylinderGeometry(0.038, 0.034, 0.28, 8),
      velvetMat,
    );
    forearm.position.y = -0.14;
    elbow.add(forearm);

    const cuff = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.04, 0.012, 6, 12)),
      laceMat,
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.26;
    elbow.add(cuff);

    const palm = this.outlined(
      new THREE.SphereGeometry(0.036, 8, 8),
      skinMat,
    );
    palm.position.y = -0.3;
    elbow.add(palm);

    hand.position.set(0, -0.31, 0);
    elbow.add(hand);
  }

  private buildLeg(side: -1 | 1, velvetMat: THREE.MeshToonMaterial): void {
    const legPivot = side < 0 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side < 0 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.1, -0.04, 0);
    this.bodyPivot.add(legPivot);

    const thigh = this.outlined(
      new THREE.CylinderGeometry(0.068, 0.056, 0.42, 8),
      velvetMat,
    );
    thigh.position.y = -0.21;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.42, 0);
    legPivot.add(kneePivot);

    const boot = this.outlined(
      new THREE.CylinderGeometry(0.052, 0.042, 0.44, 8),
      velvetMat,
    );
    boot.position.y = -0.22;
    kneePivot.add(boot);
  }

  private drawFace(expression: BossExpression, spiralPhase: number): void {
    const ctx = this.faceCtx;
    if (!ctx) return;

    ctx.fillStyle = PALETTE.hex.marinaSkin;
    ctx.fillRect(0, 0, 512, 512);

    // Subtle Sorceress Blush
    const blushAlpha =
      expression === BOSS_EXPRESSIONS.SIPHON_KISS ||
      expression === BOSS_EXPRESSIONS.DRAINED_FAINT
        ? 0.34
        : expression === BOSS_EXPRESSIONS.STAGGER
          ? 0.24
          : 0.1;
    ctx.fillStyle = `rgba(244, 63, 94, ${blushAlpha})`;
    ctx.beginPath();
    ctx.ellipse(152, 294, 42, 22, 0, 0, Math.PI * 2);
    ctx.ellipse(360, 294, 42, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    const eyeXs = [174, 338];
    const eyeY = 236;

    if (expression === BOSS_EXPRESSIONS.DRAINED_FAINT) {
      // Spinning @_@ dizzy violet spirals
      ctx.strokeStyle = PALETTE.hex.yenneferVioletEye;
      ctx.lineWidth = 6;
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        ctx.beginPath();
        for (let a = 0; a < 18; a++) {
          const theta = a * 0.55 + spiralPhase;
          const r = 4 + a * 1.9;
          const px = cx + Math.cos(theta) * r;
          const py = eyeY + Math.sin(theta) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      // Tightly shut ecstatic lashes during Siphon Kiss
      ctx.strokeStyle = PALETTE.hex.yenneferRaven;
      ctx.lineWidth = 9;
      ctx.lineCap = 'round';
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        ctx.beginPath();
        ctx.moveTo(cx - 42, eyeY - 4);
        ctx.quadraticCurveTo(cx, eyeY + 24, cx + 42, eyeY - 4);
        ctx.stroke();
      }
    } else {
      // Vivid Violet Anime Eyes
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 44, 34, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.yenneferVioletEye;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 2, 28, 30, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.yenneferLilac;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 12, 18, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.yenneferRaven;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 2, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 10, eyeY - 10, 7, 0, Math.PI * 2);
        ctx.arc(cx + 11, eyeY + 10, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Sharp winged raven eyeliner
        ctx.strokeStyle = PALETTE.hex.yenneferRaven;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 48, eyeY - 8);
        ctx.quadraticCurveTo(cx, eyeY - 42, cx + 48, eyeY - 8);
        ctx.stroke();
      }
    }

    // Raven Brows
    ctx.strokeStyle = PALETTE.hex.yenneferRaven;
    ctx.lineWidth = 7;
    const browTilt = expression === BOSS_EXPRESSIONS.COMBAT ? 12 : -10;
    ctx.beginPath();
    ctx.moveTo(132, 178 - browTilt * 0.5);
    ctx.lineTo(212, 178 + browTilt * 0.5);
    ctx.moveTo(380, 178 - browTilt * 0.5);
    ctx.lineTo(300, 178 + browTilt * 0.5);
    ctx.stroke();

    // Lips
    ctx.fillStyle = PALETTE.hex.deepLipBerry;
    ctx.beginPath();
    if (
      expression === BOSS_EXPRESSIONS.STAGGER ||
      expression === BOSS_EXPRESSIONS.DRAINED_FAINT
    ) {
      ctx.ellipse(256, 346, 18, 12, 0, 0, Math.PI * 2);
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      ctx.ellipse(256, 346, 14, 9, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(256, 344, 22, 6, 0, 0, Math.PI * 2);
    }
    ctx.fill();

    this.faceTexture.needsUpdate = true;
  }

  public setExpression(expression: BossExpression, spiralPhase = 0): void {
    this.currentExpression = expression;
    this.drawFace(expression, spiralPhase);
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.auraRing.scale.setScalar(
      phase === BOSS_PHASES.PHASE_3
        ? 1.45
        : phase === BOSS_PHASES.PHASE_2
          ? 1.2
          : 1.0,
    );
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
    this.accessoryFlickTimer = 0.65;
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
    state: GameState,
    elapsed: number,
    staggerProgressOverride?: number | null,
  ): void {
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.castFlourishTimer = Math.max(0, this.castFlourishTimer - dt);

    const s =
      staggerProgressOverride !== null && staggerProgressOverride !== undefined
        ? staggerProgressOverride
        : state === GAME_STATES.STAGGER
          ? 1.0
          : 0.0;

    const hover = Math.sin(elapsed * 2.5) * 0.055 * (1 - s);
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI)
        : 0;

    this.bodyPivot.position.set(
      0,
      THREE.MathUtils.lerp(0.96 + hover + this.ascendHeight, 0.48, s),
      0,
    );
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(0.04, 0.24, s),
      0,
      0,
    );
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(0.02, 0.28, s),
      0,
      0,
    );

    this.leftLegPivot.rotation.set(THREE.MathUtils.lerp(0.08, -0.78, s), 0, -0.06);
    this.rightLegPivot.rotation.set(THREE.MathUtils.lerp(-0.08, -0.78, s), 0, 0.06);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(0.18, 1.56, s);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(0.24, 1.56, s);

    const castArmX = -0.42 - flourish * 0.88;
    const castArmZ = 0.28 + flourish * 0.34;
    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(castArmX, 0.14, s),
      0,
      THREE.MathUtils.lerp(castArmZ, 0.18, s),
    );
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(castArmX, 0.14, s),
      0,
      THREE.MathUtils.lerp(-castArmZ, -0.18, s),
    );
    this.leftElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.48, -0.4, s), 0, 0);
    this.rightElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.48, -0.4, s), 0, 0);

    // Exhausted shoulder heave while 360° frontal guard-break window is open
    this.applyExhaustedExposureHeave(
      this.torsoGroup,
      this.headGroup,
      this.leftShoulderPivot,
      this.rightShoulderPivot,
      this.leftElbowPivot,
      this.rightElbowPivot,
      elapsed,
      s,
    );

    // Wavy Raven Hair Sway
    for (let i = 0; i < this.hairStrands.length; i++) {
      const hs = this.hairStrands[i]!;
      const wave = Math.sin(elapsed * 2.6 + hs.phase) * 0.09 * (1 - s * 0.65);
      hs.root.rotation.x = 0.18 + wave;
      hs.mid.rotation.x = 0.16 + wave * 1.25;
      hs.root.rotation.z = hs.spread * 0.24 + wave * 0.4;
    }

    this.auraRing.visible = s < 0.85;
    this.auraRing.rotation.z = elapsed * 0.9;
  }

  public applyFinisherPose(
    poseId: FinisherPoseId,
    drainProgress: number,
    time: number,
    dt = 0.016,
    throttleMode: DrainThrottleMode = DRAIN_THROTTLE_MODES.FLOW,
    isTauntStunned = false,
    headChoreography?: FinisherHeadChoreography,
  ): void {
    const res = this.computeResistanceState(
      drainProgress,
      time,
      throttleMode,
      isTauntStunned,
      dt,
    );
    const arm = this.computeResistanceArmTargets(poseId, res);
    const isDip = poseId === FINISHER_POSE_IDS.BALLROOM_DIP;
    const isSurge = throttleMode === DRAIN_THROTTLE_MODES.SURGE;

    this.auraRing.visible = false;
    this.accessoryFlickTimer = Math.max(0, this.accessoryFlickTimer - dt);
    const flickRot =
      this.accessoryFlickTimer > 0
        ? Math.sin(this.accessoryFlickTimer * 28) * 0.45 * this.accessoryFlickTimer
        : 0;
    this.starChokerMesh.rotation.z = flickRot;

    const pullBackZ =
      -res.torsoPullBack * FINISHER_RESISTANCE_CONFIG.maxHipPullBackOffset;
    const spinePullBack =
      -res.torsoPullBack * FINISHER_RESISTANCE_CONFIG.maxTorsoPullBackRad;
    const baseBodyY = isDip ? 0.56 : 0.48;
    const dipTorsoX = isDip ? -0.68 : 0.08;

    this.bodyPivot.position.set(0, baseBodyY, pullBackZ);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(
      dipTorsoX + res.spineResistanceOffset + spinePullBack,
      0,
      res.limpCrossSwayOffset * 0.5,
    );

    const headRoll =
      (headChoreography?.roll ?? 0) * (headChoreography?.bossYieldScale ?? 1) +
      res.headRollOffset;
    const headPitch =
      (isDip ? -0.26 : -0.34) +
      (headChoreography?.bossPitchResponse ?? 0) +
      (headChoreography?.bossTremor ?? 0);
    const headYaw = (headChoreography?.yawSway ?? 0) * 0.6;
    this.headGroup.rotation.set(headPitch, headYaw, headRoll);
    this.headAnchor.position.set(
      0,
      0.125,
      0.136 + (headChoreography?.bossFaceNormalOffset ?? 0),
    );

    this.leftLegPivot.rotation.set(-0.78, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.78, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;

    this.leftShoulderPivot.rotation.set(arm.leftShoulderX, 0, arm.leftShoulderZ);
    this.rightShoulderPivot.rotation.set(arm.rightShoulderX, 0, arm.rightShoulderZ);
    this.leftElbowPivot.rotation.set(arm.leftElbowX, 0, arm.leftElbowZ);
    this.rightElbowPivot.rotation.set(arm.rightElbowX, 0, arm.rightElbowZ);

    const hairSway = isSurge ? 0.12 : 0.05;
    for (let i = 0; i < this.hairStrands.length; i++) {
      const hs = this.hairStrands[i]!;
      hs.root.rotation.x = (isDip ? 0.48 : 0.14) + Math.sin(time * 3.1 + hs.phase) * hairSway;
      hs.mid.rotation.x = 0.22 + Math.cos(time * 2.8 + hs.phase) * hairSway;
    }
  }

  public applyBeamFinisherPose(drainProgress: number, time: number): void {
    const p = this.computeBeamShieldPose(drainProgress, time);
    this.auraRing.visible = false;
    this.bodyPivot.position.set(0, p.bodyY, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(p.torsoX, 0, p.torsoZ);
    this.headGroup.rotation.set(p.headX, p.headY, p.headZ);
    this.leftLegPivot.rotation.set(-0.78, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.78, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;
    this.leftShoulderPivot.rotation.set(p.leftShoulderX, 0, p.leftShoulderZ);
    this.leftElbowPivot.rotation.set(p.leftElbowX, 0, p.leftElbowZ);
    this.rightShoulderPivot.rotation.set(p.rightShoulderX, 0, p.rightShoulderZ);
    this.rightElbowPivot.rotation.set(p.rightElbowX, 0, 0);
  }

  public applyStolenKissPose(
    beat: 1 | 2 | 3,
    beatProgress: number,
    time: number,
  ): void {
    const p = this.computeStolenKissBossPose(beat, beatProgress, time);
    this.auraRing.visible = beat === 3;
    this.auraRing.scale.setScalar(1.0 + p.flareFactor * 1.4);

    this.bodyPivot.position.set(0, p.bodyY, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(p.torsoX, 0, p.torsoZ);
    this.headGroup.rotation.set(p.headX, p.headY, p.headZ);
    this.headAnchor.position.set(0, 0.125, 0.136 + p.headFaceNormalOffset);

    this.leftLegPivot.rotation.set(0.06, 0, -0.06);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.06);
    this.leftKneePivot.rotation.x = 0.14;
    this.rightKneePivot.rotation.x = 0.18;

    this.leftShoulderPivot.rotation.set(p.leftShoulderX, 0, p.leftShoulderZ);
    this.leftElbowPivot.rotation.set(p.leftElbowX, 0, p.leftElbowZ);
    this.rightShoulderPivot.rotation.set(p.rightShoulderX, 0, p.rightShoulderZ);
    this.rightElbowPivot.rotation.set(p.rightElbowX, 0, p.rightElbowZ);
  }

  public applyVictoryCollapsePose(time: number): void {
    this.auraRing.visible = false;
    const breathe = Math.sin(time * 1.6) * 0.012;
    this.bodyPivot.position.set(0, 0.15 + breathe, 0);
    this.bodyPivot.rotation.set(-Math.PI * 0.48, 0, 0.06);
    this.torsoGroup.rotation.set(0.08, 0, 0.04);
    this.headGroup.rotation.set(0.12, 0.24, -0.18);
    this.leftLegPivot.rotation.set(0.1, 0, -0.14);
    this.rightLegPivot.rotation.set(0.18, 0, 0.16);
    this.leftKneePivot.rotation.x = 0.26;
    this.rightKneePivot.rotation.x = 0.34;
    this.applySubjugatedDioramaArms(
      this.leftShoulderPivot,
      this.rightShoulderPivot,
      this.leftElbowPivot,
      this.rightElbowPivot,
      0.06,
    );
  }

  public applyVictoryDioramaPose(time: number): void {
    this.applyVictoryCollapsePose(time);
  }

  public applyPuppetMasterPose(time: number): void {
    this.updateCombatPose(0.016, GAME_STATES.BOSS_COMBAT, time, 0);
    this.leftShoulderPivot.rotation.set(-0.92, 0.14, 0.32);
    this.rightShoulderPivot.rotation.set(-0.92, -0.14, -0.32);
    this.leftElbowPivot.rotation.set(-0.34, 0, 0);
    this.rightElbowPivot.rotation.set(-0.34, 0, 0);
  }

  /**
   * Captive Siphon Gallery Guest Pedestal 1 kneeling pose synced to live `coreCharge` (0 -> 1).
   */
  public applyCaptiveDaisPose(charge: number, time: number, dt: number): void {
    const c = THREE.MathUtils.clamp(charge, 0, 1);
    this.auraRing.visible = false;
    this.applyDrainBleach(1 - c);

    const freq = THREE.MathUtils.lerp(
      SIPHON_GALLERY_CONFIG.captiveBreathFreqMin,
      SIPHON_GALLERY_CONFIG.captiveBreathFreqMax,
      c,
    );
    const breathe = Math.sin(time * freq) * 0.018;
    this.bodyPivot.position.set(
      0,
      SIPHON_GALLERY_CONFIG.captiveKneelBodyY + breathe,
      0,
    );
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(
        SIPHON_GALLERY_CONFIG.captiveTorsoSlumpMax,
        SIPHON_GALLERY_CONFIG.captiveTorsoUprightMin,
        c,
      ),
      0,
      0,
    );
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(
        SIPHON_GALLERY_CONFIG.captiveHeadDroopMax,
        SIPHON_GALLERY_CONFIG.captiveHeadLiftMin,
        c,
      ),
      Math.sin(time * 0.9) * 0.06,
      0,
    );
    this.leftLegPivot.rotation.set(-0.8, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.8, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;

    // Raised bound wrists for the twin crystal tether conduits
    this.leftShoulderPivot.rotation.set(-0.92, 0.22, -0.78);
    this.rightShoulderPivot.rotation.set(-0.92, -0.22, 0.78);
    this.leftElbowPivot.rotation.set(-0.46, 0, 0);
    this.rightElbowPivot.rotation.set(-0.46, 0, 0);

    this.captiveFaceTimer += dt;
    if (this.captiveFaceTimer >= SIPHON_GALLERY_CONFIG.captiveFaceRedrawIntervalSec) {
      this.captiveFaceTimer = 0;
      const targetExpr =
        c < SIPHON_GALLERY_CONFIG.captiveLowChargeThreshold
          ? BOSS_EXPRESSIONS.DRAINED_FAINT
          : BOSS_EXPRESSIONS.STAGGER;
      if (
        targetExpr !== this.currentExpression ||
        targetExpr === BOSS_EXPRESSIONS.DRAINED_FAINT
      ) {
        this.setExpression(targetExpr, time * 2.8);
      }
    }
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
    this.accessoryFlickTimer = 0;
    this.ascendHeight = 0;
    this.auraRing.visible = true;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
    this.setExpression(BOSS_EXPRESSIONS.COMBAT, 0);
  }

  public dispose(): void {
    this.disposeBlindspotGlint();
    for (let i = 0; i < this.ownedGeometries.length; i++) {
      this.ownedGeometries[i]?.dispose();
    }
    for (let i = 0; i < this.ownedMaterials.length; i++) {
      this.ownedMaterials[i]?.dispose();
    }
    for (let i = 0; i < this.ownedTextures.length; i++) {
      this.ownedTextures[i]?.dispose();
    }
  }
}
