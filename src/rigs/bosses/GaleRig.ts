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
 * Cel-shaded procedural wizard rig for **Gale of Waterdeep — Archmage Prodigy**
 * (non-siphonable Special Scenario companion boss in *Shadows of the Sharran Crypt*, `canBeSiphoned = false`).
 *
 * - Warm Waterdhavian skin (`#F3C6A8`), shoulder-length swept brown hair and neatly trimmed beard (`#451A03`)
 *   with zero `BackSide` outlines on head/face/hair and strictly positive scales + `computeVertexNormals()`
 * - Glowing **Netherese orb rune** (`#8B5CF6` / `#38BDF8`) pulsing on his chest beneath open royal-purple
 *   (`#581C87`) and gold-trimmed (`#F59E0B`) archmage robes
 * - Rune-capped arcane quarterstaff in his right hand
 * - Persistent grounded two-stage collapse at `0 HP` (`visible = true` on crypt floor).
 */
export class GaleRig extends BossBase {
  public readonly id = BALDURS_GATE_PARTY_CONFIG.galeId;
  public readonly displayName = BALDURS_GATE_PARTY_CONFIG.galeDisplayName;
  public readonly title = BALDURS_GATE_PARTY_CONFIG.galeTitle;
  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly headAccessory = new THREE.Object3D();
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
  private readonly staffGroup = new THREE.Group();
  private readonly staffOrbMesh: THREE.Mesh;

  // Pulsing Netherese Orb Rune on Chest (#8B5CF6 / #38BDF8)
  private readonly nethereseCoreMesh: THREE.Mesh;
  private readonly nethereseCoreMat: THREE.MeshBasicMaterial;
  private readonly nethereseRingMesh: THREE.Mesh;
  private readonly nethereseRingMat: THREE.MeshBasicMaterial;
  private readonly nethereseLight: THREE.PointLight;
  private readonly auraRing: THREE.Mesh;
  private readonly faceMat: THREE.MeshToonMaterial;

  private nethereseSurge = 0;
  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private ascendHeight = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'GaleRig';
    this.root.userData.managedByRig = true;

    const skinMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.galeSkin),
    );
    const hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.galeHair, {
        emissive: PALETTE.oakWood,
        emissiveIntensity: 0.12,
      }),
    );
    const robePurpleMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.galeRobePurple, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.16,
      }),
    );
    const tunicDarkMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.galeTunicDark),
    );
    const goldTrimMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.galeRobeGold, {
        emissive: PALETTE.riftAmber,
        emissiveIntensity: 0.22,
      }),
    );
    const staffWoodMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.oakWood),
    );

    this.nethereseCoreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0.94,
      }),
    );
    this.nethereseRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.frostRunes,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    const faceTex = this.createGaleFaceTexture();
    this.faceMat = this.trackMat(
      new THREE.MeshToonMaterial({
        map: faceTex,
        gradientMap: ToonAssets.getThreeStepToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: faceTex,
        emissiveIntensity: 0.32,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );

    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.bg3GaleArcane,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bodyPivot.position.set(0, 0.95, 0);
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.torsoGroup);

    this.nethereseCoreMesh = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.038, 1)),
      this.nethereseCoreMat,
    );
    this.nethereseRingMesh = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.048, 0.068, 20)),
      this.nethereseRingMat,
    );
    this.nethereseLight = new THREE.PointLight(
      PALETTE.frostRunes,
      1.6,
      3.2,
      2,
    );

    this.buildArchmageRobes(skinMat, robePurpleMat, tunicDarkMat, goldTrimMat);
    this.buildHeadHairAndBeard(skinMat, this.faceMat, hairMat);
    this.buildArm(-1, robePurpleMat, goldTrimMat, skinMat);
    this.buildArm(1, robePurpleMat, goldTrimMat, skinMat);
    this.staffOrbMesh = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.072, 1)),
      this.nethereseRingMat,
    );
    this.buildQuarterstaff(staffWoodMat, goldTrimMat);
    this.buildLeg(-1, tunicDarkMat, robePurpleMat, goldTrimMat);
    this.buildLeg(1, tunicDarkMat, robePurpleMat, goldTrimMat);

    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.74, 0.92, 36)),
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

  private outlinedRobe(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    scale = 1.04,
  ): THREE.Group {
    this.trackGeo(geo);
    return ToonAssets.createOutlinedMesh(geo, mat, scale, true).group;
  }

  private buildArchmageRobes(
    skinMat: THREE.Material,
    robePurpleMat: THREE.Material,
    tunicDarkMat: THREE.Material,
    goldTrimMat: THREE.Material,
  ): void {
    const pelvis = this.outlinedRobe(
      new THREE.CylinderGeometry(0.128, 0.16, 0.16, 12),
      tunicDarkMat,
    );
    pelvis.position.y = 0.03;
    this.torsoGroup.add(pelvis);

    // Inner dark tunic & exposed upper chest showing the Netherese Orb Rune
    const waist = this.outlinedRobe(
      new THREE.CylinderGeometry(0.142, 0.125, 0.2, 12),
      tunicDarkMat,
    );
    waist.position.y = 0.21;
    this.torsoGroup.add(waist);

    const chest = this.outlinedRobe(
      new THREE.CylinderGeometry(0.165, 0.14, 0.24, 14),
      tunicDarkMat,
    );
    chest.position.y = 0.4;
    this.torsoGroup.add(chest);

    // Open V-front skin chest inlay bearing the pulsing Netherese Orb Rune
    const chestSkin = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.13, 0.16, 0.03)),
      skinMat,
    );
    chestSkin.position.set(0, 0.43, 0.142);
    this.torsoGroup.add(chestSkin);

    // Glowing Netherese Orb Rune (#8B5CF6 core + #38BDF8 arcane halo)
    const orbGroup = new THREE.Group();
    orbGroup.position.set(0, 0.425, 0.165);
    orbGroup.add(this.nethereseCoreMesh);
    orbGroup.add(this.nethereseRingMesh);
    this.nethereseLight.position.set(0, 0, 0.12);
    orbGroup.add(this.nethereseLight);
    this.torsoGroup.add(orbGroup);

    // Open Royal-Purple & Gold-Trimmed Archmage Robe Front Panels & Mantle
    for (let s = -1; s <= 1; s += 2) {
      const robeSide = this.outlinedRobe(
        new THREE.BoxGeometry(0.095, 0.48, 0.16),
        robePurpleMat,
      );
      robeSide.position.set(s * 0.115, 0.28, 0.04);
      this.torsoGroup.add(robeSide);

      const goldBorder = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.018, 0.5, 0.042)),
        goldTrimMat,
      );
      goldBorder.position.set(s * 0.068, 0.28, 0.132);
      this.torsoGroup.add(goldBorder);

      // Wide arched Waterdhavian wizard shoulder mantle
      const mantle = new THREE.Mesh(
        this.trackGeo(
          new THREE.SphereGeometry(0.1, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
        ),
        robePurpleMat,
      );
      mantle.position.set(s * 0.19, 0.485, 0);
      mantle.rotation.z = -s * 0.34;
      this.torsoGroup.add(mantle);
    }

    // Flowing split archmage robe skirts
    const skirtBack = this.outlinedRobe(
      new THREE.CylinderGeometry(0.16, 0.29, 0.72, 12, 1, true, Math.PI * 0.35, Math.PI * 1.3),
      robePurpleMat,
    );
    skirtBack.position.set(0, -0.34, 0);
    this.torsoGroup.add(skirtBack);

    const sash = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.14, 0.022, 8, 20)),
      goldTrimMat,
    );
    sash.rotation.x = Math.PI / 2;
    sash.position.y = 0.12;
    this.torsoGroup.add(sash);

    const neck = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 10)),
      skinMat,
    );
    neck.position.y = 0.55;
    this.torsoGroup.add(neck);
  }

  private buildHeadHairAndBeard(
    skinMat: THREE.Material,
    faceMat: THREE.Material,
    hairMat: THREE.Material,
  ): void {
    this.headGroup.position.set(0, 0.53, 0.008);
    this.torsoGroup.add(this.headGroup);

    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.13, 22, 20));
    headGeo.scale(0.95, 1.04, 0.96);
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.145;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const faceGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.1325,
        20,
        16,
        Math.PI * 0.16,
        Math.PI * 0.68,
        Math.PI * 0.24,
        Math.PI * 0.54,
      ),
    );
    faceGeo.scale(0.95, 1.04, 0.96);
    faceGeo.computeVertexNormals();
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.y = 0.145;
    faceMesh.rotation.y = -Math.PI * 0.5;
    this.headGroup.add(faceMesh);

    this.headAnchor.position.set(0, 0.145, 0.118);
    this.headGroup.add(this.headAnchor);
    this.headAccessory.position.set(0, 0.28, 0.02);
    this.headGroup.add(this.headAccessory);

    // Sculpted neatly trimmed brown beard along chin & jawline (zero BackSide outline)
    const beardGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.118,
        16,
        12,
        Math.PI * 0.12,
        Math.PI * 0.76,
        Math.PI * 0.56,
        Math.PI * 0.42,
      ),
    );
    beardGeo.scale(0.96, 1.02, 1.02);
    beardGeo.computeVertexNormals();
    const beard = new THREE.Mesh(beardGeo, hairMat);
    beard.position.set(0, 0.135, 0.012);
    beard.rotation.y = -Math.PI * 0.5;
    this.headGroup.add(beard);

    // Shoulder-length swept brown hair (zero BackSide outline, strictly positive scales!)
    const crownGeo = this.trackGeo(
      new THREE.SphereGeometry(0.142, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.6),
    );
    crownGeo.scale(0.98, 1.03, 1.03);
    crownGeo.computeVertexNormals();
    const crown = new THREE.Mesh(crownGeo, hairMat);
    crown.position.set(0, 0.158, -0.008);
    this.headGroup.add(crown);

    const sweepGeo = this.trackGeo(new THREE.CylinderGeometry(0.038, 0.028, 0.28, 10));
    sweepGeo.computeVertexNormals();
    const sweepSpecs = [
      { x: -0.112, y: 0.1, z: -0.02, rx: 0.18, rz: 0.14 },
      { x: 0.112, y: 0.1, z: -0.02, rx: 0.18, rz: -0.14 },
      { x: -0.075, y: 0.085, z: -0.1, rx: 0.28, rz: 0.08 },
      { x: 0.075, y: 0.085, z: -0.1, rx: 0.28, rz: -0.08 },
      { x: 0.0, y: 0.08, z: -0.12, rx: 0.3, rz: 0 },
    ];
    for (let i = 0; i < sweepSpecs.length; i++) {
      const sp = sweepSpecs[i]!;
      const lock = new THREE.Mesh(sweepGeo, hairMat);
      lock.position.set(sp.x, sp.y, sp.z);
      lock.rotation.set(sp.rx, 0, sp.rz);
      this.headGroup.add(lock);
    }

    // Swept side-parted brow wave
    const browWaveGeo = this.trackGeo(new THREE.SphereGeometry(0.062, 12, 10));
    browWaveGeo.scale(1.55, 0.72, 0.92);
    browWaveGeo.computeVertexNormals();
    const browWave = new THREE.Mesh(browWaveGeo, hairMat);
    browWave.position.set(0.02, 0.268, 0.066);
    browWave.rotation.z = -0.16;
    this.headGroup.add(browWave);
  }

  private createGaleFaceTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = ARENA_CONFIG.faceTextureSize;
    canvas.height = ARENA_CONFIG.faceTextureSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // Warm Waterdhavian eyes & thoughtful brows
      const eyeY = 276;
      const eyeXs = [176, 336];
      for (let i = 0; i < eyeXs.length; i++) {
        const cx = eyeXs[i]!;
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 40, 22, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.galeHair;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 1, 21, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.abyssalCloak;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 1, 8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 7, eyeY - 5, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.galeHair;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 42, eyeY - 12);
        ctx.quadraticCurveTo(cx, eyeY - 24, cx + 42, eyeY - 10);
        ctx.stroke();

        ctx.lineWidth = 7.5;
        ctx.beginPath();
        ctx.moveTo(cx - 38, eyeY - 40);
        ctx.quadraticCurveTo(cx, eyeY - 50, cx + 38, eyeY - 38);
        ctx.stroke();
      }

      // Neatly trimmed brown mustache & beard contour
      ctx.strokeStyle = PALETTE.hex.galeHair;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(212, 368);
      ctx.quadraticCurveTo(256, 356, 300, 368);
      ctx.stroke();

      ctx.fillStyle = 'rgba(69, 26, 3, 0.72)';
      ctx.beginPath();
      ctx.ellipse(256, 412, 68, 28, 0, 0, Math.PI * 2);
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
    robePurpleMat: THREE.Material,
    goldTrimMat: THREE.Material,
    skinMat: THREE.Material,
  ): void {
    const shoulder =
      side === -1 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side === -1 ? this.leftElbowPivot : this.rightElbowPivot;
    const handAnchor = side === -1 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.2, 0.455, 0);
    this.torsoGroup.add(shoulder);

    const upperSleeve = this.outlinedRobe(
      new THREE.CylinderGeometry(0.052, 0.056, 0.27, 10),
      robePurpleMat,
    );
    upperSleeve.position.y = -0.135;
    shoulder.add(upperSleeve);

    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);

    // Flared archmage cuff sleeve
    const lowerSleeve = this.outlinedRobe(
      new THREE.CylinderGeometry(0.054, 0.068, 0.25, 10),
      robePurpleMat,
    );
    lowerSleeve.position.y = -0.125;
    elbow.add(lowerSleeve);

    const goldHem = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.068, 0.009, 6, 16)),
      goldTrimMat,
    );
    goldHem.rotation.x = Math.PI / 2;
    goldHem.position.y = -0.24;
    elbow.add(goldHem);

    const hand = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.034, 10, 8)),
      skinMat,
    );
    hand.position.y = -0.26;
    elbow.add(hand);

    handAnchor.position.set(0, -0.26, 0);
    elbow.add(handAnchor);
  }

  private buildQuarterstaff(
    woodMat: THREE.Material,
    goldTrimMat: THREE.Material,
  ): void {
    this.staffGroup.position.set(0, -0.26, 0.045);
    this.staffGroup.rotation.set(Math.PI * 0.14, 0, 0);

    const shaft = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.022, 0.018, 1.98, 8)),
      woodMat,
    );
    shaft.position.y = 0.26;
    shaft.castShadow = true;
    this.staffGroup.add(shaft);

    // Gold rune-capped finial cradle holding a glowing cyan-violet arcane focus
    const finialRing = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.115, 0.016, 8, 22)),
      goldTrimMat,
    );
    finialRing.position.y = 1.32;
    this.staffGroup.add(finialRing);

    this.staffOrbMesh.position.y = 1.32;
    this.staffGroup.add(this.staffOrbMesh);

    this.rightElbowPivot.add(this.staffGroup);
  }

  private buildLeg(
    side: -1 | 1,
    tunicDarkMat: THREE.Material,
    robePurpleMat: THREE.Material,
    goldTrimMat: THREE.Material,
  ): void {
    const legPivot = side === -1 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side === -1 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.098, -0.02, 0);
    this.bodyPivot.add(legPivot);

    const thigh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.068, 0.056, 0.43, 10)),
      tunicDarkMat,
    );
    thigh.position.y = -0.215;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.43, 0);
    legPivot.add(kneePivot);

    const boot = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.054, 0.04, 0.44, 10)),
      robePurpleMat,
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
      this.trackGeo(new THREE.BoxGeometry(0.072, 0.058, 0.145)),
      tunicDarkMat,
    );
    foot.position.set(0, -0.44, 0.036);
    kneePivot.add(foot);
  }

  public setNethereseSurge(intensity: number): void {
    this.nethereseSurge = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  public setExpression(_expression: BossExpression, _spiralPhase = 0): void {
    // Non-siphonable archmage maintains focused expression
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

    const breathe = Math.sin(elapsed * 2.5) * 0.022;
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI)
        : 0;

    this.bodyPivot.position.set(0, 0.95 + breathe + this.ascendHeight, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(0.05 + flourish * 0.12, -0.08 + flourish * 0.22, 0);
    this.headGroup.rotation.set(-0.02, 0.06, 0);

    this.leftLegPivot.rotation.set(-0.12, 0, -0.07);
    this.rightLegPivot.rotation.set(0.1, 0, 0.07);
    this.leftKneePivot.rotation.x = 0.16;
    this.rightKneePivot.rotation.x = 0.14;

    // Left hand weaves arcane sigils; right hand holds rune-capped quarterstaff aloft
    this.leftShoulderPivot.rotation.set(-0.68 - flourish * 0.72, 0.24, 0.28);
    this.leftElbowPivot.rotation.set(-0.78 + flourish * 0.45, 0, 0);
    this.rightShoulderPivot.rotation.set(-0.42 - flourish * 0.48, -0.12, -0.22);
    this.rightElbowPivot.rotation.set(-0.52 + flourish * 0.28, 0, 0);
    this.staffGroup.rotation.set(Math.PI * 0.14, 0, 0);

    // Pulse chest Netherese orb rune (#8B5CF6 / #38BDF8) & staff finial
    const orbPulse =
      1.0 + Math.sin(elapsed * (4.2 + this.nethereseSurge * 5.0)) * (0.14 + this.nethereseSurge * 0.22);
    this.nethereseCoreMesh.rotation.y = elapsed * 2.4;
    this.nethereseCoreMesh.scale.setScalar(orbPulse);
    this.nethereseRingMesh.rotation.z = -elapsed * 1.9;
    this.nethereseRingMesh.scale.setScalar(0.92 + orbPulse * 0.14);
    this.nethereseLight.intensity = 1.45 * orbPulse + this.nethereseSurge * 2.2;
    this.staffOrbMesh.rotation.y = elapsed * 2.8;
    this.staffOrbMesh.rotation.x = elapsed * 1.5;

    this.auraRing.visible = true;
    this.auraRing.rotation.z = elapsed * 0.78;

    if (this.hitFlashTimer > 0) {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        if (m) m.emissiveIntensity = 1.3;
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
   * Persistent Two-Stage Grounded Collapse at 0 HP (`visible = true` on crypt floor).
   */
  public override applyAshDissolve(progress: number): void {
    const cfg = WOLF_AND_RAVEN_CONFIG;
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const elapsedSec = p * cfg.collapseDurationSec;

    const rawT1 = THREE.MathUtils.clamp(elapsedSec / cfg.collapseStage1EndSec, 0, 1);
    const t1 = rawT1 * rawT1 * (3 - 2 * rawT1);
    const stage2Dur = Math.max(0.01, cfg.collapseDurationSec - cfg.collapseStage1EndSec);
    const rawT2 = THREE.MathUtils.clamp(
      (elapsedSec - cfg.collapseStage1EndSec) / stage2Dur,
      0,
      1,
    );
    const t2 = rawT2 * rawT2 * (3 - 2 * rawT2);

    this.auraRing.visible = false;
    this.nethereseLight.intensity = THREE.MathUtils.lerp(1.45, 0.15, t1);
    this.faceMat.emissiveIntensity = THREE.MathUtils.lerp(
      0.32,
      cfg.collapseFaceEmissiveDim,
      t1,
    );

    const kneelY = THREE.MathUtils.lerp(0.95, cfg.collapseKneelBodyY, t1);
    const bodyY = THREE.MathUtils.lerp(kneelY, cfg.collapseFloorBodyY, t2);
    this.bodyPivot.position.set(0, bodyY, 0);
    this.bodyPivot.rotation.set(
      cfg.collapseFallPitchRad * t2,
      0,
      cfg.collapseFallRollRad * 0.85 * t2,
    );

    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(0.44 * t1, 0.08, t2),
      THREE.MathUtils.lerp(-0.08, 0.1, t2),
      THREE.MathUtils.lerp(0, -0.1, t2),
    );
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(0.36 * t1, 0.14, t2),
      THREE.MathUtils.lerp(0.06, 0.28, t2),
      THREE.MathUtils.lerp(0, -0.2, t2),
    );

    this.leftLegPivot.rotation.set(
      THREE.MathUtils.lerp(-0.88 * t1, 0.12, t2),
      0,
      THREE.MathUtils.lerp(-0.08, -0.22, t2),
    );
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(1.5 * t1, 0.36, t2);
    this.rightLegPivot.rotation.set(
      THREE.MathUtils.lerp(0.28 * t1, -0.04, t2),
      0,
      THREE.MathUtils.lerp(0.08, 0.24, t2),
    );
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(1.32 * t1, 0.48, t2);

    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(0.18 * t1, -0.18, t2),
      0,
      THREE.MathUtils.lerp(0.36 * t1, 0.68, t2),
    );
    this.leftElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.38 * t1, -0.22, t2), 0, 0);
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.2 * t1, 0.14, t2),
      0,
      THREE.MathUtils.lerp(-0.26 * t1, -0.62, t2),
    );
    this.rightElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.42 * t1, -0.2, t2), 0, 0);
    this.staffGroup.rotation.set(
      THREE.MathUtils.lerp(Math.PI * 0.14, Math.PI * 0.52, t2),
      0,
      THREE.MathUtils.lerp(0, 0.38, t2),
    );

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
    this.nethereseSurge = 0;
    this.hitFlashTimer = 0;
    this.castFlourishTimer = 0;
    this.ascendHeight = 0;
    this.faceMat.emissiveIntensity = 0.32;
    this.nethereseLight.intensity = 1.6;
    this.bodyPivot.position.set(0, 0.95, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.staffGroup.rotation.set(Math.PI * 0.14, 0, 0);
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
