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

interface SCurveHairLock {
  readonly rootPivot: THREE.Group;
  readonly midPivot: THREE.Group;
  readonly phase: number;
  readonly spread: number;
  readonly baseX: number;
}

interface CoatSkirtPanel {
  readonly pivot: THREE.Group;
  readonly basePitch: number;
  readonly angle: number;
}

/**
 * Cel-shaded procedural humanoid rig for **Yennefer of Vengerberg — Sorceress of Obsidian & Lilac**
 * (siphonable Guest Sovereign in *The Wolf & The Raven* & Siphon Gallery Guest Pedestal 1).
 *
 * Strictly honors clean cel-shading rules:
 * - Procedural 3-step cel ramp (`ToonAssets.createThreeStepToonMaterial`)
 * - ZERO `BackSide` outline meshes on head, face, or hair strands
 * - ZERO negative `scale.x = -1` mirroring on hair geometry — strictly positive scales &
 *   `computeVertexNormals()` so wavy raven-black hair (`#111827`) exhibits crisp deep-violet (`#6D28D9`)
 *   cel highlights with zero black artifacts
 * - Warm porcelain skin (`#FDE4D6`), *Arcane Usurper* low-set anime proportions, luminous violet eyes
 *   (`#A855F7`), haughty smirk (`[Sovereign Glare]`), `[Eyes-Closed Bliss]`, and `sovereignLipAnchor`
 * - *The Witcher 3: Wild Hunt* attire: black velvet choker + 5-point obsidian star medallion,
 *   high-collared dark-feather shoulder mantle (`#1E293B`/`#0F172A`), white ruffled blouse,
 *   black laced corset bodice with silver trim, asymmetric split black-and-white coat-skirt,
 *   and thigh-high black leather riding boots with silver buckles
 * - Smooth core drain bleach (`100% -> 0%`) lerping violet eyes, obsidian star glow, and hair sheen
 *   into exhausted ash-silver (`#94A3B8`).
 */
export class YenneferRig extends BossBase {
  public readonly id = SPECIAL_SCENARIO_CONFIG.yenneferId;
  public readonly displayName = SPECIAL_SCENARIO_CONFIG.yenneferDisplayName;
  public readonly title = SPECIAL_SCENARIO_CONFIG.yenneferTitle;
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

  private readonly hairLocks: SCurveHairLock[] = [];
  private readonly coatPanels: CoatSkirtPanel[] = [];
  private readonly auraRing: THREE.Mesh;
  private readonly maelstromGroup = new THREE.Group();
  private readonly maelstromOuterMat: THREE.MeshBasicMaterial;
  private readonly maelstromInnerMat: THREE.MeshBasicMaterial;
  private maelstromCharge = 0;
  private riftArrivePulseTimer = 0;
  private readonly starMedallionGroup = new THREE.Group();
  private readonly starCoreMat: THREE.MeshBasicMaterial;
  private readonly starLight: THREE.PointLight;
  private readonly hairMat: THREE.MeshToonMaterial;

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
  private ascendHeight = 0;
  private captiveFaceTimer = 0;

  // Reusable scratch colors (zero per-frame allocations)
  private readonly violetEyeColor = new THREE.Color(PALETTE.yenneferVioletEye);
  private readonly lilacStarColor = new THREE.Color(PALETTE.yenneferLilac);
  private readonly hairHighlightColor = new THREE.Color(
    PALETTE.yenneferHairHighlight,
  );
  private readonly ashSilverColor = new THREE.Color(PALETTE.drainedAshSilver);
  private readonly scratchColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'YenneferRig';
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
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferSkin),
    );
    this.hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferRaven, {
        emissive: PALETTE.yenneferHairHighlight,
        emissiveIntensity: 0.28,
      }),
    );
    const velvetMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferVelvet, {
        emissive: PALETTE.yenneferHairHighlight,
        emissiveIntensity: 0.14,
      }),
    );
    const featherDarkMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferFeatherDark, {
        emissive: PALETTE.yenneferHairHighlight,
        emissiveIntensity: 0.16,
      }),
    );
    const featherSlateMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferFeatherSlate, {
        emissive: PALETTE.amethystTrim,
        emissiveIntensity: 0.12,
      }),
    );
    const blouseWhiteMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.yenneferLace),
    );
    const silverTrimMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.silverRune, {
        emissive: PALETTE.iceHighlights,
        emissiveIntensity: 0.14,
      }),
    );
    const bootLeatherMat = this.trackMat(
      ToonAssets.createThreeStepToonMaterial(PALETTE.abyssalCloak),
    );
    this.starCoreMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: PALETTE.yenneferLilac }),
    );
    const faceMat = this.trackMat(
      new THREE.MeshToonMaterial({
        map: this.faceTexture,
        gradientMap: ToonAssets.getThreeStepToonGradientMap(),
        transparent: true,
        emissive: new THREE.Color(PALETTE.pureWhite),
        emissiveMap: this.faceTexture,
        emissiveIntensity: 0.36,
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

    // Attach pooled front-facing chest telegraph for 360° Frontal Guard-Break Stolen Kiss
    this.attachBlindspotGlint(this.torsoGroup);

    // Build Witcher 3 Attire Torso, Mantle, Corset & Split Coat-Skirt
    this.buildTorsoAndWitcherAttire(
      skinMat,
      velvetMat,
      featherDarkMat,
      featherSlateMat,
      blouseWhiteMat,
      silverTrimMat,
    );

    // Build Head, Anime Face, Obsidian Star Choker & Clean Sculpted Raven Curls (ZERO BackSide outlines / ZERO negative scales!)
    this.starLight = new THREE.PointLight(PALETTE.yenneferVioletEye, 1.3, 2.4, 2);
    this.buildHeadFaceAndRavenHair(
      skinMat,
      faceMat,
      velvetMat,
      silverTrimMat,
    );

    // Build Arms with Ruffled White Blouse Cuffs
    this.buildArm(-1, velvetMat, blouseWhiteMat, silverTrimMat, skinMat);
    this.buildArm(1, velvetMat, blouseWhiteMat, silverTrimMat, skinMat);

    // Build Legs with Thigh-High Black Leather Riding Boots & Silver Buckles
    this.buildLeg(-1, skinMat, bootLeatherMat, silverTrimMat);
    this.buildLeg(1, skinMat, bootLeatherMat, silverTrimMat);

    // Lilac-Violet Chaos Aura Ring
    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.72, 0.88, 36)),
      auraMat,
    );
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.position.y = 0.04;
    this.root.add(this.auraRing);

    // Pre-allocated Chaos Maelstrom Channeling Swirl Aura (zero hot-loop allocations)
    this.maelstromOuterMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.amethystTrim,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.maelstromInnerMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: PALETTE.yenneferLilac,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.maelstromGroup.position.set(0, 1.02, 0);
    this.maelstromGroup.visible = false;
    const mOuter = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(1.18, 0.055, 8, 32)),
      this.maelstromOuterMat,
    );
    mOuter.rotation.x = Math.PI / 2;
    const mInner = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.78, 0.045, 8, 28)),
      this.maelstromInnerMat,
    );
    mInner.rotation.x = Math.PI * 0.32;
    this.maelstromGroup.add(mOuter, mInner);
    this.root.add(this.maelstromGroup);

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

  private outlinedAttire(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    outlineScale: number | { x: number; y: number; z: number } = 1.045,
  ): THREE.Group {
    this.trackGeo(geo);
    return ToonAssets.createOutlinedMesh(geo, mat, outlineScale, true).group;
  }

  private buildTorsoAndWitcherAttire(
    skinMat: THREE.MeshToonMaterial,
    velvetMat: THREE.MeshToonMaterial,
    featherDarkMat: THREE.MeshToonMaterial,
    featherSlateMat: THREE.MeshToonMaterial,
    blouseWhiteMat: THREE.MeshToonMaterial,
    silverTrimMat: THREE.MeshToonMaterial,
  ): void {
    // Fitted Black Laced Corset Bodice & White Ruffled Blouse
    const pelvis = this.outlinedAttire(
      new THREE.CylinderGeometry(0.13, 0.155, 0.2, 12),
      velvetMat,
    );
    pelvis.position.y = 0.04;
    pelvis.scale.set(1.08, 1.0, 0.82);
    this.torsoGroup.add(pelvis);

    const corset = this.outlinedAttire(
      new THREE.CylinderGeometry(0.165, 0.12, 0.34, 14),
      velvetMat,
    );
    corset.position.y = 0.28;
    corset.scale.set(1.06, 1.0, 0.82);
    this.torsoGroup.add(corset);

    // Silver Corset Front Lacing & Trim Bars
    const laceGeo = this.trackGeo(new THREE.BoxGeometry(0.088, 0.012, 0.014));
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(laceGeo, silverTrimMat);
      bar.position.set(0, 0.18 + i * 0.056, 0.135);
      bar.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.22;
      this.torsoGroup.add(bar);
    }

    // White Ruffled Blouse Upper Chest & Collarbone Reveal
    const blouseBust = this.outlinedAttire(
      new THREE.CylinderGeometry(0.15, 0.16, 0.16, 14),
      blouseWhiteMat,
    );
    blouseBust.position.set(0, 0.43, 0.01);
    blouseBust.scale.set(1.04, 1.0, 0.84);
    this.torsoGroup.add(blouseBust);

    // Sculpted Bust Ruffle Placket
    const ruffleGeo = this.trackGeo(new THREE.TorusGeometry(0.042, 0.014, 6, 12));
    for (let i = 0; i < 3; i++) {
      const ruff = new THREE.Mesh(ruffleGeo, blouseWhiteMat);
      ruff.position.set(0, 0.38 + i * 0.045, 0.132);
      ruff.scale.set(1.2, 0.55, 0.7);
      this.torsoGroup.add(ruff);
    }

    const collarboneSkin = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.095, 0.125, 0.09, 12)),
      skinMat,
    );
    collarboneSkin.position.y = 0.5;
    collarboneSkin.scale.set(1.12, 1.0, 0.76);
    this.torsoGroup.add(collarboneSkin);

    // High-Collared Dark-Feather Shoulder Mantle (#1E293B / #0F172A layered feather plates)
    const featherGeo = this.trackGeo(new THREE.BoxGeometry(0.082, 0.22, 0.022));
    const featherCount = 11;
    for (let i = 0; i < featherCount; i++) {
      const t = i / (featherCount - 1) - 0.5; // -0.5 .. +0.5 around back & shoulders
      const ang = Math.PI + t * Math.PI * 1.42;
      const mat = i % 2 === 0 ? featherDarkMat : featherSlateMat;

      // Upper high-collar upright feathers framing the nape & shoulders
      const upperFeather = new THREE.Mesh(featherGeo, mat);
      upperFeather.position.set(
        Math.sin(ang) * 0.15,
        0.54 + Math.cos(t * Math.PI) * 0.05,
        Math.cos(ang) * 0.13,
      );
      upperFeather.rotation.y = ang;
      upperFeather.rotation.x = -0.34;
      this.torsoGroup.add(upperFeather);

      // Lower draped feather mantle tier flaring over the clavicles
      const lowerFeather = new THREE.Mesh(featherGeo, i % 2 === 0 ? featherSlateMat : featherDarkMat);
      lowerFeather.scale.set(1.18, 0.92, 1.0);
      lowerFeather.position.set(
        Math.sin(ang) * 0.225,
        0.455,
        Math.cos(ang) * 0.165,
      );
      lowerFeather.rotation.y = ang;
      lowerFeather.rotation.x = -0.82;
      this.torsoGroup.add(lowerFeather);
    }

    // Silver-buckled Corset Waist Belt
    const waistBelt = this.outlinedAttire(
      new THREE.CylinderGeometry(0.132, 0.138, 0.06, 14),
      velvetMat,
    );
    waistBelt.scale.set(1.08, 1.0, 0.84);
    waistBelt.position.y = 0.12;
    this.torsoGroup.add(waistBelt);

    const beltBuckle = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.068, 0.054, 0.024)),
      silverTrimMat,
    );
    beltBuckle.position.set(0, 0.12, 0.122);
    this.torsoGroup.add(beltBuckle);

    // Asymmetric Split Black-and-White Coat-Skirt (flares cleanly during combat & kneeling)
    const panelCount = 10;
    for (let i = 0; i < panelCount; i++) {
      const ang = (i / panelCount) * Math.PI * 2;
      // Leave narrow asymmetric front slit so her white underskirt & riding boots show cleanly
      if (Math.cos(ang) > 0.86) continue;

      const pivot = new THREE.Group();
      pivot.position.set(
        Math.sin(ang) * 0.125,
        0.095,
        Math.cos(ang) * 0.105,
      );
      pivot.rotation.y = ang;
      this.torsoGroup.add(pivot);

      const isFrontSide = Math.cos(ang) > 0.15;
      const isLeftAsym = Math.sin(ang) < 0;
      const len = isFrontSide ? (isLeftAsym ? 0.54 : 0.62) : 0.74;
      const isWhitePanel = isFrontSide && i % 2 === 1;
      const panelMat = isWhitePanel ? blouseWhiteMat : velvetMat;

      const panelMesh = this.outlinedAttire(
        new THREE.BoxGeometry(0.165, len, 0.022),
        panelMat,
        { x: 1.04, y: 1.015, z: 1.3 },
      );
      panelMesh.position.set(0, -len * 0.5, 0.085);
      panelMesh.rotation.x = -0.24;
      pivot.add(panelMesh);

      const silverHem = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.168, 0.026, 0.026)),
        silverTrimMat,
      );
      silverHem.position.set(0, -len + 0.015, 0.168);
      silverHem.rotation.x = -0.24;
      pivot.add(silverHem);

      this.coatPanels.push({ pivot, basePitch: -0.24, angle: ang });
    }
  }

  /**
   * Builds Yennefer's clean cel-shaded head, anime face plate, obsidian star choker,
   * side-parted wavy raven bangs above the brow line, and layered S-curved cascading curls.
   *
   * STRICT CLEAN CEL-SHADING RULE:
   * - ZERO BackSide outline meshes on head, face, or hair strands
   * - ZERO negative scale.x = -1 mirroring on any hair strand
   * - Explicit computeVertexNormals() on all sculpted hair geometry.
   */
  private buildHeadFaceAndRavenHair(
    skinMat: THREE.MeshToonMaterial,
    faceMat: THREE.MeshToonMaterial,
    velvetMat: THREE.MeshToonMaterial,
    silverTrimMat: THREE.MeshToonMaterial,
  ): void {
    this.headGroup.position.set(0, 0.515, 0.008);
    this.torsoGroup.add(this.headGroup);

    const neckGeo = this.trackGeo(new THREE.CylinderGeometry(0.048, 0.056, 0.11, 10));
    neckGeo.computeVertexNormals();
    const neck = new THREE.Mesh(neckGeo, skinMat);
    neck.position.y = 0.045;
    this.headGroup.add(neck);

    // Black Velvet Choker + Glowing Silver-and-Violet 5-Point Obsidian Star Medallion (`headAccessory`)
    const chokerBand = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.056, 0.011, 8, 20)),
      velvetMat,
    );
    chokerBand.rotation.x = Math.PI / 2;
    chokerBand.position.set(0, 0.058, 0);
    this.headGroup.add(chokerBand);

    this.headAccessory.position.set(0, 0.056, 0.062);
    this.headGroup.add(this.headAccessory);
    this.headAccessory.add(this.starMedallionGroup);

    // Build crisp 5-point Obsidian Star Medallion from positive extruded star shape
    const starShape = new THREE.Shape();
    const outerR = 0.036;
    const innerR = 0.015;
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? outerR : innerR;
      const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
      const sx = Math.cos(a) * rad;
      const sy = Math.sin(a) * rad;
      if (i === 0) starShape.moveTo(sx, sy);
      else starShape.lineTo(sx, sy);
    }
    starShape.closePath();

    const starGeo = this.trackGeo(
      new THREE.ExtrudeGeometry(starShape, {
        depth: 0.01,
        bevelEnabled: true,
        bevelThickness: 0.003,
        bevelSize: 0.003,
        bevelSegments: 1,
      }),
    );
    starGeo.center();
    starGeo.computeVertexNormals();

    const starSilverFrame = new THREE.Mesh(starGeo, silverTrimMat);
    const starVioletCore = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.014, 0)),
      this.starCoreMat,
    );
    starVioletCore.position.z = 0.006;
    this.starLight.position.set(0, 0, 0.05);
    this.starMedallionGroup.add(starSilverFrame, starVioletCore, this.starLight);

    // Clean Porcelain Head Sphere (NO BackSide outline!)
    const headCenterY = 0.185;
    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.122, 24, 20));
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.scale.set(0.94, 1.02, 0.96);
    headMesh.position.y = headCenterY;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    // Exact Lip Contact Anchor (`headAnchor` & `sovereignLipAnchor`)
    this.headAnchor.position.set(0, headCenterY - 0.044, 0.116);
    this.headGroup.add(this.headAnchor);

    // Curved Transparent Anime Face Overlay Shell (matching MarinaRig UV orientation)
    const faceShellGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.124,
        28,
        20,
        Math.PI * 0.15,
        Math.PI * 0.7,
        Math.PI * 0.2,
        Math.PI * 0.62,
      ),
    );
    faceShellGeo.computeVertexNormals();
    const faceShell = new THREE.Mesh(faceShellGeo, faceMat);
    faceShell.scale.set(0.94, 1.02, 0.96);
    faceShell.position.y = headCenterY;
    this.headGroup.add(faceShell);

    // Sculpted Raven-Black Hair Crown Cap (strictly positive scale, ZERO outlines!)
    const crownGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.132,
        24,
        18,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.6,
      ),
    );
    crownGeo.computeVertexNormals();
    const hairCrown = new THREE.Mesh(crownGeo, this.hairMat);
    hairCrown.scale.set(0.98, 1.05, 1.05);
    hairCrown.rotation.x = -0.18;
    hairCrown.position.set(0, headCenterY + 0.014, -0.008);
    hairCrown.castShadow = true;
    this.headGroup.add(hairCrown);

    // Side-Parted Wavy Raven Bangs positioned cleanly ABOVE her brow line (y >= 0.256)
    // Every strand built from explicit CatmullRomCurve3 TubeGeometry with positive scale & computeVertexNormals()
    const bangCurves: readonly THREE.Vector3[][] = [
      // Deep left-to-right side-part sweep above right brow
      [
        new THREE.Vector3(-0.048, 0.305, 0.065),
        new THREE.Vector3(0.012, 0.285, 0.114),
        new THREE.Vector3(0.072, 0.262, 0.104),
        new THREE.Vector3(0.112, 0.215, 0.068),
      ],
      // Secondary softer front wave tucked cleanly above brow line
      [
        new THREE.Vector3(-0.042, 0.302, 0.072),
        new THREE.Vector3(-0.004, 0.278, 0.118),
        new THREE.Vector3(0.044, 0.264, 0.112),
      ],
      // Left side-part framing wave sweeping left of brow
      [
        new THREE.Vector3(-0.05, 0.302, 0.064),
        new THREE.Vector3(-0.088, 0.272, 0.098),
        new THREE.Vector3(-0.116, 0.218, 0.064),
      ],
      // Left temple S-curl framing cheek
      [
        new THREE.Vector3(-0.105, 0.245, 0.042),
        new THREE.Vector3(-0.128, 0.155, 0.056),
        new THREE.Vector3(-0.114, 0.055, 0.042),
        new THREE.Vector3(-0.132, -0.045, 0.054),
      ],
      // Right temple S-curl framing cheek
      [
        new THREE.Vector3(0.105, 0.245, 0.042),
        new THREE.Vector3(0.128, 0.155, 0.056),
        new THREE.Vector3(0.114, 0.055, 0.042),
        new THREE.Vector3(0.132, -0.045, 0.054),
      ],
    ];

    for (let i = 0; i < bangCurves.length; i++) {
      const pts = bangCurves[i]!;
      const curve = new THREE.CatmullRomCurve3(pts);
      const radius = i < 3 ? 0.026 : 0.024;
      const tubeGeo = this.trackGeo(new THREE.TubeGeometry(curve, 14, radius, 8, false));
      tubeGeo.computeVertexNormals();
      const strandMesh = new THREE.Mesh(tubeGeo, this.hairMat);
      strandMesh.scale.set(1.0, 1.0, 0.72); // Strictly positive scales!
      strandMesh.castShadow = true;
      this.headGroup.add(strandMesh);
    }

    // Layered S-Curved Cascading Back Hair Curls past her shoulder blades with sinusoidal wind sway
    const curlCount = 7;
    for (let i = 0; i < curlCount; i++) {
      const t = i / (curlCount - 1) - 0.5; // -0.5 .. +0.5
      const baseX = t * 0.22;
      const baseZ = -0.095 - Math.cos(t * 1.65) * 0.028;
      const lenScale = 1.0 - Math.abs(t) * 0.16;

      const rootPivot = new THREE.Group();
      rootPivot.position.set(baseX, headCenterY + 0.02, baseZ);
      this.headGroup.add(rootPivot);

      // Upper S-curve segment (positive local curve, no mirror scaling!)
      const upperCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(t * 0.022, -0.11 * lenScale, -0.036),
        new THREE.Vector3(-t * 0.014, -0.23 * lenScale, -0.012),
        new THREE.Vector3(t * 0.018, -0.34 * lenScale, -0.04),
      ]);
      const upperGeo = this.trackGeo(
        new THREE.TubeGeometry(upperCurve, 12, 0.034, 8, false),
      );
      upperGeo.computeVertexNormals();
      const upperMesh = new THREE.Mesh(upperGeo, this.hairMat);
      upperMesh.castShadow = true;
      rootPivot.add(upperMesh);

      const midPivot = new THREE.Group();
      midPivot.position.set(t * 0.018, -0.34 * lenScale, -0.04);
      rootPivot.add(midPivot);

      // Lower cascading S-curve curl past shoulder blades
      const lowerCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-t * 0.018, -0.11 * lenScale, 0.022),
        new THREE.Vector3(t * 0.02, -0.22 * lenScale, -0.026),
        new THREE.Vector3(0, -0.32 * lenScale, 0.014),
      ]);
      const lowerGeo = this.trackGeo(
        new THREE.TubeGeometry(lowerCurve, 12, 0.027, 8, false),
      );
      lowerGeo.computeVertexNormals();
      const lowerMesh = new THREE.Mesh(lowerGeo, this.hairMat);
      lowerMesh.castShadow = true;
      midPivot.add(lowerMesh);

      // Tapered curled tip (positive cone, rotated smoothly)
      const tipGeo = this.trackGeo(new THREE.ConeGeometry(0.026, 0.11, 7));
      tipGeo.computeVertexNormals();
      const tipMesh = new THREE.Mesh(tipGeo, this.hairMat);
      tipMesh.rotation.x = Math.PI;
      tipMesh.position.set(0, -0.36 * lenScale, 0.014);
      midPivot.add(tipMesh);

      this.hairLocks.push({
        rootPivot,
        midPivot,
        phase: i * 0.85,
        spread: t,
        baseX,
      });
    }
  }

  private buildArm(
    side: -1 | 1,
    velvetMat: THREE.MeshToonMaterial,
    blouseWhiteMat: THREE.MeshToonMaterial,
    silverTrimMat: THREE.MeshToonMaterial,
    skinMat: THREE.MeshToonMaterial,
  ): void {
    const shoulder = side < 0 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side < 0 ? this.leftElbowPivot : this.rightElbowPivot;
    const hand = side < 0 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.215, 0.435, 0);
    this.torsoGroup.add(shoulder);

    const upper = this.outlinedAttire(
      new THREE.CylinderGeometry(0.045, 0.038, 0.26, 10),
      velvetMat,
      1.07,
    );
    upper.position.y = -0.13;
    shoulder.add(upper);

    elbow.position.set(0, -0.26, 0);
    shoulder.add(elbow);

    const forearm = this.outlinedAttire(
      new THREE.CylinderGeometry(0.037, 0.032, 0.22, 10),
      velvetMat,
      1.07,
    );
    forearm.position.y = -0.11;
    elbow.add(forearm);

    // Flared White Ruffled Lace Cuff & Silver Wrist Band
    const laceCuff = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.036, 0.068, 0.085, 12, 1, true)),
      blouseWhiteMat,
    );
    laceCuff.position.y = -0.21;
    elbow.add(laceCuff);

    const silverWrist = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.036, 0.007, 6, 14)),
      silverTrimMat,
    );
    silverWrist.rotation.x = Math.PI / 2;
    silverWrist.position.y = -0.175;
    elbow.add(silverWrist);

    const palm = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.045, 0.072, 0.046)),
      skinMat,
    );
    palm.position.set(0, -0.255, 0.008);
    elbow.add(palm);

    hand.position.set(0, -0.295, 0.018);
    elbow.add(hand);
  }

  private buildLeg(
    side: -1 | 1,
    skinMat: THREE.MeshToonMaterial,
    bootLeatherMat: THREE.MeshToonMaterial,
    silverTrimMat: THREE.MeshToonMaterial,
  ): void {
    const legPivot = side < 0 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side < 0 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.095, -0.02, 0);
    this.bodyPivot.add(legPivot);

    // Upper Thigh + Thigh-High Black Leather Riding Boot Cuff
    const upperThigh = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.064, 0.056, 0.16, 10)),
      skinMat,
    );
    upperThigh.position.y = -0.08;
    legPivot.add(upperThigh);

    const bootThigh = this.outlinedAttire(
      new THREE.CylinderGeometry(0.059, 0.048, 0.29, 10),
      bootLeatherMat,
      1.06,
    );
    bootThigh.position.y = -0.295;
    legPivot.add(bootThigh);

    // Silver Boot-Top Buckle Strap
    const thighStrap = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.058, 0.008, 6, 14)),
      silverTrimMat,
    );
    thighStrap.rotation.x = Math.PI / 2;
    thighStrap.position.y = -0.165;
    legPivot.add(thighStrap);

    kneePivot.position.set(0, -0.43, 0);
    legPivot.add(kneePivot);

    const bootShin = this.outlinedAttire(
      new THREE.CylinderGeometry(0.047, 0.036, 0.42, 10),
      bootLeatherMat,
      1.06,
    );
    bootShin.position.y = -0.21;
    kneePivot.add(bootShin);

    // Silver Ankle Riding Buckle
    const ankleBuckle = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.024, 0.028, 0.022)),
      silverTrimMat,
    );
    ankleBuckle.position.set(side * 0.036, -0.34, 0.018);
    kneePivot.add(ankleBuckle);

    const bootFoot = this.outlinedAttire(
      new THREE.BoxGeometry(0.068, 0.056, 0.14),
      bootLeatherMat,
      1.06,
    );
    bootFoot.position.set(0, -0.43, 0.034);
    kneePivot.add(bootFoot);
  }

  /**
   * Draws Yennefer's 512x512 *Arcane Usurper* low-set anime face texture with
   * live core-drain eye bleach (#A855F7 -> #94A3B8), dark lashes, catchlights,
   * subtle rose blush, and haughty smirk (`[Sovereign Glare]`) / `[Eyes-Closed Bliss]`.
   */
  private drawFace(
    expression: BossExpression,
    spiralPhase: number,
    bleach: number,
  ): void {
    const ctx = this.faceCtx;
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 512);

    // Interpolate iris violet (#A855F7) -> exhausted ash-silver (#94A3B8) smoothly
    this.scratchColor
      .copy(this.violetEyeColor)
      .lerp(this.ashSilverColor, THREE.MathUtils.clamp(bleach, 0, 1));
    const irisHex = `#${this.scratchColor.getHexString()}`;

    this.scratchColor
      .copy(this.lilacStarColor)
      .lerp(this.ashSilverColor, THREE.MathUtils.clamp(bleach, 0, 1));
    const lowerIrisHex = `#${this.scratchColor.getHexString()}`;

    // Low-set anime vertical placement matching MarinaRig
    const eyeY = 278;
    const eyeXs = [174, 338];

    // Subtle Sorceress Rose Blush
    const blushAlpha =
      expression === BOSS_EXPRESSIONS.SIPHON_KISS ||
      expression === BOSS_EXPRESSIONS.DRAINED_FAINT
        ? 0.34
        : expression === BOSS_EXPRESSIONS.STAGGER
          ? 0.25
          : 0.14;
    ctx.fillStyle = `rgba(244, 63, 94, ${blushAlpha})`;
    ctx.beginPath();
    ctx.ellipse(150, 326, 38, 17, 0, 0, Math.PI * 2);
    ctx.ellipse(362, 326, 38, 17, 0, 0, Math.PI * 2);
    ctx.fill();

    if (expression === BOSS_EXPRESSIONS.DRAINED_FAINT) {
      // Spinning @_@ dizzy spirals (bleaching toward ash-silver)
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
      // [Eyes-Closed Bliss] curved dark lashes
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
      // [Sovereign Glare] / Stagger Luminous Violet Anime Eyes
      for (let e = 0; e < eyeXs.length; e++) {
        const cx = eyeXs[e]!;
        const isStagger = expression === BOSS_EXPRESSIONS.STAGGER;

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 44, isStagger ? 36 : 30, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = irisHex;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 2, 27, isStagger ? 26 : 27, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = lowerIrisHex;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 13, 17, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.yenneferRaven;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 2, isStagger ? 9 : 11.5, 0, Math.PI * 2);
        ctx.fill();

        // Crisp white specular catchlights
        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 11, eyeY - 9, 7.5, 0, Math.PI * 2);
        ctx.arc(cx + 11, eyeY + 10, 3.6, 0, Math.PI * 2);
        ctx.fill();

        // Sharp winged raven eyeliner & upper lash arc
        ctx.strokeStyle = PALETTE.hex.yenneferRaven;
        ctx.lineWidth = 10.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 48, eyeY - 6);
        ctx.quadraticCurveTo(cx, eyeY - 38, cx + 48, eyeY - 6);
        ctx.stroke();
      }
    }

    // Arching Raven Brows (haughty angle in Sovereign Glare)
    ctx.strokeStyle = PALETTE.hex.yenneferRaven;
    ctx.lineWidth = 6.5;
    ctx.lineCap = 'round';
    const browY = 224;
    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      ctx.beginPath();
      ctx.moveTo(130, browY - 4);
      ctx.quadraticCurveTo(174, browY - 14, 214, browY + 4);
      ctx.moveTo(382, browY - 8);
      ctx.quadraticCurveTo(338, browY - 18, 298, browY + 4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(132, browY + 6);
      ctx.lineTo(212, browY - 6);
      ctx.moveTo(380, browY + 6);
      ctx.lineTo(300, browY - 6);
      ctx.stroke();
    }

    // Delicate nose dot
    ctx.fillStyle = 'rgba(180, 120, 108, 0.55)';
    ctx.beginPath();
    ctx.arc(256, 336, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Mouth: Haughty Smirk in COMBAT, parted lips in STAGGER/SIPHON_KISS/DRAINED_FAINT
    if (expression === BOSS_EXPRESSIONS.COMBAT) {
      ctx.strokeStyle = PALETTE.hex.deepLipBerry;
      ctx.lineWidth = 5.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(232, 376);
      ctx.quadraticCurveTo(258, 382, 286, 368);
      ctx.stroke();
    } else if (expression === BOSS_EXPRESSIONS.SIPHON_KISS) {
      ctx.fillStyle = PALETTE.hex.lipRose;
      ctx.beginPath();
      ctx.ellipse(256, 376, 15, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = PALETTE.hex.deepLipBerry;
      ctx.beginPath();
      ctx.ellipse(256, 376, 17, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.faceTexture.needsUpdate = true;
    this.lastDrawnEyeBleach = bleach;
    this.lastSpiralPhase = spiralPhase;
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
  }

  public setMaelstromCharge(intensity: number): void {
    this.maelstromCharge = THREE.MathUtils.clamp(intensity, 0, 1);
    if (this.maelstromCharge <= 0.01) {
      this.maelstromGroup.visible = false;
    }
  }

  public triggerRiftArrivePulse(): void {
    this.riftArrivePulseTimer = 0.45;
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

  private animateRavenCurls(
    elapsed: number,
    swayAmp: number,
    basePitch: number,
  ): void {
    for (let i = 0; i < this.hairLocks.length; i++) {
      const lock = this.hairLocks[i]!;
      const wave1 = Math.sin(elapsed * 2.7 + lock.phase) * swayAmp;
      const wave2 = Math.sin(elapsed * 2.7 + lock.phase - 0.9) * swayAmp * 1.35;
      lock.rootPivot.rotation.x = basePitch + wave1;
      lock.rootPivot.rotation.z = lock.spread * 0.16 + wave1 * 0.45;
      lock.midPivot.rotation.x = 0.12 + wave2;
      lock.midPivot.rotation.z = wave2 * 0.35;
    }
  }

  public updateCombatPose(
    dt: number,
    state: GameState,
    elapsed: number,
    staggerProgressOverride?: number | null,
  ): void {
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    this.castFlourishTimer = Math.max(0, this.castFlourishTimer - dt);
    this.riftArrivePulseTimer = Math.max(0, this.riftArrivePulseTimer - dt);

    const s =
      staggerProgressOverride !== null && staggerProgressOverride !== undefined
        ? staggerProgressOverride
        : state === GAME_STATES.STAGGER
          ? 1.0
          : 0.0;

    const hover = Math.sin(elapsed * 2.4) * 0.055 * (1 - s);
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.45) * Math.PI)
        : 0;

    this.bodyPivot.position.set(
      0,
      THREE.MathUtils.lerp(0.94 + hover + this.ascendHeight, 0.48, s),
      0,
    );
    this.bodyPivot.rotation.set(0, 0, 0);
    this.torsoGroup.rotation.set(THREE.MathUtils.lerp(0.03, 0.22, s), 0, 0);
    this.headGroup.rotation.set(THREE.MathUtils.lerp(0.02, 0.26, s), 0, 0);

    this.leftLegPivot.rotation.set(THREE.MathUtils.lerp(0.06, -0.78, s), 0, -0.06);
    this.rightLegPivot.rotation.set(THREE.MathUtils.lerp(-0.08, -0.78, s), 0, 0.06);
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(0.16, 1.56, s);
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(0.22, 1.56, s);

    const castArmX = -0.44 - flourish * 0.88;
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

    // Coat-skirt flare & sinusoidal raven curl wind sway
    for (let i = 0; i < this.coatPanels.length; i++) {
      const cp = this.coatPanels[i]!;
      const wave = Math.sin(elapsed * 2.8 + cp.angle * 2) * 0.05 * (1 - s);
      cp.pivot.rotation.x = wave - s * 0.38;
    }
    this.animateRavenCurls(elapsed, 0.09 * (1 - s * 0.65), 0.14);

    this.auraRing.visible = s < 0.85;
    this.auraRing.rotation.z = elapsed * 0.9;

    const maelstromVis = Math.max(
      this.maelstromCharge,
      this.riftArrivePulseTimer > 0 ? this.riftArrivePulseTimer / 0.45 : 0,
    );
    if (maelstromVis > 0.02 && s < 0.5) {
      this.maelstromGroup.visible = true;
      this.maelstromGroup.rotation.y = elapsed * (3.6 + maelstromVis * 4.5);
      this.maelstromGroup.rotation.z = Math.sin(elapsed * 4.2) * 0.35;
      this.maelstromGroup.scale.setScalar(0.7 + maelstromVis * 0.72);
      this.maelstromOuterMat.opacity = maelstromVis * 0.85;
      this.maelstromInnerMat.opacity = maelstromVis * 0.72;
    } else {
      this.maelstromGroup.visible = false;
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

    this.auraRing.visible = false;
    this.accessoryFlickTimer = Math.max(0, this.accessoryFlickTimer - dt);
    const flickRot =
      this.accessoryFlickTimer > 0
        ? Math.sin(this.accessoryFlickTimer * 28) * 0.45 * this.accessoryFlickTimer
        : 0;
    this.starMedallionGroup.rotation.z = flickRot;

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

    for (let i = 0; i < this.coatPanels.length; i++) {
      this.coatPanels[i]!.pivot.rotation.x = -0.38;
    }
    this.animateRavenCurls(time, isSurge ? 0.11 : 0.045, isDip ? 0.44 : 0.12);
    this.root.updateMatrixWorld(true);
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
    this.animateRavenCurls(time, 0.12, 0.24);
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
    this.headAnchor.position.set(0, 0.141, 0.116 + p.headFaceNormalOffset);

    this.leftLegPivot.rotation.set(0.06, 0, -0.06);
    this.rightLegPivot.rotation.set(-0.08, 0, 0.06);
    this.leftKneePivot.rotation.x = 0.14;
    this.rightKneePivot.rotation.x = 0.18;

    this.leftShoulderPivot.rotation.set(p.leftShoulderX, 0, p.leftShoulderZ);
    this.leftElbowPivot.rotation.set(p.leftElbowX, 0, p.leftElbowZ);
    this.rightShoulderPivot.rotation.set(p.rightShoulderX, 0, p.rightShoulderZ);
    this.rightElbowPivot.rotation.set(p.rightElbowX, 0, p.rightElbowZ);
    this.animateRavenCurls(time, 0.08, 0.16);
    this.root.updateMatrixWorld(true);
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
    this.animateRavenCurls(time, 0.025, 0.26);
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

    this.leftShoulderPivot.rotation.set(-0.92, 0.22, -0.78);
    this.rightShoulderPivot.rotation.set(-0.92, -0.22, 0.78);
    this.leftElbowPivot.rotation.set(-0.46, 0, 0);
    this.rightElbowPivot.rotation.set(-0.46, 0, 0);
    this.animateRavenCurls(time, 0.035, 0.16);

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
   * Core Drain Bleach (100% -> 0%): smoothly lerps Yennefer's violet eyes, obsidian star glow,
   * and deep-violet hair sheen into exhausted ash-silver (#94A3B8).
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

    // Lerp hair deep-violet highlight sheen (#6D28D9 -> #94A3B8)
    this.hairMat.emissive
      .copy(this.hairHighlightColor)
      .lerp(this.ashSilverColor, t);
    this.hairMat.emissiveIntensity = THREE.MathUtils.lerp(0.28, 0.06, t);

    // Lerp obsidian 5-point star medallion glow into muted ash-silver
    this.starCoreMat.color
      .copy(this.lilacStarColor)
      .lerp(this.ashSilverColor, t);
    this.starLight.intensity = 1.3 * (1 - t);

    // Redraw violet eyes on canvas whenever bleach shifts noticeably
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
    this.maelstromCharge = 0;
    this.riftArrivePulseTimer = 0;
    this.ascendHeight = 0;
    this.auraRing.visible = true;
    this.maelstromGroup.visible = false;
    restoreDrainableMaterials(
      this.drainableMaterials,
      this.originalColors,
      this.bleachMetadata,
    );
    this.starCoreMat.color.copy(this.lilacStarColor);
    this.starLight.intensity = 1.3;
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
