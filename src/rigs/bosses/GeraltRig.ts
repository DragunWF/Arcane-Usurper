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

export type WitcherSignKind = 'IGNI' | 'QUEN' | 'YRDEN';

interface PooledAshEmber {
  readonly mesh: THREE.Mesh<THREE.OctahedronGeometry, THREE.MeshBasicMaterial>;
  readonly seedAngle: number;
  readonly seedRadius: number;
  readonly seedY: number;
  readonly riseSpeed: number;
  readonly swirlSpeed: number;
  readonly isEmber: boolean;
}

/**
 * Cel-shaded procedural warrior rig for **Geralt of Rivia — The White Wolf**
 * (non-siphonable Special Scenario boss in *The Wolf & The Raven*, `canBeSiphoned = false`).
 *
 * - White hair tied in a half-ponytail with loose front strands framing a scarred face and
 *   amber-gold cat-slit eyes (`#F59E0B`) rendered with clean 3-step cel shading (no BackSide outlines on head/hair)
 * - Dark studded Kaer Morhen/Viper-style leather-and-chainmail armor (`#1E293B` + `#64748B`),
 *   twin angled sword scabbards across his back, gleaming silver/steel longsword in his right hand
 * - Left-palm Witcher Sign emitter flashing **Igni** (orange), **Quen** (gold), and **Yrden** (violet) glyphs
 * - Lethal 1.6s ash-dissolve animation at 0 HP dropping to one knee and dissolving into 36 pooled ash & ember particles.
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
  private readonly ownedTextures: THREE.Texture[] = [];

  private readonly bodyPivot = new THREE.Group();
  private readonly torsoGroup = new THREE.Group();
  private readonly headGroup = new THREE.Group();
  private readonly ponytailPivot = new THREE.Group();
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

  // Left-Palm Witcher Sign Glyph Emitter (Igni / Quen / Yrden)
  private readonly signEmitterGroup = new THREE.Group();
  private readonly signGlyphMat: THREE.MeshBasicMaterial;
  private readonly signRingMat: THREE.MeshBasicMaterial;
  private readonly signLight: THREE.PointLight;
  private activeSignKind: WitcherSignKind = 'QUEN';
  private signFlashTimer = 0;

  // Pre-allocated Pool of 36 Ash & Ember Particles for Lethal 0 HP Dissolution
  private readonly ashPoolGroup = new THREE.Group();
  private readonly ashPool: PooledAshEmber[] = [];

  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private ascendHeight = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'GeraltRig';
    this.root.userData.managedByRig = true;

    const armorMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.geraltArmor, {
        emissive: PALETTE.shadowSlate,
        emissiveIntensity: 0.14,
      }),
    );
    const chainmailMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.geraltChainmail, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.12,
      }),
    );
    const leatherMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.geraltLeather),
    );
    const steelMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.geraltSteel, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.24,
      }),
    );
    const skinMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferSkin),
    );
    const hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.geraltHairSilver, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.12,
      }),
    );

    // 512x512 Scarred Witcher Face Canvas with Amber-Gold Cat-Slit Eyes (#F59E0B)
    const faceTex = this.createGeraltFaceTexture();
    const faceMat = this.trackMat(
      new THREE.MeshToonMaterial({
        map: faceTex,
        gradientMap: ToonAssets.getThreeStepToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: faceTex,
        emissiveIntensity: 0.34,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );

    const auraMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.steelSilver,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );

    this.bodyPivot.position.set(0, 0.96, 0);
    this.root.add(this.bodyPivot);
    this.bodyPivot.add(this.torsoGroup);

    // Kaer Morhen / Viper-Style Studded Leather & Chainmail Armor Torso
    this.buildKaerMorhenTorso(armorMat, chainmailMat, leatherMat, steelMat);

    // Clean Cel-Shaded Head, Scarred Face & White Half-Ponytail Hair (no BackSide outlines!)
    this.buildHeadAndHalfPonytail(skinMat, faceMat, hairMat);

    // Arms with Chainmail Sleeves, Drawn Silver Longsword (Right) & Sign Emitter (Left Palm)
    this.buildArm(-1, armorMat, chainmailMat, leatherMat, steelMat, skinMat);
    this.buildArm(1, armorMat, chainmailMat, leatherMat, steelMat, skinMat);
    this.buildLongsword(steelMat, leatherMat);

    // Left-Palm Witcher Sign Glyph Emitter (Igni orange / Quen gold / Yrden violet)
    this.signGlyphMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.geraltQuenGold,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.signRingMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.geraltQuenGold,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.signLight = new THREE.PointLight(PALETTE.geraltQuenGold, 0, 3.6, 2);
    this.buildLeftPalmSignEmitter();

    // Armored Witcher Trousers & Riding Boots
    this.buildLeg(-1, armorMat, leatherMat, steelMat);
    this.buildLeg(1, armorMat, leatherMat, steelMat);

    // Subtle Ground Steel Aura Ring
    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.68, 0.82, 32)),
      auraMat,
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.04;
    this.root.add(this.auraRing);

    // Build Pooled 36 Ash & Ember Particles for Lethal 1.6s Dissolution
    this.buildAshDissolvePool();

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

  private outlinedGear(
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

  private createGeraltFaceTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = ARENA_CONFIG.faceTextureSize;
    canvas.height = ARENA_CONFIG.faceTextureSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // Scarred left-eye Witcher vertical-diagonal scar
      ctx.strokeStyle = PALETTE.hex.geraltScar;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(192, 186);
      ctx.lineTo(164, 272);
      ctx.lineTo(176, 344);
      ctx.stroke();

      // Amber-Gold Cat-Slit Eyes (#F59E0B)
      const eyeXs = [174, 338];
      const eyeY = 266;
      for (let i = 0; i < eyeXs.length; i++) {
        const cx = eyeXs[i]!;
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 36, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.geraltAmberEye;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 20, 17, 0, 0, Math.PI * 2);
        ctx.fill();

        // Sharp vertical cat-slit pupil
        ctx.fillStyle = PALETTE.hex.pureBlack;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 5.5, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 7, eyeY - 5, 4, 0, Math.PI * 2);
        ctx.fill();

        // Hardened upper brow line
        ctx.strokeStyle = PALETTE.hex.shadowSlate;
        ctx.lineWidth = 7.5;
        ctx.beginPath();
        ctx.moveTo(cx - 40, eyeY - 8);
        ctx.lineTo(cx + 40, eyeY - 4);
        ctx.stroke();
      }

      // Stern silver-grey brows
      ctx.strokeStyle = PALETTE.hex.steelSilver;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(130, 224);
      ctx.lineTo(212, 238);
      ctx.moveTo(382, 224);
      ctx.lineTo(300, 238);
      ctx.stroke();

      // Stoic grim mouth + subtle stubble contour
      ctx.strokeStyle = PALETTE.hex.mutedSlate;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(224, 368);
      ctx.lineTo(288, 368);
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.ownedTextures.push(tex);
    return tex;
  }

  private buildKaerMorhenTorso(
    armorMat: THREE.MeshToonMaterial,
    chainmailMat: THREE.MeshToonMaterial,
    leatherMat: THREE.MeshToonMaterial,
    steelMat: THREE.MeshToonMaterial,
  ): void {
    const pelvis = this.outlinedGear(
      new THREE.CylinderGeometry(0.185, 0.165, 0.24, 10),
      leatherMat,
    );
    pelvis.position.y = 0.04;
    this.torsoGroup.add(pelvis);

    // Dark Studded Cuirass Chest Plate (#1E293B)
    const chest = this.outlinedGear(
      new THREE.CylinderGeometry(0.245, 0.185, 0.54, 12),
      armorMat,
    );
    chest.position.y = 0.42;
    this.torsoGroup.add(chest);

    // Chainmail Side Rib Panels & Shoulder Yoke (#64748B)
    const chainYoke = this.outlinedGear(
      new THREE.CylinderGeometry(0.255, 0.23, 0.16, 12),
      chainmailMat,
    );
    chainYoke.position.y = 0.62;
    this.torsoGroup.add(chainYoke);

    // Silver Armor Studs across breastplate
    const studGeo = this.trackGeo(new THREE.SphereGeometry(0.016, 6, 6));
    const studCoords: readonly [number, number, number][] = [
      [-0.12, 0.52, 0.215],
      [0.12, 0.52, 0.215],
      [-0.1, 0.38, 0.205],
      [0.1, 0.38, 0.205],
      [-0.08, 0.26, 0.195],
      [0.08, 0.26, 0.195],
    ];
    for (let i = 0; i < studCoords.length; i++) {
      const [sx, sy, sz] = studCoords[i]!;
      const stud = new THREE.Mesh(studGeo, steelMat);
      stud.position.set(sx, sy, sz);
      this.torsoGroup.add(stud);
    }

    // Crossed Baldric Strap, Silver Buckle & Wolf School Medallion
    const baldric = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.5, 0.068, 0.3)),
      leatherMat,
    );
    baldric.position.set(0, 0.44, 0.01);
    baldric.rotation.z = 0.52;
    this.torsoGroup.add(baldric);

    const wolfMedallion = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.056, 0)),
      steelMat,
    );
    wolfMedallion.position.set(0, 0.57, 0.23);
    this.torsoGroup.add(wolfMedallion);

    // Utility Belt & Alchemy Pouches
    const belt = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.195, 0.195, 0.07, 12)),
      leatherMat,
    );
    belt.position.y = 0.14;
    this.torsoGroup.add(belt);

    const pouchGeo = this.trackGeo(new THREE.BoxGeometry(0.065, 0.09, 0.05));
    for (const sx of [-0.17, 0.17] as const) {
      const pouch = new THREE.Mesh(pouchGeo, leatherMat);
      pouch.position.set(sx, 0.12, 0.1);
      this.torsoGroup.add(pouch);
    }

    // Twin Angled Sword Scabbards across his back (Steel & V-Crossguard Silver hilts)
    const scabbardGeo = this.trackGeo(new THREE.BoxGeometry(0.056, 1.24, 0.032));
    const hiltGeo = this.trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.25, 6));
    const guardGeo = this.trackGeo(new THREE.BoxGeometry(0.2, 0.028, 0.032));

    const scabbards = [
      { x: -0.05, zRot: -0.24, isSilver: false },
      { x: 0.07, zRot: -0.36, isSilver: true },
    ];
    for (let i = 0; i < scabbards.length; i++) {
      const sc = scabbards[i]!;
      const sg = new THREE.Group();
      sg.position.set(sc.x, 0.42, -0.21);
      sg.rotation.z = sc.zRot;
      sg.add(new THREE.Mesh(scabbardGeo, leatherMat));

      const hilt = new THREE.Mesh(hiltGeo, sc.isSilver ? steelMat : leatherMat);
      hilt.position.y = 0.75;
      const guard = new THREE.Mesh(guardGeo, steelMat);
      guard.position.y = 0.62;
      if (sc.isSilver) guard.rotation.z = 0.18;
      sg.add(hilt, guard);
      this.torsoGroup.add(sg);
    }
  }

  private buildHeadAndHalfPonytail(
    skinMat: THREE.MeshToonMaterial,
    faceMat: THREE.MeshToonMaterial,
    hairMat: THREE.MeshToonMaterial,
  ): void {
    this.headGroup.position.set(0, 0.73, 0);
    this.torsoGroup.add(this.headGroup);

    const neckGeo = this.trackGeo(new THREE.CylinderGeometry(0.068, 0.078, 0.12, 8));
    neckGeo.computeVertexNormals();
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 0.04;
    this.headGroup.add(neck);

    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.145, 20, 16));
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.18;
    headMesh.scale.set(0.95, 1.06, 0.98);
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const faceShellGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.147,
        24,
        18,
        Math.PI * 0.16,
        Math.PI * 0.68,
        Math.PI * 0.2,
        Math.PI * 0.62,
      ),
    );
    faceShellGeo.computeVertexNormals();
    const faceShell = new THREE.Mesh(faceShellGeo, faceMat);
    faceShell.position.y = 0.18;
    faceShell.scale.set(0.95, 1.06, 0.98);
    this.headGroup.add(faceShell);

    this.headAnchor.position.set(0, 0.14, 0.14);
    this.headGroup.add(this.headAnchor);
    this.headAccessory.position.set(0, 0.31, 0.02);
    this.headGroup.add(this.headAccessory);

    // Swept White Hair Crown + Loose Front Strands Framing the Scarred Face (positive scales only!)
    const crownGeo = this.trackGeo(
      new THREE.SphereGeometry(0.158, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
    );
    crownGeo.computeVertexNormals();
    const hairCrown = new THREE.Mesh(crownGeo, hairMat);
    hairCrown.position.set(0, 0.205, -0.015);
    this.headGroup.add(hairCrown);

    const frontStrandCurves: readonly THREE.Vector3[][] = [
      [
        new THREE.Vector3(-0.095, 0.295, 0.06),
        new THREE.Vector3(-0.132, 0.22, 0.088),
        new THREE.Vector3(-0.122, 0.125, 0.068),
      ],
      [
        new THREE.Vector3(0.095, 0.295, 0.06),
        new THREE.Vector3(0.132, 0.22, 0.088),
        new THREE.Vector3(0.122, 0.125, 0.068),
      ],
      [
        new THREE.Vector3(-0.04, 0.32, 0.065),
        new THREE.Vector3(-0.082, 0.278, 0.105),
      ],
    ];
    for (let i = 0; i < frontStrandCurves.length; i++) {
      const curve = new THREE.CatmullRomCurve3(frontStrandCurves[i]!);
      const geo = this.trackGeo(new THREE.TubeGeometry(curve, 10, 0.022, 7, false));
      geo.computeVertexNormals();
      this.headGroup.add(new THREE.Mesh(geo, hairMat));
    }

    // Half-Ponytail Tied at Back of Head + Loose Lower White Locks
    this.ponytailPivot.position.set(0, 0.21, -0.155);
    this.headGroup.add(this.ponytailPivot);

    const tieBand = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.036, 0.01, 6, 12)),
      this.trackMat(ToonAssets.createThreeStepToonMaterial(PALETTE.geraltLeather)),
    );
    tieBand.rotation.x = Math.PI / 2;
    this.ponytailPivot.add(tieBand);

    const tailCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, -0.09, -0.065),
      new THREE.Vector3(0, -0.22, -0.045),
      new THREE.Vector3(0, -0.34, -0.075),
    ]);
    const tailGeo = this.trackGeo(new THREE.TubeGeometry(tailCurve, 12, 0.038, 8, false));
    tailGeo.computeVertexNormals();
    this.ponytailPivot.add(new THREE.Mesh(tailGeo, hairMat));
  }

  private buildArm(
    side: -1 | 1,
    armorMat: THREE.MeshToonMaterial,
    chainmailMat: THREE.MeshToonMaterial,
    leatherMat: THREE.MeshToonMaterial,
    steelMat: THREE.MeshToonMaterial,
    skinMat: THREE.MeshToonMaterial,
  ): void {
    const shoulder = side < 0 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side < 0 ? this.leftElbowPivot : this.rightElbowPivot;
    const hand = side < 0 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.295, 0.62, 0);
    this.torsoGroup.add(shoulder);

    const pauldron = this.outlinedGear(
      new THREE.SphereGeometry(0.11, 10, 8),
      armorMat,
    );
    shoulder.add(pauldron);

    const upperArm = this.outlinedGear(
      new THREE.CylinderGeometry(0.064, 0.056, 0.34, 8),
      chainmailMat,
    );
    upperArm.position.y = -0.17;
    shoulder.add(upperArm);

    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);

    const bracer = this.outlinedGear(
      new THREE.CylinderGeometry(0.054, 0.045, 0.32, 8),
      leatherMat,
    );
    bracer.position.y = -0.16;
    elbow.add(bracer);

    const vambraceTrim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.052, 0.009, 6, 12)),
      steelMat,
    );
    vambraceTrim.rotation.x = Math.PI / 2;
    vambraceTrim.position.y = -0.26;
    elbow.add(vambraceTrim);

    const glove = this.outlinedGear(
      new THREE.SphereGeometry(0.048, 8, 8),
      skinMat,
    );
    glove.position.y = -0.33;
    elbow.add(glove);

    hand.position.set(0, -0.35, 0.02);
    elbow.add(hand);
  }

  private buildLongsword(
    steelMat: THREE.MeshToonMaterial,
    leatherMat: THREE.MeshToonMaterial,
  ): void {
    const blade = this.outlinedGear(
      new THREE.BoxGeometry(0.044, 1.18, 0.016),
      steelMat,
    );
    blade.position.y = 0.65;
    const tip = this.outlinedGear(
      new THREE.ConeGeometry(0.032, 0.16, 4),
      steelMat,
    );
    tip.position.y = 1.32;
    const crossguard = this.outlinedGear(
      new THREE.BoxGeometry(0.26, 0.032, 0.042),
      steelMat,
    );
    crossguard.position.y = 0.06;
    const grip = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.24, 6)),
      leatherMat,
    );
    grip.position.y = -0.06;
    const pommel = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.034, 0)),
      steelMat,
    );
    pommel.position.y = -0.19;

    this.swordGroup.add(blade, tip, crossguard, grip, pommel);
    this.swordGroup.position.set(0, -0.34, 0.04);
    this.swordGroup.rotation.set(Math.PI * 0.42, 0, 0);
    this.rightElbowPivot.add(this.swordGroup);
  }

  private buildLeftPalmSignEmitter(): void {
    this.signEmitterGroup.position.set(0, -0.37, 0.075);
    this.leftElbowPivot.add(this.signEmitterGroup);

    // Triangular Witcher Sign glyph + outer rune halo
    const signTri = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.11, 0.155, 3)),
      this.signGlyphMat,
    );
    const signOuter = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.19, 0.215, 18)),
      this.signRingMat,
    );
    this.signEmitterGroup.add(signTri, signOuter, this.signLight);
  }

  private buildLeg(
    side: -1 | 1,
    armorMat: THREE.MeshToonMaterial,
    leatherMat: THREE.MeshToonMaterial,
    steelMat: THREE.MeshToonMaterial,
  ): void {
    const legPivot = side < 0 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side < 0 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.12, -0.04, 0);
    this.bodyPivot.add(legPivot);

    const thigh = this.outlinedGear(
      new THREE.CylinderGeometry(0.084, 0.068, 0.44, 8),
      armorMat,
    );
    thigh.position.y = -0.22;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.44, 0);
    legPivot.add(kneePivot);

    const kneeGuard = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.062, 8, 6)),
      steelMat,
    );
    kneeGuard.position.set(0, -0.02, 0.045);
    kneePivot.add(kneeGuard);

    const boot = this.outlinedGear(
      new THREE.CylinderGeometry(0.066, 0.056, 0.46, 8),
      leatherMat,
    );
    boot.position.y = -0.23;
    kneePivot.add(boot);
  }

  private buildAshDissolvePool(): void {
    this.ashPoolGroup.visible = false;
    this.root.add(this.ashPoolGroup);

    const geo = this.trackGeo(new THREE.OctahedronGeometry(0.048, 0));
    const count = SPECIAL_SCENARIO_CONFIG.geraltAshParticleCount;

    for (let i = 0; i < count; i++) {
      const isEmber = i % 2 === 0;
      const mat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: isEmber ? PALETTE.ashEmber : PALETTE.drainedAshSilver,
          transparent: true,
          opacity: 0,
          blending: isEmber ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false,
        }),
      );
      const mesh = new THREE.Mesh(geo, mat);
      this.ashPoolGroup.add(mesh);
      this.ashPool.push({
        mesh,
        seedAngle: (i / count) * Math.PI * 2 + (i % 5) * 0.35,
        seedRadius: 0.16 + ((i * 37) % 100) * 0.0042,
        seedY: 0.18 + ((i * 53) % 100) * 0.0145,
        riseSpeed: 1.15 + (i % 4) * 0.38,
        swirlSpeed: (i % 2 === 0 ? 1 : -1) * (1.8 + (i % 3) * 0.7),
        isEmber,
      });
    }
  }

  /**
   * Flashes Geralt's left-palm Witcher Sign glyph emitter:
   * - `'IGNI'` (orange `#F97316`)
   * - `'QUEN'` (gold `#FACC15`)
   * - `'YRDEN'` (violet `#9333EA`)
   */
  public triggerSignFlash(sign: WitcherSignKind): void {
    this.activeSignKind = sign;
    this.signFlashTimer = 0.85;
    const hex =
      sign === 'IGNI'
        ? PALETTE.geraltIgniOrange
        : sign === 'YRDEN'
          ? PALETTE.geraltYrdenViolet
          : PALETTE.geraltQuenGold;
    this.signGlyphMat.color.setHex(hex);
    this.signRingMat.color.setHex(hex);
    this.signLight.color.setHex(hex);
  }

  public setExpression(_expression: BossExpression, _spiralPhase = 0): void {
    // Non-siphonable Witcher maintains hardened combat expression
  }

  public setPhaseVisuals(phase: BossPhase): void {
    this.auraRing.scale.setScalar(phase >= BOSS_PHASES.PHASE_2 ? 1.24 : 1.0);
  }

  public setAscendHeight(extraY: number): void {
    this.ascendHeight = extraY;
  }

  public triggerHitFlash(): void {
    this.hitFlashTimer = 0.14;
    this.triggerSignFlash('QUEN');
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
    this.signFlashTimer = Math.max(0, this.signFlashTimer - dt);

    const breathe = Math.sin(elapsed * 2.8) * 0.018;
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI)
        : 0;

    this.bodyPivot.position.set(0, 0.96 + breathe + this.ascendHeight, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(0.1 + flourish * 0.18, -0.18 + flourish * 0.35, 0);
    this.headGroup.rotation.set(-0.04, 0.16, 0);
    this.ponytailPivot.rotation.x = 0.18 + Math.sin(elapsed * 3.6) * 0.1;

    // Wide Witcher sword-fighting stance
    this.leftLegPivot.rotation.set(-0.24, 0, -0.09);
    this.rightLegPivot.rotation.set(0.24, 0, 0.09);
    this.leftKneePivot.rotation.x = 0.34;
    this.rightKneePivot.rotation.x = 0.24;

    // Left palm ready to cast Signs; right hand guards with silver longsword
    this.leftShoulderPivot.rotation.set(-0.62 - flourish * 0.72, 0.18, 0.26);
    this.leftElbowPivot.rotation.set(-0.76 + flourish * 0.42, 0, 0);
    this.rightShoulderPivot.rotation.set(-0.54 - flourish * 0.55, -0.24, -0.28);
    this.rightElbowPivot.rotation.set(-0.82 + flourish * 0.3, 0, 0);

    // Update Left-Palm Witcher Sign Glyph Emitter
    if (this.signFlashTimer > 0) {
      const env = Math.sin((this.signFlashTimer / 0.85) * Math.PI);
      const signScale = 0.8 + env * 0.65;
      this.signEmitterGroup.visible = true;
      this.signEmitterGroup.scale.setScalar(signScale);
      this.signEmitterGroup.rotation.z =
        elapsed * (this.activeSignKind === 'YRDEN' ? -4.5 : 5.2);
      this.signGlyphMat.opacity = env * 0.95;
      this.signRingMat.opacity = env * 0.72;
      this.signLight.intensity = env * 4.2;
    } else {
      this.signEmitterGroup.visible = false;
      this.signLight.intensity = 0;
    }

    this.auraRing.rotation.z = elapsed * 0.85;

    // Subtle hit flash tint
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
   * Lethal 1.6s Ash-Dissolve Animation at 0 HP:
   * Drops Geralt cleanly onto one knee while 36 pooled ash & ember particles swirl upward off his silhouette.
   */
  public override applyAshDissolve(progress: number): void {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const slump = p * p * (3 - 2 * p);

    this.bodyPivot.position.set(0, THREE.MathUtils.lerp(0.96, 0.44, slump), 0);
    this.torsoGroup.rotation.set(THREE.MathUtils.lerp(0.1, 0.52, slump), 0, 0);
    this.headGroup.rotation.set(THREE.MathUtils.lerp(-0.04, 0.44, slump), 0, 0);
    this.leftLegPivot.rotation.set(-0.92 * slump, 0, -0.1);
    this.leftKneePivot.rotation.x = 1.54 * slump;
    this.rightLegPivot.rotation.set(0.32 * slump, 0, 0.1);
    this.rightKneePivot.rotation.x = 1.36 * slump;
    this.leftShoulderPivot.rotation.set(0.18 * slump, 0, 0.38 * slump);
    this.rightShoulderPivot.rotation.set(-0.24 * slump, 0, -0.28 * slump);
    this.auraRing.visible = false;
    this.signEmitterGroup.visible = false;
    this.signLight.intensity = 0;

    // Drive pooled ash & ember particles swirling upward off his kneeling silhouette
    this.ashPoolGroup.visible = p > 0.01 && p < 0.995;
    for (let i = 0; i < this.ashPool.length; i++) {
      const pt = this.ashPool[i]!;
      const localP = THREE.MathUtils.clamp(p * 1.18 - (i % 6) * 0.04, 0, 1);
      const ang = pt.seedAngle + localP * pt.swirlSpeed * Math.PI;
      const r = pt.seedRadius * (1 + localP * 1.45);
      pt.mesh.position.set(
        Math.cos(ang) * r,
        pt.seedY * (1 - slump * 0.35) + localP * pt.riseSpeed * 1.5,
        Math.sin(ang) * r,
      );
      pt.mesh.rotation.set(localP * 6.0, localP * 4.5, 0);
      const env = Math.sin(localP * Math.PI);
      const s = (pt.isEmber ? 1.05 : 0.85) * (0.35 + env * 0.9);
      pt.mesh.scale.setScalar(s);
      pt.mesh.material.opacity = env * (pt.isEmber ? 0.95 : 0.72);
    }

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
    this.signFlashTimer = 0;
    this.ascendHeight = 0;
    this.auraRing.visible = true;
    this.ashPoolGroup.visible = false;
    this.signEmitterGroup.visible = false;
    this.signLight.intensity = 0;
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
    for (let i = 0; i < this.ownedTextures.length; i++) {
      this.ownedTextures[i]?.dispose();
    }
  }
}
