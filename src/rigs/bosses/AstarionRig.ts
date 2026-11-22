import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BALDURS_GATE_PARTY_CONFIG,
  BOSS_PHASES,
  PALETTE,
  WOLF_AND_RAVEN_CONFIG,
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
 * Cel-shaded procedural rogue rig for **Astarion — High-Elf Vampire Spawn**
 * (non-siphonable Special Scenario companion boss in *Shadows of the Sharran Crypt*, `canBeSiphoned = false`).
 *
 * - Pale alabaster skin (`#F1F5F9`), pointed high-elf ears, swept voluminous silver-white curls (`#E2E8F0`),
 *   and luminous crimson vampire eyes (`#EF4444`) with zero `BackSide` outlines on head/face/hair and
 *   strictly positive scales + `computeVertexNormals()`
 * - High-collared embroidered dark-burgundy (`#4C0519`) and midnight-navy (`#0F172A`) doublet with
 *   gold filigree trim (`#F59E0B`), and twin crimson-glinting daggers
 * - Supports shadowy translucent cloak/opacity fade during *Cunning Action: Hide* (`setShadowStealth(intensity)`)
 * - Persistent grounded two-stage collapse at `0 HP` (`visible = true` on crypt floor).
 */
export class AstarionRig extends BossBase {
  public readonly id = BALDURS_GATE_PARTY_CONFIG.astarionId;
  public readonly displayName = BALDURS_GATE_PARTY_CONFIG.astarionDisplayName;
  public readonly title = BALDURS_GATE_PARTY_CONFIG.astarionTitle;
  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly headAccessory = new THREE.Object3D();
  public readonly drainableMaterials: THREE.MeshToonMaterial[] = [];
  public readonly originalColors: THREE.Color[] = [];

  private readonly bleachMetadata: MaterialBleachMetadata[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly stealthFadeMaterials: THREE.Material[] = [];

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
  private readonly leftDaggerGroup = new THREE.Group();
  private readonly rightDaggerGroup = new THREE.Group();
  private readonly stealthCloakMesh: THREE.Mesh;
  private readonly stealthCloakMat: THREE.MeshBasicMaterial;
  private readonly auraRing: THREE.Mesh;
  private readonly faceMat: THREE.MeshToonMaterial;

  private stealthIntensity = 0;
  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private ascendHeight = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'AstarionRig';
    this.root.userData.managedByRig = true;

    const skinMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.astarionSkin),
    );
    const hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.astarionHair, {
        emissive: PALETTE.sharranLunarSilver,
        emissiveIntensity: 0.14,
      }),
    );
    const burgundyMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.astarionBurgundy, {
        emissive: PALETTE.astarionCrimsonEye,
        emissiveIntensity: 0.12,
      }),
    );
    const navyMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.astarionNavy, {
        emissive: PALETTE.royalIndigo,
        emissiveIntensity: 0.14,
      }),
    );
    const goldTrimMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.astarionGoldTrim, {
        emissive: PALETTE.riftAmber,
        emissiveIntensity: 0.2,
      }),
    );
    const steelBladeMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelAstralBlade, {
        emissive: PALETTE.astarionDaggerGlow,
        emissiveIntensity: 0.34,
      }),
    );

    const faceTex = this.createAstarionFaceTexture();
    this.faceMat = this.trackMat(
      new THREE.MeshToonMaterial({
        map: faceTex,
        gradientMap: ToonAssets.getThreeStepToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: faceTex,
        emissiveIntensity: 0.36,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    this.stealthFadeMaterials.push(this.faceMat);

    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.bg3AstarionCrimson,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bodyPivot.position.set(0, 0.94, 0);
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.torsoGroup);

    this.buildDoubletTorso(skinMat, burgundyMat, navyMat, goldTrimMat);
    this.buildHeadAndSilverCurls(skinMat, this.faceMat, hairMat);
    this.buildArm(-1, burgundyMat, navyMat, goldTrimMat, skinMat);
    this.buildArm(1, burgundyMat, navyMat, goldTrimMat, skinMat);
    this.buildDagger(this.leftDaggerGroup, steelBladeMat, goldTrimMat, burgundyMat);
    this.leftElbowPivot.add(this.leftDaggerGroup);
    this.buildDagger(this.rightDaggerGroup, steelBladeMat, goldTrimMat, burgundyMat);
    this.rightElbowPivot.add(this.rightDaggerGroup);
    this.buildLeg(-1, navyMat, burgundyMat, goldTrimMat);
    this.buildLeg(1, navyMat, burgundyMat, goldTrimMat);

    // Shadowy translucent veil envelope for Cunning Action: Hide
    this.stealthCloakMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.sharranShadowMist,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.stealthCloakMesh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.32, 0.52, 1.85, 14, 1, true)),
      this.stealthCloakMat,
    );
    this.stealthCloakMesh.position.y = 0.95;
    this.stealthCloakMesh.visible = false;
    this.root.add(this.stealthCloakMesh);

    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.7, 0.86, 32)),
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
    this.stealthFadeMaterials.push(mat);
    this.originalColors.push(mat.color.clone());
    this.bleachMetadata.push({
      originalEmissive: mat.emissive.clone(),
      originalEmissiveIntensity: mat.emissiveIntensity,
    });
    return mat;
  }

  private buildDoubletTorso(
    skinMat: THREE.Material,
    burgundyMat: THREE.Material,
    navyMat: THREE.Material,
    goldTrimMat: THREE.Material,
  ): void {
    const pelvis = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.115, 0.132, 0.15, 12)),
      navyMat,
    );
    pelvis.position.y = 0.03;
    pelvis.castShadow = true;
    this.torsoGroup.add(pelvis);

    // Tailored dark-burgundy & midnight-navy embroidered doublet
    const waist = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.134, 0.112, 0.21, 14)),
      burgundyMat,
    );
    waist.position.y = 0.21;
    waist.castShadow = true;
    this.torsoGroup.add(waist);

    const chest = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.16, 0.132, 0.24, 14)),
      navyMat,
    );
    chest.position.y = 0.4;
    chest.castShadow = true;
    this.torsoGroup.add(chest);

    // Embroidered burgundy lapel panels with gold filigree trim
    for (let s = -1; s <= 1; s += 2) {
      const lapel = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.082, 0.25, 0.03)),
        burgundyMat,
      );
      lapel.position.set(s * 0.068, 0.38, 0.135);
      lapel.rotation.z = -s * 0.16;
      this.torsoGroup.add(lapel);

      const goldLine = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.015, 0.25, 0.034)),
        goldTrimMat,
      );
      goldLine.position.set(s * 0.034, 0.38, 0.142);
      goldLine.rotation.z = -s * 0.16;
      this.torsoGroup.add(goldLine);
    }

    // High Aristocratic Upturned Collar
    const highCollar = new THREE.Mesh(
      this.trackGeo(
        new THREE.CylinderGeometry(0.132, 0.095, 0.13, 14, 1, true, Math.PI * 0.25, Math.PI * 1.5),
      ),
      burgundyMat,
    );
    highCollar.position.set(0, 0.555, -0.015);
    this.torsoGroup.add(highCollar);

    const collarGoldRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.132, 0.008, 6, 18, Math.PI * 1.5)),
      goldTrimMat,
    );
    collarGoldRim.rotation.set(Math.PI / 2, 0, Math.PI * 0.25);
    collarGoldRim.position.set(0, 0.62, -0.015);
    this.torsoGroup.add(collarGoldRim);

    // Belt with gold buckle & coat tails
    const belt = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.124, 0.016, 8, 20)),
      goldTrimMat,
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.11;
    this.torsoGroup.add(belt);

    const coatTail = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.24, 0.38, 0.03)),
      burgundyMat,
    );
    coatTail.position.set(0, -0.1, -0.135);
    coatTail.rotation.x = 0.16;
    this.torsoGroup.add(coatTail);

    const neck = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.044, 0.052, 0.1, 10)),
      skinMat,
    );
    neck.position.y = 0.55;
    this.torsoGroup.add(neck);
  }

  private buildHeadAndSilverCurls(
    skinMat: THREE.Material,
    faceMat: THREE.Material,
    hairMat: THREE.Material,
  ): void {
    this.headGroup.position.set(0, 0.525, 0.008);
    this.torsoGroup.add(this.headGroup);

    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.126, 22, 20));
    headGeo.scale(0.92, 1.05, 0.95);
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.145;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const faceGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.1285,
        20,
        16,
        Math.PI * 0.16,
        Math.PI * 0.68,
        Math.PI * 0.24,
        Math.PI * 0.54,
      ),
    );
    faceGeo.scale(0.92, 1.05, 0.95);
    faceGeo.computeVertexNormals();
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.y = 0.145;
    faceMesh.rotation.y = -Math.PI * 0.5;
    this.headGroup.add(faceMesh);

    this.headAnchor.position.set(0, 0.145, 0.115);
    this.headGroup.add(this.headAnchor);
    this.headAccessory.position.set(0, 0.28, 0.03);
    this.headGroup.add(this.headAccessory);

    // Pointed High-Elf Ears (positive scales)
    const earGeo = this.trackGeo(new THREE.ConeGeometry(0.02, 0.088, 6));
    earGeo.computeVertexNormals();
    for (let s = -1; s <= 1; s += 2) {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.position.set(s * 0.122, 0.146, -0.008);
      ear.rotation.set(0.14, s * 0.32, -s * 1.15);
      this.headGroup.add(ear);
    }

    // Swept Voluminous Silver-White Curls (zero BackSide outlines, strictly positive scales!)
    const baseCapGeo = this.trackGeo(
      new THREE.SphereGeometry(0.138, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    );
    baseCapGeo.scale(0.98, 1.04, 1.04);
    baseCapGeo.computeVertexNormals();
    const baseCap = new THREE.Mesh(baseCapGeo, hairMat);
    baseCap.position.set(0, 0.158, -0.008);
    this.headGroup.add(baseCap);

    // Sculpted layered curls sweeping back & framing his brow
    const curlGeo = this.trackGeo(new THREE.SphereGeometry(0.056, 12, 10));
    curlGeo.computeVertexNormals();
    const curlSpecs = [
      { x: 0.0, y: 0.278, z: 0.068, sx: 1.35, sy: 0.88, sz: 1.12, rx: -0.25 },
      { x: -0.068, y: 0.264, z: 0.056, sx: 1.12, sy: 0.9, sz: 1.05, rx: -0.18 },
      { x: 0.072, y: 0.262, z: 0.052, sx: 1.15, sy: 0.92, sz: 1.05, rx: -0.18 },
      { x: -0.112, y: 0.215, z: 0.015, sx: 0.85, sy: 1.18, sz: 1.05, rx: 0.12 },
      { x: 0.112, y: 0.215, z: 0.015, sx: 0.85, sy: 1.18, sz: 1.05, rx: 0.12 },
      { x: -0.095, y: 0.195, z: -0.088, sx: 1.05, sy: 1.18, sz: 1.02, rx: 0.24 },
      { x: 0.095, y: 0.195, z: -0.088, sx: 1.05, sy: 1.18, sz: 1.02, rx: 0.24 },
      { x: 0.0, y: 0.235, z: -0.105, sx: 1.32, sy: 1.12, sz: 1.08, rx: 0.28 },
      { x: 0.0, y: 0.14, z: -0.122, sx: 1.24, sy: 0.96, sz: 0.86, rx: 0.35 },
    ];
    for (let i = 0; i < curlSpecs.length; i++) {
      const c = curlSpecs[i]!;
      const curl = new THREE.Mesh(curlGeo, hairMat);
      curl.scale.set(c.sx, c.sy, c.sz);
      curl.position.set(c.x, c.y, c.z);
      curl.rotation.x = c.rx;
      this.headGroup.add(curl);
    }
  }

  private createAstarionFaceTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = ARENA_CONFIG.faceTextureSize;
    canvas.height = ARENA_CONFIG.faceTextureSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // Luminous Crimson Vampire Eyes (#EF4444)
      const eyeY = 278;
      const eyeXs = [174, 338];
      for (let i = 0; i < eyeXs.length; i++) {
        const cx = eyeXs[i]!;
        const dir = i === 0 ? 1 : -1;

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 42, 22, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.astarionCrimsonEye;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 1, 22, 19, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.astarionBurgundy;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 1, 8.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 8, eyeY - 5, 4.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.astarionNavy;
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 44 * dir, eyeY - 12);
        ctx.quadraticCurveTo(cx, eyeY - 24, cx + 44 * dir, eyeY - 8);
        ctx.stroke();

        // Arched aristocratic silver-slate brow
        ctx.strokeStyle = PALETTE.hex.mutedSlate;
        ctx.lineWidth = 6.5;
        ctx.beginPath();
        ctx.moveTo(cx - 38 * dir, eyeY - 40);
        ctx.quadraticCurveTo(cx, eyeY - 54, cx + 36 * dir, eyeY - 34);
        ctx.stroke();
      }

      // Subtle vampire smirk with twin fang glints
      ctx.strokeStyle = PALETTE.hex.astarionBurgundy;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(222, 378);
      ctx.quadraticCurveTo(258, 392, 294, 368);
      ctx.stroke();

      ctx.fillStyle = PALETTE.hex.pureWhite;
      ctx.beginPath();
      ctx.moveTo(238, 379);
      ctx.lineTo(243, 390);
      ctx.lineTo(248, 381);
      ctx.moveTo(268, 380);
      ctx.lineTo(273, 390);
      ctx.lineTo(278, 377);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.ownedTextures.push(tex);
    return tex;
  }

  private buildArm(
    side: -1 | 1,
    burgundyMat: THREE.Material,
    navyMat: THREE.Material,
    goldTrimMat: THREE.Material,
    skinMat: THREE.Material,
  ): void {
    const shoulder =
      side === -1 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side === -1 ? this.leftElbowPivot : this.rightElbowPivot;
    const handAnchor = side === -1 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.195, 0.455, 0);
    this.torsoGroup.add(shoulder);

    const upperSleeve = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.045, 0.04, 0.27, 10)),
      navyMat,
    );
    upperSleeve.position.y = -0.135;
    shoulder.add(upperSleeve);

    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.042, 0.035, 0.24, 10)),
      burgundyMat,
    );
    forearm.position.y = -0.12;
    elbow.add(forearm);

    const goldCuff = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.038, 0.008, 6, 14)),
      goldTrimMat,
    );
    goldCuff.rotation.x = Math.PI / 2;
    goldCuff.position.y = -0.22;
    elbow.add(goldCuff);

    const hand = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.032, 10, 8)),
      skinMat,
    );
    hand.position.y = -0.255;
    elbow.add(hand);

    handAnchor.position.set(0, -0.255, 0);
    elbow.add(handAnchor);
  }

  private buildDagger(
    group: THREE.Group,
    bladeMat: THREE.Material,
    goldTrimMat: THREE.Material,
    burgundyMat: THREE.Material,
  ): void {
    group.position.set(0, -0.255, 0.035);
    group.rotation.set(Math.PI * 0.48, 0, 0);

    const hilt = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.16, 8)),
      burgundyMat,
    );
    hilt.position.y = -0.02;
    group.add(hilt);

    const guard = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.11, 0.022, 0.03)),
      goldTrimMat,
    );
    guard.position.y = 0.065;
    group.add(guard);

    const blade = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.026, 0.44, 4)),
      bladeMat,
    );
    blade.rotation.y = Math.PI * 0.25;
    blade.scale.set(1.0, 1.0, 0.35);
    blade.position.y = 0.295;
    group.add(blade);
  }

  private buildLeg(
    side: -1 | 1,
    navyMat: THREE.Material,
    burgundyMat: THREE.Material,
    goldTrimMat: THREE.Material,
  ): void {
    const legPivot = side === -1 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side === -1 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.095, -0.02, 0);
    this.bodyPivot.add(legPivot);

    const thigh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.066, 0.054, 0.43, 10)),
      navyMat,
    );
    thigh.position.y = -0.215;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.43, 0);
    legPivot.add(kneePivot);

    const boot = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.052, 0.038, 0.44, 10)),
      burgundyMat,
    );
    boot.position.y = -0.22;
    kneePivot.add(boot);

    const bootTrim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.052, 0.007, 6, 14)),
      goldTrimMat,
    );
    bootTrim.rotation.x = Math.PI / 2;
    bootTrim.position.y = -0.02;
    kneePivot.add(bootTrim);

    const foot = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.068, 0.056, 0.145)),
      burgundyMat,
    );
    foot.position.set(0, -0.44, 0.035);
    kneePivot.add(foot);
  }

  /**
   * Drives shadowy translucent opacity fade for *Cunning Action: Hide* (`0 = opaque`, `1 = cloaked shadow`).
   */
  public setShadowStealth(intensity: number): void {
    const s = THREE.MathUtils.clamp(intensity, 0, 1);
    this.stealthIntensity = s;
    const opacity = THREE.MathUtils.lerp(1.0, 0.22, s);
    const isStealthed = s > 0.04;

    for (let i = 0; i < this.stealthFadeMaterials.length; i++) {
      const m = this.stealthFadeMaterials[i];
      if (!m) continue;
      if (m === this.faceMat) {
        m.transparent = true;
        m.opacity = opacity;
      } else {
        m.transparent = isStealthed;
        m.opacity = opacity;
        m.depthWrite = !isStealthed;
      }
    }

    this.stealthCloakMesh.visible = isStealthed;
    this.stealthCloakMat.opacity = s * 0.42;
    this.auraRing.visible = !isStealthed;
  }

  public setExpression(_expression: BossExpression, _spiralPhase = 0): void {
    // Non-siphonable vampire spawn maintains predatory smirk
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.auraRing.scale.setScalar(phase >= BOSS_PHASES.PHASE_2 ? 1.2 : 1.0);
  }

  public setAscendHeight(extraY: number): void {
    this.ascendHeight = extraY;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.14;
  }

  public triggerCastFlourish(): void {
    this.castFlourishTimer = 0.38;
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

    const crouch = this.stealthIntensity * 0.16;
    const breathe = Math.sin(elapsed * 3.4) * 0.018;
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.38) * Math.PI)
        : 0;

    this.bodyPivot.position.set(0, 0.94 - crouch + breathe + this.ascendHeight, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(
      0.16 + crouch * 1.1 + flourish * 0.25,
      Math.sin(elapsed * 2.2) * 0.12 + flourish * 0.45,
      0,
    );
    this.headGroup.rotation.set(-0.08, -Math.sin(elapsed * 2.2) * 0.1, 0);

    // Agile low rogue dual-dagger stance
    this.leftLegPivot.rotation.set(-0.32 - crouch * 1.2, 0, -0.1);
    this.rightLegPivot.rotation.set(0.28 - crouch * 0.6, 0, 0.1);
    this.leftKneePivot.rotation.x = 0.48 + crouch * 1.6;
    this.rightKneePivot.rotation.x = 0.32 + crouch * 1.4;

    this.leftShoulderPivot.rotation.set(-0.68 - flourish * 0.65, 0.28, 0.32);
    this.leftElbowPivot.rotation.set(-0.92 + flourish * 0.5, 0, 0);
    this.rightShoulderPivot.rotation.set(-0.56 - flourish * 0.72, -0.28, -0.32);
    this.rightElbowPivot.rotation.set(-0.88 + flourish * 0.55, 0, 0);
    this.leftDaggerGroup.rotation.set(Math.PI * 0.48, 0, 0);
    this.rightDaggerGroup.rotation.set(Math.PI * 0.48, 0, 0);

    if (this.stealthCloakMesh.visible) {
      this.stealthCloakMesh.rotation.y = elapsed * 2.4;
    }
    this.auraRing.rotation.z = -elapsed * 1.15;

    if (this.hitFlashTimer > 0) {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        if (m) m.emissiveIntensity = 1.35;
      }
    } else {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        const meta = this.bleachMetadata[i];
        if (m && meta) m.emissiveIntensity = meta.originalEmissiveIntensity;
      }
    }
  }

  /**
   * Persistent Two-Stage Grounded Collapse at 0 HP (`visible = true`, clears stealth translucency).
   */
  public override applyAshDissolve(progress: number): void {
    const cfg = WOLF_AND_RAVEN_CONFIG;
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const elapsedSec = p * cfg.collapseDurationSec;

    this.setShadowStealth(0);
    this.auraRing.visible = false;

    const rawT1 = THREE.MathUtils.clamp(elapsedSec / cfg.collapseStage1EndSec, 0, 1);
    const t1 = rawT1 * rawT1 * (3 - 2 * rawT1);
    const stage2Dur = Math.max(0.01, cfg.collapseDurationSec - cfg.collapseStage1EndSec);
    const rawT2 = THREE.MathUtils.clamp(
      (elapsedSec - cfg.collapseStage1EndSec) / stage2Dur,
      0,
      1,
    );
    const t2 = rawT2 * rawT2 * (3 - 2 * rawT2);

    this.faceMat.emissiveIntensity = THREE.MathUtils.lerp(
      0.36,
      cfg.collapseFaceEmissiveDim,
      t1,
    );

    const kneelY = THREE.MathUtils.lerp(0.94, cfg.collapseKneelBodyY, t1);
    const bodyY = THREE.MathUtils.lerp(kneelY, cfg.collapseFloorBodyY, t2);
    this.bodyPivot.position.set(0, bodyY, 0);
    this.bodyPivot.rotation.set(
      cfg.collapseFallPitchRad * t2,
      0,
      cfg.collapseFallRollRad * t2,
    );

    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(0.45 * t1, 0.06, t2),
      THREE.MathUtils.lerp(0, 0.14, t2),
      THREE.MathUtils.lerp(0, -0.12, t2),
    );
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(0.38 * t1, 0.12, t2),
      THREE.MathUtils.lerp(0, 0.36, t2),
      THREE.MathUtils.lerp(0, -0.22, t2),
    );

    this.leftLegPivot.rotation.set(
      THREE.MathUtils.lerp(-0.92 * t1, 0.14, t2),
      0,
      THREE.MathUtils.lerp(-0.1, -0.24, t2),
    );
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(1.52 * t1, 0.42, t2);
    this.rightLegPivot.rotation.set(
      THREE.MathUtils.lerp(0.32 * t1, -0.06, t2),
      0,
      THREE.MathUtils.lerp(0.1, 0.26, t2),
    );
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(1.36 * t1, 0.56, t2);

    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(0.2 * t1, -0.24, t2),
      0,
      THREE.MathUtils.lerp(0.38 * t1, 0.74, t2),
    );
    this.leftElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.42 * t1, -0.22, t2), 0, 0);
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.22 * t1, 0.16, t2),
      0,
      THREE.MathUtils.lerp(-0.28 * t1, -0.68, t2),
    );
    this.rightElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.46 * t1, -0.2, t2), 0, 0);

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
    // Non-siphonable companion never enters SIPHON_FINISHER
  }

  public applyBeamFinisherPose(_drainProgress: number, _time: number): void {
    // Non-siphonable companion never enters SIPHON_FINISHER
  }

  public applyStolenKissPose(
    _beat: 1 | 2 | 3,
    _beatProgress: number,
    _time: number,
  ): void {
    // Non-siphonable companion never enters STOLEN_KISS
  }

  public applyVictoryCollapsePose(_time: number): void {
    this.applyAshDissolve(1.0);
  }

  public applyPuppetMasterPose(time: number): void {
    this.updateCombatPose(0.016, 'BOSS_COMBAT', time, 0);
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
    this.setShadowStealth(0);
    this.hitFlashTimer = 0;
    this.castFlourishTimer = 0;
    this.ascendHeight = 0;
    this.faceMat.emissiveIntensity = 0.36;
    this.bodyPivot.position.set(0, 0.94, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.auraRing.visible = true;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
  }

  public dispose(): void {
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
