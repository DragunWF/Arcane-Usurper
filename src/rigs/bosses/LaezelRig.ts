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
 * Cel-shaded procedural warrior rig for **Lae'zel — Githyanki Vanguard**
 * (non-siphonable Special Scenario companion boss in *Shadows of the Sharran Crypt*, `canBeSiphoned = false`).
 *
 * - Chartreuse-olive Githyanki skin (`#84CC16`), angular face with amber-gold eyes (`#F59E0B`),
 *   pointed Githyanki ears, and dark reddish-brown hair (`#450A0A`) in a braided top-knot & twin side braids
 *   (strictly zero `BackSide` outlines on head/face/hair, positive scales + `computeVertexNormals()`)
 * - Ornate Githyanki half-plate armor in crimson (`#7F1D1D`), bronze (`#B45309`), and steel (`#64748B`)
 * - Silver astral greatsword wielded in an aggressive two-handed vanguard stance
 * - Persistent grounded two-stage collapse at `0 HP` (`visible = true` on crypt floor).
 */
export class LaezelRig extends BossBase {
  public readonly id = BALDURS_GATE_PARTY_CONFIG.laezelId;
  public readonly displayName = BALDURS_GATE_PARTY_CONFIG.laezelDisplayName;
  public readonly title = BALDURS_GATE_PARTY_CONFIG.laezelTitle;
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
  private readonly topKnotPivot = new THREE.Group();
  private readonly sideBraidPivots: THREE.Group[] = [];
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
  private readonly greatswordGroup = new THREE.Group();
  private readonly auraRing: THREE.Mesh;
  private readonly faceMat: THREE.MeshToonMaterial;

  private hitFlashTimer = 0;
  private castFlourishTimer = 0;
  private ascendHeight = 0;

  constructor(scene: THREE.Scene) {
    super();
    this.root.name = 'LaezelRig';
    this.root.userData.managedByRig = true;

    const skinMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelSkin),
    );
    const hairMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelHair, {
        emissive: PALETTE.laezelCrimson,
        emissiveIntensity: 0.14,
      }),
    );
    const crimsonPlateMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelCrimson, {
        emissive: PALETTE.laezelHair,
        emissiveIntensity: 0.16,
      }),
    );
    const bronzeMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelBronze, {
        emissive: PALETTE.laezelAmberEye,
        emissiveIntensity: 0.18,
      }),
    );
    const steelMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelSteel, {
        emissive: PALETTE.steelSilver,
        emissiveIntensity: 0.14,
      }),
    );
    const astralBladeMat = this.trackDrainable(
      ToonAssets.createThreeStepToonMaterial(PALETTE.laezelAstralBlade, {
        emissive: PALETTE.sharranLunarSilver,
        emissiveIntensity: 0.32,
      }),
    );

    const faceTex = this.createLaezelFaceTexture();
    this.faceMat = this.trackMat(
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
        color: PALETTE.bg3LaezelSteel,
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

    this.buildGithyankiHalfPlate(
      skinMat,
      crimsonPlateMat,
      bronzeMat,
      steelMat,
    );
    this.buildHeadAndBraids(skinMat, this.faceMat, hairMat, bronzeMat);
    this.buildArm(-1, crimsonPlateMat, bronzeMat, steelMat, skinMat);
    this.buildArm(1, crimsonPlateMat, bronzeMat, steelMat, skinMat);
    this.buildAstralGreatsword(astralBladeMat, bronzeMat, crimsonPlateMat);
    this.buildLeg(-1, crimsonPlateMat, bronzeMat, steelMat);
    this.buildLeg(1, crimsonPlateMat, bronzeMat, steelMat);

    this.auraRing = new THREE.Mesh(
      this.trackGeo(new THREE.RingGeometry(0.76, 0.92, 32)),
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

  private outlinedArmor(
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    scale = 1.045,
  ): THREE.Group {
    this.trackGeo(geo);
    return ToonAssets.createOutlinedMesh(geo, mat, scale, true).group;
  }

  private buildGithyankiHalfPlate(
    skinMat: THREE.Material,
    crimsonMat: THREE.Material,
    bronzeMat: THREE.Material,
    steelMat: THREE.Material,
  ): void {
    const pelvis = this.outlinedArmor(
      new THREE.CylinderGeometry(0.125, 0.145, 0.16, 12),
      steelMat,
    );
    pelvis.position.y = 0.03;
    this.torsoGroup.add(pelvis);

    const waist = this.outlinedArmor(
      new THREE.CylinderGeometry(0.14, 0.12, 0.2, 12),
      crimsonMat,
    );
    waist.position.y = 0.21;
    this.torsoGroup.add(waist);

    // Ornate Githyanki Half-Plate Cuirass (steel core + bronze filigree ribs)
    const chest = this.outlinedArmor(
      new THREE.CylinderGeometry(0.172, 0.138, 0.24, 14),
      steelMat,
    );
    chest.position.y = 0.4;
    this.torsoGroup.add(chest);

    const bronzeBreastplate = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.22, 0.19, 0.12)),
      bronzeMat,
    );
    bronzeBreastplate.position.set(0, 0.4, 0.092);
    this.torsoGroup.add(bronzeBreastplate);

    const crimsonSash = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.132, 0.02, 8, 20)),
      crimsonMat,
    );
    crimsonSash.rotation.x = Math.PI / 2;
    crimsonSash.position.y = 0.115;
    this.torsoGroup.add(crimsonSash);

    // Sharp Flared Githyanki Shoulder Pauldrons
    const pauldronGeo = this.trackGeo(new THREE.ConeGeometry(0.115, 0.19, 6));
    for (let s = -1; s <= 1; s += 2) {
      const pauldron = new THREE.Mesh(pauldronGeo, bronzeMat);
      pauldron.position.set(s * 0.22, 0.5, 0);
      pauldron.rotation.z = -s * 0.92;
      this.torsoGroup.add(pauldron);

      const lowerPlate = new THREE.Mesh(
        this.trackGeo(new THREE.BoxGeometry(0.11, 0.055, 0.15)),
        crimsonMat,
      );
      lowerPlate.position.set(s * 0.215, 0.455, 0);
      lowerPlate.rotation.z = -s * 0.42;
      this.torsoGroup.add(lowerPlate);
    }

    // Layered Githyanki hip tassets
    const tassetGeo = this.trackGeo(new THREE.BoxGeometry(0.11, 0.32, 0.028));
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
      const plate = new THREE.Mesh(
        tassetGeo,
        i % 2 === 0 ? crimsonMat : bronzeMat,
      );
      plate.position.set(Math.sin(ang) * 0.148, -0.05, Math.cos(ang) * 0.148);
      plate.rotation.y = ang;
      plate.rotation.x = -0.18;
      this.torsoGroup.add(plate);
    }

    const neck = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.048, 0.056, 0.1, 10)),
      skinMat,
    );
    neck.position.y = 0.55;
    this.torsoGroup.add(neck);
  }

  private buildHeadAndBraids(
    skinMat: THREE.Material,
    faceMat: THREE.Material,
    hairMat: THREE.Material,
    bronzeMat: THREE.Material,
  ): void {
    this.headGroup.position.set(0, 0.525, 0.008);
    this.torsoGroup.add(this.headGroup);

    // Angular Githyanki head (zero BackSide outline, positive scale)
    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.128, 22, 20));
    headGeo.scale(0.92, 1.06, 0.95);
    headGeo.computeVertexNormals();
    const headMesh = new THREE.Mesh(headGeo, skinMat);
    headMesh.position.y = 0.145;
    headMesh.castShadow = true;
    this.headGroup.add(headMesh);

    const faceGeo = this.trackGeo(
      new THREE.SphereGeometry(
        0.1305,
        20,
        16,
        Math.PI * 0.16,
        Math.PI * 0.68,
        Math.PI * 0.24,
        Math.PI * 0.54,
      ),
    );
    faceGeo.scale(0.92, 1.06, 0.95);
    faceGeo.computeVertexNormals();
    const faceMesh = new THREE.Mesh(faceGeo, faceMat);
    faceMesh.position.y = 0.145;
    faceMesh.rotation.y = -Math.PI * 0.5;
    this.headGroup.add(faceMesh);

    this.headAnchor.position.set(0, 0.145, 0.115);
    this.headGroup.add(this.headAnchor);
    this.headAccessory.position.set(0, 0.29, -0.02);
    this.headGroup.add(this.headAccessory);

    // Sharp pointed Githyanki ears (positive scales)
    const earGeo = this.trackGeo(new THREE.ConeGeometry(0.02, 0.09, 6));
    earGeo.computeVertexNormals();
    for (let s = -1; s <= 1; s += 2) {
      const ear = new THREE.Mesh(earGeo, skinMat);
      ear.position.set(s * 0.124, 0.15, -0.01);
      ear.rotation.set(0.18, s * 0.3, -s * 1.12);
      this.headGroup.add(ear);
    }

    // Tight pulled-back dark reddish-brown hair scalp cap
    const hairCapGeo = this.trackGeo(
      new THREE.SphereGeometry(0.138, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
    );
    hairCapGeo.scale(0.94, 1.04, 0.98);
    hairCapGeo.computeVertexNormals();
    const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
    hairCap.position.set(0, 0.155, -0.008);
    this.headGroup.add(hairCap);

    // Braided Warrior Top-Knot with bronze hair-ring clasp
    this.topKnotPivot.position.set(0, 0.275, -0.045);
    const clasp = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.036, 0.01, 8, 16)),
      bronzeMat,
    );
    clasp.rotation.x = Math.PI / 2;
    this.topKnotPivot.add(clasp);

    const knotUpperGeo = this.trackGeo(new THREE.CylinderGeometry(0.032, 0.036, 0.12, 10));
    knotUpperGeo.computeVertexNormals();
    const knotUpper = new THREE.Mesh(knotUpperGeo, hairMat);
    knotUpper.position.set(0, 0.055, -0.02);
    knotUpper.rotation.x = -0.35;
    this.topKnotPivot.add(knotUpper);

    const knotTailGeo = this.trackGeo(new THREE.ConeGeometry(0.034, 0.24, 8));
    knotTailGeo.computeVertexNormals();
    const knotTail = new THREE.Mesh(knotTailGeo, hairMat);
    knotTail.rotation.x = Math.PI * 0.78;
    knotTail.position.set(0, 0.02, -0.14);
    this.topKnotPivot.add(knotTail);
    this.headGroup.add(this.topKnotPivot);

    // Twin Side Braids framing her face (strictly positive scales)
    const braidGeo = this.trackGeo(new THREE.CylinderGeometry(0.017, 0.013, 0.28, 8));
    braidGeo.computeVertexNormals();
    for (let s = -1; s <= 1; s += 2) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.105, 0.195, 0.045);
      const braid = new THREE.Mesh(braidGeo, hairMat);
      braid.position.y = -0.14;
      pivot.add(braid);

      const ring = new THREE.Mesh(
        this.trackGeo(new THREE.TorusGeometry(0.016, 0.0045, 6, 12)),
        bronzeMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.24;
      pivot.add(ring);

      this.sideBraidPivots.push(pivot);
      this.headGroup.add(pivot);
    }
  }

  private createLaezelFaceTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = ARENA_CONFIG.faceTextureSize;
    canvas.height = ARENA_CONFIG.faceTextureSize;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 512, 512);

      // Subtle Githyanki olive-charcoal facial war speckles & cheekbone contour
      ctx.fillStyle = 'rgba(69, 10, 10, 0.16)';
      ctx.beginPath();
      ctx.ellipse(152, 326, 36, 14, -0.22, 0, Math.PI * 2);
      ctx.ellipse(360, 326, 36, 14, 0.22, 0, Math.PI * 2);
      ctx.fill();

      // Fierce angular amber-gold Githyanki eyes (#F59E0B)
      const eyeY = 276;
      const eyeXs = [174, 338];
      for (let i = 0; i < eyeXs.length; i++) {
        const cx = eyeXs[i]!;
        const dir = i === 0 ? 1 : -1;

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY, 42, 22, -dir * 0.12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.laezelAmberEye;
        ctx.beginPath();
        ctx.ellipse(cx, eyeY + 1, 22, 19, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.abyssalCloak;
        ctx.beginPath();
        ctx.arc(cx, eyeY + 1, 8.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = PALETTE.hex.pureWhite;
        ctx.beginPath();
        ctx.arc(cx - 8, eyeY - 5, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = PALETTE.hex.laezelHair;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - 44 * dir, eyeY - 14);
        ctx.lineTo(cx + 42 * dir, eyeY - 4);
        ctx.stroke();

        // Sharp scowling brow
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(cx - 42 * dir, eyeY - 44);
        ctx.lineTo(cx + 34 * dir, eyeY - 28);
        ctx.stroke();
      }

      // Narrow upturned Githyanki nose bridge line
      ctx.strokeStyle = PALETTE.hex.laezelSkinDeep;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(246, 332);
      ctx.lineTo(256, 324);
      ctx.lineTo(266, 332);
      ctx.stroke();

      // Determined stern warrior lips
      ctx.strokeStyle = PALETTE.hex.laezelHair;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(226, 382);
      ctx.quadraticCurveTo(256, 374, 286, 382);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.ownedTextures.push(tex);
    return tex;
  }

  private buildArm(
    side: -1 | 1,
    crimsonMat: THREE.Material,
    bronzeMat: THREE.Material,
    steelMat: THREE.Material,
    skinMat: THREE.Material,
  ): void {
    const shoulder =
      side === -1 ? this.leftShoulderPivot : this.rightShoulderPivot;
    const elbow = side === -1 ? this.leftElbowPivot : this.rightElbowPivot;
    const handAnchor = side === -1 ? this.leftHandAnchor : this.rightHandAnchor;

    shoulder.position.set(side * 0.21, 0.46, 0);
    this.torsoGroup.add(shoulder);

    const upperArm = this.outlinedArmor(
      new THREE.CylinderGeometry(0.048, 0.042, 0.27, 10),
      crimsonMat,
    );
    upperArm.position.y = -0.135;
    shoulder.add(upperArm);

    elbow.position.set(0, -0.27, 0);
    shoulder.add(elbow);

    const gauntlet = this.outlinedArmor(
      new THREE.CylinderGeometry(0.045, 0.038, 0.25, 10),
      steelMat,
    );
    gauntlet.position.y = -0.125;
    elbow.add(gauntlet);

    const cuff = new THREE.Mesh(
      this.trackGeo(new THREE.TorusGeometry(0.042, 0.008, 6, 14)),
      bronzeMat,
    );
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.22;
    elbow.add(cuff);

    const hand = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.034, 10, 8)),
      skinMat,
    );
    hand.position.y = -0.26;
    elbow.add(hand);

    handAnchor.position.set(0, -0.26, 0);
    elbow.add(handAnchor);
  }

  private buildAstralGreatsword(
    astralBladeMat: THREE.Material,
    bronzeMat: THREE.Material,
    crimsonMat: THREE.Material,
  ): void {
    this.greatswordGroup.position.set(0, -0.26, 0.04);
    this.greatswordGroup.rotation.set(Math.PI * 0.4, 0, 0);

    const grip = new THREE.Mesh(
      this.trackGeo(new THREE.CylinderGeometry(0.017, 0.017, 0.34, 8)),
      crimsonMat,
    );
    grip.position.y = -0.02;
    this.greatswordGroup.add(grip);

    const pommel = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.032, 0)),
      bronzeMat,
    );
    pommel.position.y = -0.2;
    this.greatswordGroup.add(pommel);

    // Ornate Githyanki flared astral crossguard
    const guard = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.32, 0.042, 0.052)),
      bronzeMat,
    );
    guard.position.y = 0.16;
    this.greatswordGroup.add(guard);

    // Broad gleaming silver astral greatsword blade
    const blade = new THREE.Mesh(
      this.trackGeo(new THREE.BoxGeometry(0.088, 1.38, 0.022)),
      astralBladeMat,
    );
    blade.position.y = 0.87;
    this.greatswordGroup.add(blade);

    const tip = new THREE.Mesh(
      this.trackGeo(new THREE.ConeGeometry(0.058, 0.22, 4)),
      astralBladeMat,
    );
    tip.rotation.y = Math.PI * 0.25;
    tip.scale.set(1.0, 1.0, 0.35);
    tip.position.y = 1.66;
    this.greatswordGroup.add(tip);

    this.rightElbowPivot.add(this.greatswordGroup);
  }

  private buildLeg(
    side: -1 | 1,
    crimsonMat: THREE.Material,
    bronzeMat: THREE.Material,
    steelMat: THREE.Material,
  ): void {
    const legPivot = side === -1 ? this.leftLegPivot : this.rightLegPivot;
    const kneePivot = side === -1 ? this.leftKneePivot : this.rightKneePivot;

    legPivot.position.set(side * 0.1, -0.02, 0);
    this.bodyPivot.add(legPivot);

    const thigh = this.outlinedArmor(
      new THREE.CylinderGeometry(0.072, 0.058, 0.43, 10),
      crimsonMat,
    );
    thigh.position.y = -0.215;
    legPivot.add(thigh);

    kneePivot.position.set(0, -0.43, 0);
    legPivot.add(kneePivot);

    const kneeCop = new THREE.Mesh(
      this.trackGeo(new THREE.OctahedronGeometry(0.056, 0)),
      bronzeMat,
    );
    kneeCop.position.set(0, 0.01, 0.05);
    kneePivot.add(kneeCop);

    const greave = this.outlinedArmor(
      new THREE.CylinderGeometry(0.056, 0.042, 0.44, 10),
      steelMat,
    );
    greave.position.y = -0.22;
    kneePivot.add(greave);

    const boot = this.outlinedArmor(
      new THREE.BoxGeometry(0.076, 0.06, 0.15),
      steelMat,
      1.05,
    );
    boot.position.set(0, -0.44, 0.038);
    kneePivot.add(boot);
  }

  private psionicLeapIntensity = 0;
  private cleaveSlashStep: 0 | 1 | 2 = 0;
  private cleaveSlashTimer = 0;

  public setPsionicLeapAura(intensity: number): void {
    this.psionicLeapIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  public triggerGreatswordSlash(step: 1 | 2): void {
    this.cleaveSlashStep = step;
    this.cleaveSlashTimer = 0.28;
    this.castFlourishTimer = 0.34;
  }

  public setExpression(_expression: BossExpression, _spiralPhase = 0): void {
    // Non-siphonable warrior maintains fierce combat expression
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
    this.castFlourishTimer = 0.42;
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
    this.cleaveSlashTimer = Math.max(0, this.cleaveSlashTimer - dt);
    if (this.cleaveSlashTimer <= 0) this.cleaveSlashStep = 0;

    const breathe = Math.sin(elapsed * 3.0) * 0.02;
    const flourish =
      this.castFlourishTimer > 0
        ? Math.sin((this.castFlourishTimer / 0.42) * Math.PI)
        : 0;
    const slashWave =
      this.cleaveSlashTimer > 0
        ? Math.sin((this.cleaveSlashTimer / 0.28) * Math.PI)
        : 0;
    const slashDir = this.cleaveSlashStep === 2 ? -1 : 1;
    const leap = this.psionicLeapIntensity;

    this.bodyPivot.position.set(0, 0.94 + breathe + this.ascendHeight, 0);
    this.bodyPivot.rotation.set(leap * 0.26, 0, 0);
    this.torsoGroup.rotation.set(
      0.12 + flourish * 0.24 + leap * 0.2,
      -0.22 + flourish * 0.45 + slashWave * slashDir * 0.85,
      0,
    );
    this.headGroup.rotation.set(-0.04, 0.18 - slashWave * slashDir * 0.22, 0);

    this.topKnotPivot.rotation.x = Math.sin(elapsed * 3.8) * 0.08 - leap * 0.45;
    for (let i = 0; i < this.sideBraidPivots.length; i++) {
      this.sideBraidPivots[i]!.rotation.x =
        Math.sin(elapsed * 3.2 + i) * 0.08 - leap * 0.35;
    }

    // Wide aggressive Githyanki greatsword stance (+ airborne crouch during Psionic Jump)
    this.leftLegPivot.rotation.set(-0.26 - leap * 0.65, 0, -0.1);
    this.rightLegPivot.rotation.set(0.24 - leap * 0.55, 0, 0.1);
    this.leftKneePivot.rotation.x = 0.36 + leap * 0.95;
    this.rightKneePivot.rotation.x = 0.24 + leap * 0.85;

    this.leftShoulderPivot.rotation.set(
      -0.68 - flourish * 0.45 - leap * 0.95,
      0.32,
      0.18,
    );
    this.leftElbowPivot.rotation.set(-0.88 + flourish * 0.3, 0, 0);
    this.rightShoulderPivot.rotation.set(
      -0.62 - flourish * 0.85 - leap * 1.35 + slashWave * 0.72,
      -0.22 + slashWave * slashDir * 0.95,
      -0.24 - slashWave * 0.35,
    );
    this.rightElbowPivot.rotation.set(-0.82 + flourish * 0.45 + slashWave * 0.42, 0, 0);
    this.greatswordGroup.rotation.set(
      Math.PI * 0.4 + slashWave * 0.45 - leap * 0.5,
      0,
      slashWave * slashDir * 0.38,
    );

    this.auraRing.visible = true;
    this.auraRing.scale.setScalar(1.0 + leap * 0.45);
    this.auraRing.rotation.z = elapsed * (0.95 + leap * 3.5);

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
    this.faceMat.emissiveIntensity = THREE.MathUtils.lerp(
      0.34,
      cfg.collapseFaceEmissiveDim,
      t1,
    );

    const kneelY = THREE.MathUtils.lerp(0.94, cfg.collapseKneelBodyY, t1);
    const bodyY = THREE.MathUtils.lerp(kneelY, cfg.collapseFloorBodyY, t2);
    this.bodyPivot.position.set(0, bodyY, 0);
    this.bodyPivot.rotation.set(
      cfg.collapseFallPitchRad * t2,
      0,
      -cfg.collapseFallRollRad * t2,
    );

    const kneelTorsoX = THREE.MathUtils.lerp(0.12, 0.46, t1);
    this.torsoGroup.rotation.set(
      THREE.MathUtils.lerp(kneelTorsoX, 0.08, t2),
      THREE.MathUtils.lerp(-0.22, -0.1, t2),
      THREE.MathUtils.lerp(0, 0.14, t2),
    );
    this.headGroup.rotation.set(
      THREE.MathUtils.lerp(0.38 * t1, 0.14, t2),
      THREE.MathUtils.lerp(0.18, -0.32, t2),
      THREE.MathUtils.lerp(0, 0.24, t2),
    );

    this.leftLegPivot.rotation.set(
      THREE.MathUtils.lerp(-0.9 * t1, 0.14, t2),
      0,
      THREE.MathUtils.lerp(-0.1, -0.26, t2),
    );
    this.leftKneePivot.rotation.x = THREE.MathUtils.lerp(1.52 * t1, 0.36, t2);
    this.rightLegPivot.rotation.set(
      THREE.MathUtils.lerp(0.3 * t1, -0.05, t2),
      0,
      THREE.MathUtils.lerp(0.1, 0.28, t2),
    );
    this.rightKneePivot.rotation.x = THREE.MathUtils.lerp(1.34 * t1, 0.52, t2);

    this.leftShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(0.18 * t1, -0.2, t2),
      0,
      THREE.MathUtils.lerp(0.36 * t1, 0.7, t2),
    );
    this.leftElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.4 * t1, -0.25, t2), 0, 0);
    this.rightShoulderPivot.rotation.set(
      THREE.MathUtils.lerp(-0.22 * t1, 0.16, t2),
      0,
      THREE.MathUtils.lerp(-0.26 * t1, -0.66, t2),
    );
    this.rightElbowPivot.rotation.set(THREE.MathUtils.lerp(-0.45 * t1, -0.2, t2), 0, 0);
    this.greatswordGroup.rotation.set(
      THREE.MathUtils.lerp(Math.PI * 0.4, Math.PI * 0.64, t2),
      0,
      THREE.MathUtils.lerp(0, 0.4, t2),
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
    this.hitFlashTimer = 0;
    this.castFlourishTimer = 0;
    this.psionicLeapIntensity = 0;
    this.cleaveSlashStep = 0;
    this.cleaveSlashTimer = 0;
    this.ascendHeight = 0;
    this.faceMat.emissiveIntensity = 0.34;
    this.bodyPivot.position.set(0, 0.94, 0);
    this.bodyPivot.rotation.set(0, 0, 0);
    this.greatswordGroup.rotation.set(Math.PI * 0.4, 0, 0);
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
