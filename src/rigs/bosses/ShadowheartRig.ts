import * as THREE from 'three';
import {
  ARENA_CONFIG,
  BALDURS_GATE_PARTY_CONFIG,
  BOSS_EXPRESSIONS,
  BOSS_PHASES,
  DRAIN_THROTTLE_MODES,
  FINISHER_CONFIG,
  FINISHER_POSE_IDS,
  FINISHER_RESISTANCE_CONFIG,
  GAME_STATES,
  PALETTE,
  SIPHON_GALLERY_CONFIG,
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

interface BraidSegment {
  readonly pivot: THREE.Group;
  readonly index: number;
}

interface TassetPanel {
  readonly pivot: THREE.Group;
  readonly angle: number;
}

/**
 * Cel-shaded procedural humanoid rig for **Shadowheart — Dark Justiciar Sovereign**
 * (siphonable Guest Sovereign in *Shadows of the Sharran Crypt* & Siphon Gallery Guest Pedestal 2).
 *
 * Clean cel-shading & silhouette rules:
 * - Procedural 3-step cel ramp (`ToonAssets.createThreeStepToonMaterial`)
 * - ZERO `BackSide` outlines on head, face, bangs, side locks, or braid meshes
 * - Strictly positive scales + `computeVertexNormals()` on all hair & braid geometry
 * - Classic jet-black hair (`#0F172A` + subtle deep-violet/slate cel rim) with straight-cut
 *   forehead bangs, face-framing side locks, half-elf pointed ears, and a 5-segment cascading
 *   black braid tied with silver hair-cuffs and sinusoidal sway
 * - Warm fair porcelain skin, low-set *Arcane Usurper* anime proportions, luminous emerald-green
 *   eyes (`#10B981`), subtle nose-bridge/cheek scar, and world-space `sovereignLipAnchor`
 * - Fitted obsidian-charcoal & deep-violet (`#1E293B` / `#4C1D95`) Sharran scale-and-plate armor
 *   with silver filigree, glowing dark-amethyst Sharran chest emblem, silver-obsidian mace (right),
 *   and Sharran kite shield (left)
 * - Smooth core drain bleach (`100% -> 0%`) desaturating emerald eyes, Sharran chest emblem, and
 *   black hair sheen into exhausted ash-silver (`#94A3B8`).
 */
export class ShadowheartRig extends BossBase {
  public readonly id = BALDURS_GATE_PARTY_CONFIG.shadowheartId;
  public readonly displayName = BALDURS_GATE_PARTY_CONFIG.shadowheartDisplayName;
  public readonly title = BALDURS_GATE_PARTY_CONFIG.shadowheartTitle;
  public readonly root = new THREE.Group();
  public readonly headAnchor = new THREE.Object3D();
  public readonly sovereignLipAnchor: THREE.Object3D = this.headAnchor;
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

  private readonly braidSegments: BraidSegment[] = [];
  private readonly sideLockPivots: THREE.Group[] = [];
  private readonly tassetPanels: TassetPanel[] = [];
  private readonly maceGroup = new THREE.Group();
  private readonly shieldGroup = new THREE.Group();
  private readonly silverHairCuffGroup = new THREE.Group();
  private readonly auraRing: THREE.Mesh;
  private readonly hairMat: THREE.MeshToonMaterial;
  private readonly sharranEmblemMat: THREE.MeshBasicMaterial;
  private readonly sharranEmblemLight: THREE.PointLight;

  private readonly faceCanvas: HTMLCanvasElement;
  private readonly faceCtx: CanvasRenderingContext2D | null;
  private readonly faceTexture: THREE.CanvasTexture;
  private currentExpression: BossExpression = BOSS_EXPRESSIONS.COMBAT;
  private currentDrainBleach = 0;
  private lastDrawnEyeBleach = -1;
  private lastSpiralPhase = 0;
  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private accessoryFlickTimer = 0;
  private tauntReactTimer = 0;
  private ascendHeight = 0;
  private captiveFaceTimer = 0;

  // Reusable scratch colors (zero per-frame allocations)
  private readonly emeraldEyeColor = new THREE.Color(
    PALETTE.shadowheartEmeraldEye,
  );
  private readonly emeraldGlowColor = new THREE.Color(
    PALETTE.shadowheartEmeraldGlow,
  );
  private readonly hairRimColor = new THREE.Color(PALETTE.shadowheartHairRim);
  private readonly emblemVioletColor = new THREE.Color(
    PALETTE.shadowheartEmblemGlow,
  );
  private readonly ashSilverColor = new THREE.Color(PALETTE.drainedAshSilver);
  private readonly scratchColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'ShadowheartRig';
    this.root.userData.managedByRig = true;

    // 512x512 Procedural Anime Face CanvasTexture
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = ARENA_CONFIG.faceTextureSize;
    this.faceCanvas.height = ARENA_CONFIG.faceTextureSize;
    this.faceCtx = this.faceCanvas.getContext('2d');
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = 4;
    this.ownedTextures.push(this.faceTexture);

    // 3-Step Cel-Shaded Materials
    const skinMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.shadowheartSkin),
    );
    this.hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.shadowheartHair, {
        emissive: PALETTE.shadowheartHairRim,
        emissiveIntensity: 0.24,
      }),
    );
    const armorDarkMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.shadowheartArmorDark, {
        emissive: PALETTE.shadowheartArmorViolet,
        emissiveIntensity: 0.14,
      }),
    );
    const armorVioletMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.shadowheartArmorViolet, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.22,
      }),
    );
    const silverTrimMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.silverRune, {
        emissive: PALETTE.sharranLunarSilver,
        emissiveIntensity: 0.18,
      }),
    );
    const darkGreaveMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.abyssalCloak),
    );
    this.sharranEmblemMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.shadowheartEmblemGlow }),
    );
    const faceMat = this.trackMat(
      new THREE.MeshToonMaterial({
        map: this.faceTexture,
        gradientMap: ToonAssets.getThreeStepToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: this.faceTexture,
        emissiveIntensity: 0.34,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
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

    // Pooled chest telegraph for 360° Frontal Guard-Break Stolen Kiss
    this.attachBlindspotGlint(this.torsoGroup);

    this.sharranEmblemLight = new THREE.PointLight(
      PALETTE.shadowheartEmblemGlow,
      1.35,
      2.6,
      2,
    );

    // Build Fitted Sharran Cleric Scale-and-Plate Armor Torso & Tassets
    this.buildSharranTorso(
      skinMat,
      armorDarkMat,
      armorVioletMat,
      silverTrimMat,
    );

    // Build Head, Anime Face, Straight-Cut Bangs, Half-Elf Ears & Long Segmented Black Braid
    this.buildHeadFaceAndBraid(skinMat, faceMat, silverTrimMat);

    // Build Armored Arms + Silver-Obsidian Mace (Right) & Sharran Kite Shield (Left)
    this.buildArm(-1, armorDarkMat, armorVioletMat, silverTrimMat, skinMat);
    this.buildArm(1, armorDarkMat, armorVioletMat, silverTrimMat, skinMat);
    this.buildSharranMace(armorDarkMat, silverTrimMat);
    this.buildSharranShield(armorDarkMat, armorVioletMat, silverTrimMat);

    // Build Armored Greaves & Legs
    this.buildLeg(-1, armorDarkMat, darkGreaveMat, silverTrimMat);
    this.buildLeg(1, armorDarkMat, darkGreaveMat, silverTrimMat);

    // Sharran Violet Aura Ring
    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.74, 0.92, 36)),
      auraMat,
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.04;
    this.root.add(this.auraRing);

    this.drawFace(BOSS_EXPRESSIONS.COMBAT, 0, 0);
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

  private outlinedArmor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    outlineScale: number | { x: number; y: number; z: number } = 1.04,
  ): THREE.Group {
    this.trackGeo(geo);
    return ToonAssets.createOutlinedMesh(geo, mat, outlineScale, true).group;
  }

  private buildSharranTorso(
    skinMat: THREE.Material,
    armorDarkMat: THREE.Material,
    armorVioletMat: THREE.Material,
    silverTrimMat: THREE.Material,
  ): void {
    // Fitted armored pelvis & hip foundation
    const pelvis = this.outlinedArmor(
      new THREE.CylinderGeometry(0.112, 0.142, 0.15, 14),
      armorDarkMat,
    );
    pelvis.position.y = 0.03;
    this.torsoGroup.add(pelvis);

    // Sculpted silver waist belt & Sharran buckle
    const belt = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.12, 0.017, 8, 22)),
      silverTrimMat,
    );
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 0.11;
    this.torsoGroup.add(belt);

    // Fitted scale-and-plate waist & lower ribcage
    const waist = this.outlinedArmor(
      new THREE.CylinderGeometry(0.128, 0.106, 0.19, 14),
      armorVioletMat,
    );
    waist.position.y = 0.21;
    this.torsoGroup.add(waist);

    // Upper obsidian cuirass breastplate
    const chest = this.outlinedArmor(
      new THREE.CylinderGeometry(0.156, 0.126, 0.22, 16),
      armorDarkMat,
    );
    chest.position.y = 0.39;
    this.torsoGroup.add(chest);

    // Subtle contoured armored bust plates with silver filigree trim
    const bustGeo = this.trackGeo(new THREE.SphereGeometry(0.088, 14, 12));
    for (let s = -1; s <= 1; s += 2) {
      const bust = new THREE.Mesh(bustGeo, armorDarkMat);
      bust.scale.set(1.02, 0.94, 0.88);
      bust.position.set(s * 0.068, 0.378, 0.088);
      this.torsoGroup.add(bust);
    }

    // Glowing Dark-Amethyst Sharran Disc Emblem centered on chestplate
    const emblemGroup = new THREE.Group();
    emblemGroup.position.set(0, 0.415, 0.158);
    const darkDisc = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.046, 0.046, 0.014, 20)),
      armorDarkMat,
    );
    darkDisc.rotation.x = Math.PI / 2;
    emblemGroup.add(darkDisc);

    const emblemRim = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.049, 0.0085, 8, 24)),
      this.sharranEmblemMat,
    );
    emblemGroup.add(emblemRim);

    const emblemSilverOuter = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.06, 0.0055, 6, 24)),
      silverTrimMat,
    );
    emblemGroup.add(emblemSilverOuter);

    this.sharranEmblemLight.position.set(0, 0, 0.08);
    emblemGroup.add(this.sharranEmblemLight);
    this.torsoGroup.add(emblemGroup);

    // Sculpted layered pauldrons with silver filigree edges
    const pauldronGeo = this.trackGeo(
      new THREE.SphereGeometry(0.092, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58),
    );
    for (let s = -1; s <= 1; s += 2) {
      const pGroup = new THREE.Group();
      pGroup.position.set(s * 0.195, 0.47, 0.0);
      pGroup.rotation.z = -s * 0.42;
      const pMain = new THREE.Mesh(pauldronGeo, armorVioletMat);
      pMain.scale.set(1.08, 0.85, 1.15);
      pGroup.add(pMain);

      const pTrim = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.086, 0.009, 6, 18)),
        silverTrimMat,
      );
      pTrim.rotation.x = Math.PI / 2;
      pTrim.position.y = 0.008;
      pGroup.add(pTrim);
      this.torsoGroup.add(pGroup);
    }

    // High Sharran silver-trimmed collar & graceful neck
    const gorget = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.088, 0.118, 0.068, 14)),
      armorVioletMat,
    );
    gorget.position.y = 0.505;
    this.torsoGroup.add(gorget);

    const neck = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.044, 0.052, 0.1, 12)),
      skinMat,
    );
    neck.position.y = 0.545;
    this.torsoGroup.add(neck);

    // Armored skirt tassets (6 overlapping deep-violet & obsidian panels with silver edging)
    const panelCount = 6;
    const panelGeo = this.trackGeo(new THREE.BoxGeometry(0.115, 0.44, 0.022));
    const trimGeo = this.trackGeo(new THREE.BoxGeometry(0.12, 0.022, 0.026));
    for (let i = 0; i < panelCount; i++) {
      const ang = (i / panelCount) * Math.PI * 2 + Math.PI / panelCount;
      const pivot = new THREE.Group();
      pivot.position.set(Math.sin(ang) * 0.132, 0.08, Math.cos(ang) * 0.132);
      pivot.rotation.y = ang;

      const plate = new THREE.Mesh(
        panelGeo,
        i % 2 === 0 ? armorDarkMat : armorVioletMat,
      );
      plate.position.set(0, -0.21, 0.02);
      plate.rotation.x = -0.14;
      pivot.add(plate);

      const hem = new THREE.Mesh(trimGeo, silverTrimMat);
      hem.position.set(0, -0.42, 0.048);
      pivot.add(hem);

      this.tassetPanels.push({ pivot, angle: ang });
      this.torsoGroup.add(pivot);
    }
  }

  /**
   * Builds Shadowheart's head, low-set anime face, half-elf pointed ears, signature
   * straight-cut forehead bangs, face-framing side locks, and 5-segment black braid
   * with silver hair-cuffs. Strictly ZERO `BackSide` outlines and ZERO negative scales.
   */
  private buildHeadFaceAndBraid(
    skinMat: THREE.Material,
    faceMat: THREE.Material,
    silverTrimMat: THREE.Material,
  ): void {
    this.headGroup.position.set(0, 0.515, 0.008);
    this.torsoGroup.add(this.headGroup);

    // Cranium + tapered anime chin (zero BackSide outline)
    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.132, 24, 22));
    headGeo.scale(0.95, 1.03, 0.96);
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.145;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Curved front anime face plane (zero BackSide outline)
    const faceGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.1345,
        22,
        18,
        Math.PI * 0.16,
        Math.PI * 0.68,
        Math.PI * 0.24,
        Math.PI * 0.54,
      ),
    );
    faceGeo.scale(0.95, 1.03, 0.96);
    faceGeo.computeVertexNormals();
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.y = 0.145;
    faceMesh.rotation.y = -Math.PI * 0.5;
    this.headGroup.add(faceMesh);

    // World-space lip contact anchor (`sovereignLipAnchor` === `headAnchor`)
    this.headAnchor.position.set(0, 0.141, 0.116);
    this.headGroup.add(this.headAnchor);

    // Delicate Half-Elf Pointed Ears peeking past her side locks (strictly positive scales)
    const earGeo = this.trackGeo(new THREE.ConeGeometry(0.022, 0.072, 6));
    earGeo.computeVertexNormals();
    for (let s = -1; s <= 1; s += 2) {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.position.set(s * 0.128, 0.142, -0.006);
      ear.rotation.set(0.12, s * 0.34, -s * 1.18);
      this.headGroup.add(ear);
    }

    // Smooth jet-black hair crown dome (zero BackSide outline, positive scale)
    const crownGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.144,
        24,
        18,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.62,
      ),
    );
    crownGeo.scale(0.98, 1.04, 1.02);
    crownGeo.computeVertexNormals();
    const crownMesh = new THREE.Mesh(crownGeo, this.hairMat);
    crownMesh.position.set(0, 0.155, -0.006);
    crownMesh.castShadow = true;
    this.headGroup.add(crownMesh);

    // Back occipital hair shell framing the nape
    const backCapGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.142,
        20,
        16,
        Math.PI * 0.72,
        Math.PI * 1.56,
        Math.PI * 0.25,
        Math.PI * 0.55,
      ),
    );
    backCapGeo.computeVertexNormals();
    const backCap = new THREE.Mesh(backCapGeo, this.hairMat);
    backCap.position.set(0, 0.148, -0.012);
    this.headGroup.add(backCap);

    // Signature Straight-Cut Forehead Bangs positioned cleanly above her brow line
    // Built from 5 tightly aligned positively-scaled flat-hem panels curving gently across the brow
    const bangCenterGeo = this.trackGeo(new THREE.BoxGeometry(0.056, 0.068, 0.024));
    bangCenterGeo.computeVertexNormals();
    const bangSpecs = [
      { x: -0.078, z: 0.114, rotY: -0.44, w: 0.88, h: 1.04 },
      { x: -0.04, z: 0.128, rotY: -0.2, w: 1.0, h: 1.0 },
      { x: 0.0, z: 0.134, rotY: 0.0, w: 1.06, h: 0.98 },
      { x: 0.04, z: 0.128, rotY: 0.2, w: 1.0, h: 1.0 },
      { x: 0.078, z: 0.114, rotY: 0.44, w: 0.88, h: 1.04 },
    ];
    for (let i = 0; i < bangSpecs.length; i++) {
      const sp = bangSpecs[i]!;
      const bang = new THREE.Mesh(bangCenterGeo, this.hairMat);
      bang.scale.set(sp.w, sp.h, 1.0);
      bang.position.set(sp.x, 0.214, sp.z);
      bang.rotation.set(-0.18, sp.rotY, 0);
      this.headGroup.add(bang);
    }

    // Face-Framing Side Locks (left & right — strictly positive scales, zero mirroring!)
    const sideLockUpperGeo = this.trackGeo(
      new THREE.CylinderGeometry(0.022, 0.018, 0.16, 10),
    );
    sideLockUpperGeo.computeVertexNormals();
    const sideLockTipGeo = this.trackGeo(new THREE.ConeGeometry(0.018, 0.11, 8));
    sideLockTipGeo.computeVertexNormals();

    for (let s = -1; s <= 1; s += 2) {
      const lockPivot = new THREE.Group();
      lockPivot.position.set(s * 0.114, 0.19, 0.064);

      const upper = new THREE.Mesh(sideLockUpperGeo, this.hairMat);
      upper.position.set(0, -0.075, 0.008);
      upper.rotation.z = s * 0.06;
      lockPivot.add(upper);

      const tip = new THREE.Mesh(sideLockTipGeo, this.hairMat);
      tip.position.set(s * 0.008, -0.195, 0.012);
      tip.rotation.x = Math.PI;
      lockPivot.add(tip);

      this.sideLockPivots.push(lockPivot);
      this.headGroup.add(lockPivot);
    }

    // Iconic Silver Hair-Cuff Circlet Crown / Braid Ornament (target for [F] flick taunt!)
    this.silverHairCuffGroup.position.set(0, 0.255, -0.055);
    const circletBand = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.098, 0.009, 8, 22, Math.PI * 1.25)),
      silverTrimMat,
    );
    circletBand.rotation.set(Math.PI * 0.56, 0, Math.PI * 0.375);
    this.silverHairCuffGroup.add(circletBand);

    const crestGem = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.019, 0)),
      this.sharranEmblemMat,
    );
    crestGem.position.set(0, 0.032, 0.088);
    this.silverHairCuffGroup.add(crestGem);

    this.headGroup.add(this.silverHairCuffGroup);
    this.headAccessory.position.set(0, 0.035, 0.085);
    this.silverHairCuffGroup.add(this.headAccessory);

    // Long 5-Segment Cascading Black Braid tied with gleaming silver hair-cuffs
    const braidAnchor = new THREE.Group();
    braidAnchor.position.set(0, 0.11, -0.135);
    this.headGroup.add(braidAnchor);

    let parentGroup: THREE.Group = braidAnchor;
    const segCount = 5;
    const braidRadii = [0.052, 0.047, 0.042, 0.036, 0.028];
    const segLengths = [0.165, 0.165, 0.16, 0.155, 0.145];

    for (let i = 0; i < segCount; i++) {
      const segPivot = new THREE.Group();
      segPivot.position.set(0, i === 0 ? 0 : -segLengths[i - 1]!, 0);
      parentGroup.add(segPivot);

      const r = braidRadii[i]!;
      const len = segLengths[i]!;

      // Woven criss-cross dual plait bulbs (positive scales + computed normals)
      const plaitGeo = this.trackGeo(new THREE.SphereGeometry(r, 12, 10));
      plaitGeo.scale(1.06, len / (r * 1.65), 0.86);
      plaitGeo.computeVertexNormals();
      const plaitMesh = new THREE.Mesh(plaitGeo, this.hairMat);
      plaitMesh.position.set(0, -len * 0.48, -0.008);
      plaitMesh.castShadow = true;
      segPivot.add(plaitMesh);

      // Gleaming silver hair-cuff clasp between braid segments
      const cuff = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(r * 0.92, r * 0.92, 0.022, 12)),
        silverTrimMat,
      );
      cuff.position.set(0, -len * 0.92, -0.008);
      segPivot.add(cuff);

      if (i === segCount - 1) {
        const tailTipGeo = this.trackGeo(new THREE.ConeGeometry(r * 0.9, 0.13, 8));
        tailTipGeo.computeVertexNormals();
        const tailTip = new THREE.Mesh(tailTipGeo, this.hairMat);
        tailTip.rotation.x = Math.PI;
        tailTip.position.set(0, -len - 0.055, -0.008);
        segPivot.add(tailTip);
      }

      this.braidSegments.push({ pivot: segPivot, index: i });
      parentGroup = segPivot;
    }
  }

  private buildArm(
    side: -1 | 1,
    armorDarkMat: THREE.Material,
    armorVioletMat: THREE.Material,
    silverTrimMat: THREE.Material,
    skinMat: THREE.Material,
  ): void {
    const shoulder =
      side === -1 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side === -1 ? this.leftElbowPivot : this.rightElbowPivot;
    const handAnchor = side === -1 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.195, 0.455, 0);
    this.torsoGroup.add(shoulder);

    const upperArm = this.outlinedArmor(
      new THREE.CylinderGeometry(0.044, 0.038, 0.27, 10),
      armorDarkMat,
    );
    upperArm.position.y = -0.135;
    shoulder.add(upperArm);

    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);

    const vambrace = this.outlinedArmor(
      new THREE.CylinderGeometry(0.04, 0.034, 0.24, 10),
      armorVioletMat,
    );
    vambrace.position.y = -0.12;
    elbow.add(vambrace);

    const wristCuff = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.036, 0.008, 6, 14)),
      silverTrimMat,
    );
    wristCuff.rotation.x = Math.PI / 2;
    wristCuff.position.y = -0.22;
    elbow.add(wristCuff);

    const hand = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.032, 10, 8)),
      skinMat,
    );
    hand.position.y = -0.255;
    elbow.add(hand);

    handAnchor.position.set(0, -0.255, 0);
    elbow.add(handAnchor);
  }

  private buildSharranMace(
    armorDarkMat: THREE.Material,
    silverTrimMat: THREE.Material,
  ): void {
    this.maceGroup.position.set(0, -0.255, 0.04);
    this.maceGroup.rotation.set(Math.PI * 0.42, 0, 0);

    const haft = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.017, 0.015, 0.64, 8)),
      armorDarkMat,
    );
    haft.position.y = 0.22;
    this.maceGroup.add(haft);

    const pommel = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.028, 0)),
      silverTrimMat,
    );
    pommel.position.y = -0.11;
    this.maceGroup.add(pommel);

    const headCore = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.062, 10, 8)),
      armorDarkMat,
    );
    headCore.position.y = 0.54;
    this.maceGroup.add(headCore);

    // 6 silver flanged Sharran blades around mace head
    const flangeGeo = this.trackGeo(new THREE.BoxGeometry(0.016, 0.16, 0.075));
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      const flange = new THREE.Mesh(flangeGeo, silverTrimMat);
      flange.position.set(Math.sin(ang) * 0.056, 0.54, Math.cos(ang) * 0.056);
      flange.rotation.y = ang;
      this.maceGroup.add(flange);
    }

    const tipGem = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.032, 0.095, 6)),
      this.sharranEmblemMat,
    );
    tipGem.position.y = 0.645;
    this.maceGroup.add(tipGem);

    this.rightElbowPivot.add(this.maceGroup);
  }

  private buildSharranShield(
    armorDarkMat: THREE.Material,
    armorVioletMat: THREE.Material,
    silverTrimMat: THREE.Material,
  ): void {
    this.shieldGroup.position.set(-0.06, -0.16, 0.05);
    this.shieldGroup.rotation.set(0.18, -Math.PI * 0.42, 0.08);

    // Stylized kite shield body
    const upperBody = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.38, 0.34, 0.032)),
      armorDarkMat,
    );
    upperBody.position.y = 0.08;
    this.shieldGroup.add(upperBody);

    const lowerPoint = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.24, 0.34, 4)),
      armorVioletMat,
    );
    lowerPoint.rotation.set(Math.PI, Math.PI * 0.25, 0);
    lowerPoint.scale.set(1.12, 1.0, 0.16);
    lowerPoint.position.y = -0.25;
    this.shieldGroup.add(lowerPoint);

    // Silver kite border & glowing Sharran dark-moon disc boss
    const borderTop = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.41, 0.032, 0.042)),
      silverTrimMat,
    );
    borderTop.position.y = 0.255;
    this.shieldGroup.add(borderTop);

    const shieldBoss = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.082, 0.014, 8, 22)),
      this.sharranEmblemMat,
    );
    shieldBoss.position.set(0, 0.02, 0.025);
    this.shieldGroup.add(shieldBoss);

    this.leftElbowPivot.add(this.shieldGroup);
  }

  private buildLeg(
    side: -1 | 1,
    armorDarkMat: THREE.Material,
    darkGreaveMat: THREE.Material,
    silverTrimMat: THREE.Material,
  ): void {
    const legPivot = side === -1 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side === -1 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.095, -0.02, 0);
    this.bodyPivot.add(legPivot);

    const thigh = this.outlinedArmor(
      new THREE.CylinderGeometry(0.068, 0.056, 0.42, 12),
      armorDarkMat,
    );
    thigh.position.y = -0.21;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.42, 0);
    legPivot.add(kneePivot);

    const kneeGuard = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.054, 0)),
      silverTrimMat,
    );
    kneeGuard.position.set(0, 0.01, 0.048);
    kneePivot.add(kneeGuard);

    const greave = this.outlinedArmor(
      new THREE.CylinderGeometry(0.054, 0.04, 0.43, 12),
      darkGreaveMat,
    );
    greave.position.y = -0.215;
    kneePivot.add(greave);

    const bootFoot = this.outlinedArmor(
      new THREE.BoxGeometry(0.072, 0.058, 0.145),
      darkGreaveMat,
      1.05,
    );
    bootFoot.position.set(0, -0.43, 0.036);
    kneePivot.add(bootFoot);
  }

  /**
   * Draws Shadowheart's 512x512 low-set *Arcane Usurper* anime face texture with
   * luminous emerald-green eyes (#10B981 -> #94A3B8 on core drain), subtle scar
   * across her nose bridge/cheek, dark lashes, and catchlights.
   */
  private drawFace(
    expression: BossExpression,
    spiralPhase: number,
    bleach: number,
  ): void {
    const ctx = this.faceCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 512);

    const clampedBleach = THREE.MathUtils.clamp(bleach, 0, 1);
    this.scratchColor
      .copy(this.emeraldEyeColor)
      .lerp(this.ashSilverColor, clampedBleach);
    const irisHex = `#${this.scratchColor.getHexString()}`;

    this.scratchColor
      .copy(this.emeraldGlowColor)
      .lerp(this.ashSilverColor, clampedBleach);
    const lowerIrisHex = `#${this.scratchColor.getHexString()}`;

    const eyeY = 278;
    const eyeXs = [174, 338];

    const isTauntGlare =
      expression === BOSS_EXPRESSIONS.DRAINED_FAINT &&
      this.tauntReactTimer > 0 &&
      clampedBleach < WOLF_AND_RAVEN_CONFIG.yenneferTauntGlareThreshold;
    const isTauntBreathlessFlush =
      expression === BOSS_EXPRESSIONS.DRAINED_FAINT &&
      this.tauntReactTimer > 0 &&
      clampedBleach >= WOLF_AND_RAVEN_CONFIG.yenneferTauntGlareThreshold;

    // Rose blush intensifying during siphon & late-drain taunt
    const blushAlpha = isTauntBreathlessFlush
      ? 0.44 + Math.min(0.14, (clampedBleach - 0.55) * 0.32)
      : expression === BOSS_EXPRESSIONS.SIPHON_KISS
        ? 0.28 + clampedBleach * 0.24
        : expression === BOSS_EXPRESSIONS.DRAINED_FAINT
          ? isTauntGlare
            ? 0.22
            : 0.38
          : expression === BOSS_EXPRESSIONS.STAGGER
            ? 0.24
            : 0.14;
    ctx.fillStyle = `rgba(244, 63, 94, ${blushAlpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(150, 328, 38, 17, 0, 0, Math.PI * 2);
    ctx.ellipse(362, 328, 38, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    // Subtle signature scar mark across her nose bridge & right cheek
    ctx.strokeStyle = PALETTE.hex.shadowheartScar;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(234, 294);
    ctx.quadraticCurveTo(286, 306, 344, 334);
    ctx.stroke();

    if (isTauntGlare) {
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 3, 44, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = irisHex;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 3, 24, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.shadowheartHair;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 3, 9, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 9, eyeY - 2, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.shadowheartHair;
        ctx.lineWidth = 11;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 48, eyeY - 12);
        ctx.quadraticCurveTo(cx, eyeY - 18, cx + 48, eyeY - 8);
        ctx.stroke();
      }
    } else if (expression === BOSS_EXPRESSIONS.DRAINED_FAINT && !isTauntBreathlessFlush) {
      // Spinning @_@ dizzy spirals
      ctx.strokeStyle = irisHex;
      ctx.lineWidth = 6;
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        ctx.beginPath();
        for (let a = 0; a < 18; a++) {
          const theta = a * 0.55 + spiralPhase;
          const r = 4 + a * 1.85;
          const px = cx + Math.cos(theta) * r;
          const py = eyeY + Math.sin(theta) * r;
          if (a === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      // Eyes-Closed Bliss curved dark lashes
      ctx.strokeStyle = PALETTE.hex.shadowheartHair;
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
      // Luminous Emerald-Green Anime Eyes (Combat / Stagger / Breathless Flush)
      const isStagger = expression === BOSS_EXPRESSIONS.STAGGER;
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        const halfH = isTauntBreathlessFlush ? 20 : isStagger ? 35 : 30;

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 44, halfH, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = irisHex;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 2, 27, Math.min(26, halfH - 2), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = lowerIrisHex;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 13, 17, 9, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.shadowheartHair;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 3, 10, 0, Math.PI * 2);
        ctx.fill();

        // Crisp white catchlights
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 11, eyeY - 8, 7.5, 0, Math.PI * 2);
        ctx.arc(cx + 12, eyeY + 10, 4.2, 0, Math.PI * 2);
        ctx.fill();

        // Upper lash line
        ctx.strokeStyle = PALETTE.hex.shadowheartHair;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 46, eyeY - 12);
        ctx.quadraticCurveTo(cx, eyeY - 34, cx + 46, eyeY - 10);
        ctx.stroke();
      }
    }

    // Defined dark brows
    ctx.strokeStyle = PALETTE.hex.shadowheartHair;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (let e = 0; e < eyeXs.length; e++) {
      const cx = eyeXs[e]!;
      const dir = e === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(cx - 34 * dir, eyeY - 46);
      ctx.quadraticCurveTo(cx, eyeY - 54, cx + 34 * dir, eyeY - 42);
      ctx.stroke();
    }

    // Delicate nose dot
    ctx.fillStyle = PALETTE.rgba.noseTint;
    ctx.beginPath();
    ctx.arc(256, 336, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Expressive anime lips
    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      ctx.strokeStyle = PALETTE.hex.lipRose;
      ctx.lineWidth = 6.5;
      ctx.beginPath();
      ctx.moveTo(232, 376);
      ctx.quadraticCurveTo(256, 386, 282, 372);
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      ctx.fillStyle = PALETTE.hex.lipRose;
      ctx.beginPath();
      ctx.ellipse(256, 376, 15, 10, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.hex.deepLipBerry;
      ctx.beginPath();
      ctx.ellipse(256, 376, 16, 11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.faceTexture.needsUpdate = true;
    this.lastDrawnEyeBleach = clampedBleach;
    this.lastSpiralPhase = spiralPhase;
  }

  private animateBraid(
    elapsed: number,
    swayAmp: number,
    basePitch: number,
  ): void {
    for (let i = 0; i < this.braidSegments.length; i++) {
      const seg = this.braidSegments[i]!;
      const wave = Math.sin(elapsed * 2.5 - seg.index * 0.72) * swayAmp;
      seg.pivot.rotation.x = i === 0 ? basePitch + wave * 0.6 : 0.08 + wave * 0.85;
      seg.pivot.rotation.z = Math.cos(elapsed * 1.9 - seg.index * 0.65) * swayAmp * 0.9;
    }
    for (let i = 0; i < this.sideLockPivots.length; i++) {
      const lock = this.sideLockPivots[i]!;
      const side = i === 0 ? -1 : 1;
      lock.rotation.x = Math.sin(elapsed * 2.2 + i) * swayAmp * 0.4;
      lock.rotation.z = side * 0.05 + Math.cos(elapsed * 2.0 + i) * swayAmp * 0.35;
    }
  }

  public setExpression(expression: BossExpression, spiralPhase = 0): void {
    this.currentExpression = expression;
    this.drawFace(expression, spiralPhase, this.currentDrainBleach);
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
    this.tauntReactTimer = FINISHER_CONFIG.tauntDizzyDuration;
  }

  public getLeftHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.leftHandAnchor.getWorldPosition(outVec);
  }

  public getRightHandWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.rightHandAnchor.getWorldPosition(outVec);
  }

  public getSovereignLipWorldPosition(outVec: THREE.Vector3): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return this.sovereignLipAnchor.getWorldPosition(outVec);
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

    const breathe = Math.sin(elapsed * 2.5) * 0.025 * (1 - s);
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI)
        : 0;

    this.maceGroup.visible = true;
    this.shieldGroup.visible = true;

    this.bodyPivot.position.set(
      0,
      THREE.MathUtils.lerp(0.92 + breathe + this.ascendHeight, 0.48, s),
      0,
    );
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(THREE.MathUtils.lerp(0.05, 0.22, s), 0, 0);
    this.headGroup.rotation.set(THREE.MathUtils.lerp(0.02, 0.26, s), 0, 0);

    this.leftLegPivot.rotation.set(THREE.MathUtils.lerp(-0.1, -0.78, s), 0, -0.07);
    this.rightLegPivot.rotation.set(THREE.MathUtils.lerp(0.1, -0.78, s), 0, 0.07);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(0.18, 1.56, s);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(0.18, 1.56, s);

    // Shield raised defensively on left, Sharran mace ready on right
    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.52 - flourish * 0.35, 0.14, s),
      0.24,
      THREE.MathUtils.lerp(0.26, 0.18, s),
    );
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.46 - flourish * 0.92, 0.14, s),
      -0.16,
      THREE.MathUtils.lerp(-0.24, -0.18, s),
    );
    this.leftElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.82, -0.4, s), 0, 0);
    this.rightElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.66, -0.4, s), 0, 0);

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

    for (let i = 0; i < this.tassetPanels.length; i++) {
      const tp = this.tassetPanels[i]!;
      tp.pivot.rotation.x =
        Math.sin(elapsed * 2.6 + tp.angle * 2) * 0.04 * (1 - s) - s * 0.36;
    }

    this.animateBraid(elapsed, 0.08 * (1 - s * 0.6), 0.14);
    this.auraRing.visible = s < 0.85;
    this.auraRing.rotation.z = elapsed * 0.85;

    if (this.hitFlashTimer > 0) {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        if (m) m.emissiveIntensity = 1.25;
      }
    } else {
      for (let i = 0; i < this.drainableMaterials.length; i++) {
        const m = this.drainableMaterials[i];
        const meta = this.bleachMetadata[i];
        if (m && meta) m.emissiveIntensity = meta.originalEmissiveIntensity;
      }
    }
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

    this.applyDrainBleach(drainProgress);
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;

    // Stow mace & shield cleanly during close-range embrace so zero weapon clipping occurs
    this.maceGroup.visible = false;
    this.shieldGroup.visible = false;
    this.auraRing.visible = false;

    this.accessoryFlickTimer = Math.max(0, this.accessoryFlickTimer - dt);
    this.tauntReactTimer = isTauntStunned
      ? Math.max(this.tauntReactTimer - dt, 0.05)
      : Math.max(0, this.tauntReactTimer - dt);
    this.silverHairCuffGroup.rotation.z =
      this.accessoryFlickTimer > 0
        ? Math.sin(this.accessoryFlickTimer * 28) * 0.38 * this.accessoryFlickTimer
        : 0;

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
      0.141,
      0.116 + (headChoreography?.bossFaceNormalOffset ?? 0),
    );

    this.leftLegPivot.rotation.set(-0.78, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.78, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;

    this.leftShoulderPivot.rotation.set(arm.leftShoulderX, 0, arm.leftShoulderZ);
    this.rightShoulderPivot.rotation.set(arm.rightShoulderX, 0, arm.rightShoulderZ);
    this.leftElbowPivot.rotation.set(arm.leftElbowX, 0, arm.leftElbowZ);
    this.rightElbowPivot.rotation.set(arm.rightElbowX, 0, arm.rightElbowZ);

    for (let i = 0; i < this.tassetPanels.length; i++) {
      this.tassetPanels[i]!.pivot.rotation.x = -0.36;
    }

    // Gravity-responsive braid drape during Ballroom Dip [2]
    const totalHeadTiltX =
      dipTorsoX + res.spineResistanceOffset + spinePullBack + headPitch;
    const braidPitch = isDip ? -totalHeadTiltX * 0.88 : 0.14;
    this.animateBraid(time, isSurge ? 0.1 : 0.045, braidPitch);
    this.root.updateMatrixWorld(true);
  }

  public applyBeamFinisherPose(drainProgress: number, time: number): void {
    const p = this.computeBeamShieldPose(drainProgress, time);
    this.applyDrainBleach(drainProgress);
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.maceGroup.visible = false;
    this.shieldGroup.visible = false;
    this.auraRing.visible = false;
    this.bodyPivot.position.set(0, p.bodyY, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(p.torsoX, 0, p.torsoZ);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(p.headX, p.headY, p.headZ);
    this.headAnchor.position.set(0, 0.141, 0.116);
    this.leftLegPivot.rotation.set(-0.78, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.78, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;
    this.leftShoulderPivot.rotation.set(p.leftShoulderX, 0, p.leftShoulderZ);
    this.leftElbowPivot.rotation.set(p.leftElbowX, 0, p.leftElbowZ);
    this.rightShoulderPivot.rotation.set(p.rightShoulderX, 0, p.rightShoulderZ);
    this.rightElbowPivot.rotation.set(p.rightElbowX, 0, 0);
    this.animateBraid(time, 0.1, 0.22);
  }

  public applyStolenKissPose(
    beat: 1 | 2 | 3,
    beatProgress: number,
    time: number,
  ): void {
    const p = this.computeStolenKissBossPose(beat, beatProgress, time);
    this.maceGroup.visible = false;
    this.shieldGroup.visible = false;
    this.auraRing.visible = beat === 3;
    this.auraRing.scale.setScalar(1.0 + p.flareFactor * 1.4);

    this.bodyPivot.position.set(0, p.bodyY, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(p.torsoX, 0, p.torsoZ);
    this.headGroup.rotation.set(p.headX, p.headY, p.headZ);
    this.headAnchor.position.set(0, 0.141, 0.116 + p.headFaceNormalOffset);

    this.leftLegPivot.rotation.set(0.06, 0, -0.06);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.06);
    this.leftKneePivot.rotation.x = 0.14;
    this.rightKneePivot.rotation.x = 0.18;

    this.leftShoulderPivot.rotation.set(p.leftShoulderX, 0, p.leftShoulderZ);
    this.leftElbowPivot.rotation.set(p.leftElbowX, 0, p.leftElbowZ);
    this.rightShoulderPivot.rotation.set(p.rightShoulderX, 0, p.rightShoulderZ);
    this.rightElbowPivot.rotation.set(p.rightElbowX, 0, p.rightElbowZ);
    this.animateBraid(time, 0.07, 0.16);
    this.root.updateMatrixWorld(true);
  }

  public applyVictoryCollapsePose(time: number): void {
    this.auraRing.visible = false;
    this.maceGroup.visible = false;
    this.shieldGroup.visible = false;
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
    this.animateBraid(time, 0.025, 0.24);
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

  public override resetUprightPosture(targetYaw: number): void {
    super.resetUprightPosture(targetYaw);
    this.accessoryFlickTimer = 0;
    this.tauntReactTimer = 0;
    this.bodyPivot.position.set(0, SIPHON_GALLERY_CONFIG.captiveKneelBodyY, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(0, 0, 0);
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(0, 0, 0);
    this.headAnchor.position.set(0, 0.141, 0.116);
    this.silverHairCuffGroup.rotation.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
  }

  public applyCaptiveDaisPose(charge: number, time: number, dt: number): void {
    const c = THREE.MathUtils.clamp(charge, 0, 1);
    this.resetResistanceState();
    this.resetBlindspotState();
    this.root.rotation.x = 0;
    this.root.rotation.z = 0;
    this.auraRing.visible = false;
    this.maceGroup.visible = false;
    this.shieldGroup.visible = false;
    this.applyDrainBleach(1 - c);
    this.silverHairCuffGroup.rotation.set(0, 0, 0);

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
    this.headGroup.position.set(0, 0.515, 0.008);
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(
        SIPHON_GALLERY_CONFIG.captiveHeadDroopMax,
        SIPHON_GALLERY_CONFIG.captiveHeadLiftMin,
        c,
      ),
      Math.sin(time * 0.9) * 0.06,
      0,
    );
    this.headAnchor.position.set(0, 0.141, 0.116);
    this.leftLegPivot.rotation.set(-0.8, 0, -0.08);
    this.rightLegPivot.rotation.set(-0.8, 0, 0.08);
    this.leftKneePivot.rotation.x = 1.56;
    this.rightKneePivot.rotation.x = 1.56;

    this.leftShoulderPivot.rotation.set(-0.92, 0.22, -0.78);
    this.rightShoulderPivot.rotation.set(-0.92, -0.22, 0.78);
    this.leftElbowPivot.rotation.set(-0.46, 0, 0);
    this.rightElbowPivot.rotation.set(-0.46, 0, 0);
    this.animateBraid(time, 0.035, 0.16);

    this.captiveFaceTimer += dt;
    if (
      this.captiveFaceTimer >= SIPHON_GALLERY_CONFIG.captiveFaceRedrawIntervalSec
    ) {
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

  /**
   * Core Drain Bleach (100% -> 0%): smoothly desaturates Shadowheart's emerald eyes,
   * Sharran chest emblem, and jet-black hair sheen into exhausted ash-silver (#94A3B8).
   */
  public applyDrainBleach(drainProgress: number): void {
    const t = THREE.MathUtils.clamp(drainProgress, 0, 1);
    this.currentDrainBleach = t;

    applyMaterialBleach(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
      t,
    );

    // Lerp hair deep-violet/slate sheen -> ash-silver
    this.hairMat.emissive.copy(this.hairRimColor).lerp(this.ashSilverColor, t);
    this.hairMat.emissiveIntensity = THREE.MathUtils.lerp(0.24, 0.06, t);

    // Lerp Sharran chest emblem glow -> exhausted ash-silver
    this.sharranEmblemMat.color
      .copy(this.emblemVioletColor)
      .lerp(this.ashSilverColor, t);
    this.sharranEmblemLight.intensity = 1.35 * (1 - t);

    if (Math.abs(t - this.lastDrawnEyeBleach) >= 0.04) {
      this.drawFace(this.currentExpression, this.lastSpiralPhase, t);
    }
  }

  public resetForEncounter(_encoreTier: number): void {
    this.resetAshDissolve();
    this.resetBlindspotState();
    this.currentDrainBleach = 0;
    this.lastDrawnEyeBleach = -1;
    this.hitFlashTimer = 0;
    this.castFlourishTimer = 0;
    this.accessoryFlickTimer = 0;
    this.tauntReactTimer = 0;
    this.ascendHeight = 0;
    this.maceGroup.visible = true;
    this.shieldGroup.visible = true;
    this.auraRing.visible = true;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
    this.sharranEmblemMat.color.copy(this.emblemVioletColor);
    this.sharranEmblemLight.intensity = 1.35;
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
