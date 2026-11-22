import * as THREE from 'three';
import {
  ARENA_BOUNDS_KINDS,
  ARENA_CONFIG,
  BOSS_CONFIG,
  CAMERA_CONFIG,
  ENVIRONMENT_IDS,
  FIRST_PERSON_GAZE_CONFIG,
  GAME_STATES,
  LOBBY_CONFIG,
  PALETTE,
  SIPHON_BEAM_CONFIG,
  SIPHON_GALLERY_CONFIG,
  STOLEN_KISS_CONFIG,
  type GameState,
} from '../config/gameConfig';
import {
  clampPointToCompositeLobby,
  intersectRayCompositeLobby,
  isPointInsideCompositeLobby,
  type IArenaGeometry,
} from './SceneManager';

/**
 * Narrow camera focus target contract exposed to ECS systems (ISP & DIP).
 */
export interface ICameraTarget {
  readonly position: THREE.Vector3;
  readonly focusOffsetY?: number;
}

export type CameraMode = 'TITLE' | 'COMBAT' | 'SPHERICAL_ORBIT';

/**
 * Third-person PointerLock combat follow camera + 360° spherical orbit/zoom controller
 * for interactive Siphon Finisher and Victory/Defeat Diorama states.
 */
export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  public yaw: number = CAMERA_CONFIG.initialYaw;
  public pitch: number = CAMERA_CONFIG.initialPitch;

  // Spherical 360° Orbit & Zoom state for Finisher / Dioramas
  public orbitAzimuth = 0;
  public orbitElevation: number = CAMERA_CONFIG.finisherDefaultElevation;
  public orbitDistance: number = CAMERA_CONFIG.defaultDistance;
  public isPaused = false;

  public onPointerLockChange: ((locked: boolean) => void) | null = null;

  private readonly domElement: HTMLElement;
  private rimLightScene: THREE.Scene | null = null;
  private readonly orbitRimGroup = new THREE.Group();
  private readonly violetRimLight: THREE.PointLight;
  private readonly frostRimLight: THREE.PointLight;
  private titleOrbitAngle: number = CAMERA_CONFIG.titleOrbitInitialAngle;
  private _isPointerLocked = false;
  private isDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private activeMode: CameraMode = 'TITLE';

  // Hold-[V] first-person gaze state
  private firstPersonActive = false;
  private gazePitch: number = FIRST_PERSON_GAZE_CONFIG.initialPitchRad;
  private _shouldHideRig = false;
  private readonly gazeDir = new THREE.Vector3();
  private readonly gazeEye = new THREE.Vector3();

  private shakeIntensity = 0;
  private readonly currentPosition = new THREE.Vector3(0, 3.2, -6.5);
  private readonly currentLookAt = new THREE.Vector3(
    0,
    CAMERA_CONFIG.lookAtHeight,
    0,
  );
  private readonly raycaster = new THREE.Raycaster();
  private readonly springRaycaster = new THREE.Raycaster();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  // Spring-arm wall/pillar collision & Title-to-Lobby glide state
  private currentSpringDist: number = Math.hypot(
    CAMERA_CONFIG.followDistance,
    CAMERA_CONFIG.followHeight - CAMERA_CONFIG.combatShoulderPivotY,
  );
  private _cameraDistanceToPivot: number = CAMERA_CONFIG.followDistance;
  private enterGlideElapsed = 0;
  private enterGlideDuration = 0;
  private readonly glideStartPos = new THREE.Vector3();
  private readonly glideStartLookAt = new THREE.Vector3();

  // Reusable scratch objects (zero per-frame GC churn)
  private readonly desiredPos = new THREE.Vector3();
  private readonly desiredLookAt = new THREE.Vector3();
  private readonly springPivotPos = new THREE.Vector3();
  private readonly springDir = new THREE.Vector3();
  private readonly reticleNdc = new THREE.Vector2(0, 0);
  private readonly scratchBossCenter = new THREE.Vector3();
  private readonly scratchBossSphere = new THREE.Sphere();
  private readonly scratchSphereHit = new THREE.Vector3();
  private readonly scratchFloorHit = new THREE.Vector3();

  // Bound event listeners for clean disposal
  private readonly handlePointerLockChange: () => void;
  private readonly handlePointerLockError: () => void;
  private readonly handleMouseMove: (e: MouseEvent) => void;
  private readonly handleMouseDown: (e: MouseEvent) => void;
  private readonly handleMouseUp: () => void;
  private readonly handleWheel: (e: WheelEvent) => void;
  private readonly handleTouchStart: (e: TouchEvent) => void;
  private readonly handleTouchMove: (e: TouchEvent) => void;
  private readonly handleTouchEnd: () => void;

  public get isPointerLocked(): boolean {
    return this._isPointerLocked;
  }

  public get cameraDistanceToPivot(): number {
    return this._cameraDistanceToPivot;
  }

  /** True once the gaze camera is close enough to the eye anchor that the rig must be hidden. */
  public get shouldHideRig(): boolean {
    return this._shouldHideRig;
  }

  public get isFirstPersonGazeActive(): boolean {
    return this.firstPersonActive;
  }

  /**
   * Enables/disables the planted first-person gaze camera. Gaze yaw is shared with the
   * third-person yaw so releasing returns seamlessly facing the looked-at direction.
   */
  public setFirstPersonGaze(active: boolean): void {
    if (active === this.firstPersonActive) return;
    this.firstPersonActive = active;
    if (active) {
      this.gazePitch = FIRST_PERSON_GAZE_CONFIG.initialPitchRad;
      this.cancelEnterLobbyGlide();
    } else {
      this._shouldHideRig = false;
    }
  }

  private applyPitchDelta(delta: number): void {
    if (this.firstPersonActive) {
      this.gazePitch = THREE.MathUtils.clamp(
        this.gazePitch + delta,
        FIRST_PERSON_GAZE_CONFIG.minPitchRad,
        FIRST_PERSON_GAZE_CONFIG.maxPitchRad,
      );
    } else {
      this.pitch += delta;
      this.clampCombatPitch();
    }
  }

  constructor(domElement: HTMLElement) {
    this.domElement = domElement;

    const width = domElement.clientWidth || window.innerWidth;
    const height = domElement.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_CONFIG.fov,
      width / Math.max(1, height),
      CAMERA_CONFIG.nearPlane,
      CAMERA_CONFIG.farPlane,
    );
    this.camera.near = CAMERA_CONFIG.nearPlane;
    this.camera.updateProjectionMatrix();

    // Subtle low-intensity (<= 1.2) dual-tone violet/ice-blue rim lights behind/beside focal target
    this.violetRimLight = new THREE.PointLight(
      PALETTE.voidRibbon,
      CAMERA_CONFIG.orbitRimVioletIntensity,
      CAMERA_CONFIG.orbitRimDistance,
      2.0,
    );
    this.violetRimLight.position.set(
      -CAMERA_CONFIG.orbitRimOffsetRadius,
      CAMERA_CONFIG.orbitRimOffsetY,
      -CAMERA_CONFIG.orbitRimOffsetRadius * 0.75,
    );

    this.frostRimLight = new THREE.PointLight(
      PALETTE.frostRibbon,
      CAMERA_CONFIG.orbitRimFrostIntensity,
      CAMERA_CONFIG.orbitRimDistance,
      2.0,
    );
    this.frostRimLight.position.set(
      CAMERA_CONFIG.orbitRimOffsetRadius,
      CAMERA_CONFIG.orbitRimOffsetY,
      -CAMERA_CONFIG.orbitRimOffsetRadius * 0.75,
    );

    this.orbitRimGroup.add(this.violetRimLight, this.frostRimLight);
    this.orbitRimGroup.visible = false;

    this.handlePointerLockChange = () => {
      this._isPointerLocked = document.pointerLockElement === this.domElement;
      if (this.onPointerLockChange) {
        this.onPointerLockChange(this._isPointerLocked);
      }
    };

    this.handlePointerLockError = () => {
      this._isPointerLocked = false;
    };

    this.handleMouseMove = (e: MouseEvent) => {
      if (this.isPaused) return;
      if (this.activeMode === 'SPHERICAL_ORBIT') {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.orbitAzimuth -= dx * CAMERA_CONFIG.dragSensitivity;
        this.orbitElevation += dy * CAMERA_CONFIG.dragSensitivity;
        this.clampOrbitElevation();
        return;
      }

      if (this._isPointerLocked) {
        this.yaw -= e.movementX * CAMERA_CONFIG.mouseSensitivity;
        this.applyPitchDelta(e.movementY * CAMERA_CONFIG.mouseSensitivity);
      } else if (this.isDragging) {
        const dx = e.clientX - this.lastPointerX;
        const dy = e.clientY - this.lastPointerY;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
        this.yaw -= dx * CAMERA_CONFIG.dragSensitivity;
        this.applyPitchDelta(dy * CAMERA_CONFIG.dragSensitivity);
      }
    };

    this.handleMouseDown = (e: MouseEvent) => {
      if (this.isPaused) return;
      if (!this._isPointerLocked && e.button === 0) {
        this.isDragging = true;
        this.lastPointerX = e.clientX;
        this.lastPointerY = e.clientY;
      }
    };

    this.handleMouseUp = () => {
      this.isDragging = false;
    };

    this.handleWheel = (e: WheelEvent) => {
      if (this.isPaused || this.activeMode !== 'SPHERICAL_ORBIT') return;
      e.preventDefault();
      this.orbitDistance = THREE.MathUtils.clamp(
        this.orbitDistance + e.deltaY * CAMERA_CONFIG.finisherZoomSpeed,
        CAMERA_CONFIG.minDistance,
        CAMERA_CONFIG.maxDistance,
      );
    };

    this.handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (e.touches.length === 1 && touch) {
        this.isDragging = true;
        this.lastPointerX = touch.clientX;
        this.lastPointerY = touch.clientY;
      }
    };

    this.handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!this.isDragging || e.touches.length !== 1 || !touch) return;
      const dx = touch.clientX - this.lastPointerX;
      const dy = touch.clientY - this.lastPointerY;
      this.lastPointerX = touch.clientX;
      this.lastPointerY = touch.clientY;

      const scale =
        CAMERA_CONFIG.dragSensitivity * CAMERA_CONFIG.touchSensitivityMultiplier;
      if (this.activeMode === 'SPHERICAL_ORBIT') {
        this.orbitAzimuth -= dx * scale;
        this.orbitElevation += dy * scale;
        this.clampOrbitElevation();
      } else {
        this.yaw -= dx * scale;
        this.applyPitchDelta(dy * scale);
      }
    };

    this.handleTouchEnd = () => {
      this.isDragging = false;
    };

    this.bindEvents();
  }

  private bindEvents(): void {
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleMouseMove);
    this.domElement.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.domElement.addEventListener('wheel', this.handleWheel, {
      passive: false,
    });
    this.domElement.addEventListener('touchstart', this.handleTouchStart, {
      passive: true,
    });
    this.domElement.addEventListener('touchmove', this.handleTouchMove, {
      passive: true,
    });
    this.domElement.addEventListener('touchend', this.handleTouchEnd);
  }

  private clampCombatPitch(): void {
    this.pitch = THREE.MathUtils.clamp(
      this.pitch,
      CAMERA_CONFIG.minPitch,
      CAMERA_CONFIG.maxPitch,
    );
  }

  private clampOrbitElevation(): void {
    this.orbitElevation = THREE.MathUtils.clamp(
      this.orbitElevation,
      CAMERA_CONFIG.minElevation,
      CAMERA_CONFIG.maxElevation,
    );
  }

  /**
   * Attaches the subtle dual-tone violet/ice-blue rim lights to the scene so they
   * frame the focal target automatically during Finisher and Diorama states.
   */
  public attachOrbitRimLights(scene: THREE.Scene): void {
    this.rimLightScene = scene;
    if (this.orbitRimGroup.parent !== scene) {
      scene.add(this.orbitRimGroup);
    }
  }

  public setCombatAngles(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = pitch;
    this.clampCombatPitch();
  }

  /**
   * Starts a smooth shoulder-behind glide from the live orbiting Title camera into
   * playable third-person Sanctum control over `duration` seconds.
   */
  public startEnterLobbyGlide(
    duration: number = LOBBY_CONFIG.enterGlideDuration,
  ): void {
    this.glideStartPos.copy(this.currentPosition);
    this.glideStartLookAt.copy(this.currentLookAt);
    this.enterGlideElapsed = 0;
    this.enterGlideDuration = Math.max(0.05, duration);
    this.setCombatAngles(
      CAMERA_CONFIG.combatInitialYaw,
      CAMERA_CONFIG.combatInitialPitch,
    );
  }

  public cancelEnterLobbyGlide(): void {
    this.enterGlideDuration = 0;
    this.enterGlideElapsed = 0;
  }

  public resetSphericalOrbit(
    azimuth = 0,
    elevation: number = CAMERA_CONFIG.finisherDefaultElevation,
    distance: number = CAMERA_CONFIG.defaultDistance,
  ): void {
    this.camera.near = CAMERA_CONFIG.nearPlane;
    this.camera.updateProjectionMatrix();
    this.orbitAzimuth = azimuth;
    this.orbitElevation = elevation;
    this.orbitDistance = THREE.MathUtils.clamp(
      distance,
      CAMERA_CONFIG.minDistance,
      CAMERA_CONFIG.maxDistance,
    );
    this.clampOrbitElevation();
  }

  public requestLock(): void {
    try {
      if (typeof this.domElement.requestPointerLock === 'function') {
        const result = this.domElement.requestPointerLock() as unknown;
        if (
          result &&
          typeof (result as Promise<void>).catch === 'function'
        ) {
          void (result as Promise<void>).catch(() => {});
        }
      }
    } catch {
      // Gracefully fall back to drag orbit when PointerLock is restricted
    }
  }

  public exitLock(): void {
    try {
      if (
        document.pointerLockElement &&
        typeof document.exitPointerLock === 'function'
      ) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore if pointer lock is already released
    }
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.min(
      CAMERA_CONFIG.maxShakeIntensity,
      this.shakeIntensity + amount,
    );
  }

  /**
   * Returns the horizontal forward direction vector of the camera (for WASD movement).
   */
  public getForwardXZ(outVec: THREE.Vector3): THREE.Vector3 {
    this.camera.getWorldDirection(outVec);
    outVec.y = 0;
    if (outVec.lengthSq() < 0.0001) outVec.set(0, 0, -1);
    return outVec.normalize();
  }

  /**
   * Computes a razor-accurate 3D world target point under the center screen reticle.
   */
  public getReticleTargetPoint(
    arena: IArenaGeometry | null,
    outVec: THREE.Vector3,
    bossPosition: THREE.Vector3 | null = null,
  ): THREE.Vector3 {
    this.raycaster.setFromCamera(this.reticleNdc, this.camera);

    let closestDist: number = CAMERA_CONFIG.reticleMaxDist;
    let found = false;

    // Prioritize boss torso/head sphere when center reticle aims directly at her
    if (bossPosition) {
      this.scratchBossCenter.set(
        bossPosition.x,
        bossPosition.y + CAMERA_CONFIG.reticleBossAimHeight,
        bossPosition.z,
      );
      this.scratchBossSphere.set(
        this.scratchBossCenter,
        BOSS_CONFIG.hitRadius * CAMERA_CONFIG.reticleBossRadiusMult,
      );
      if (
        this.raycaster.ray.intersectSphere(
          this.scratchBossSphere,
          this.scratchSphereHit,
        )
      ) {
        const d = this.camera.position.distanceTo(this.scratchSphereHit);
        if (d > CAMERA_CONFIG.reticleBossMinDist && d < closestDist) {
          closestDist = d;
          outVec.copy(this.scratchSphereHit);
          found = true;
        }
      }
    }

    // Check intersections against perimeter pillars
    if (arena && arena.pillarMeshes.length > 0) {
      const hits = this.raycaster.intersectObjects(
        arena.pillarMeshes as THREE.Object3D[],
        false,
      );
      const firstHit = hits[0];
      if (
        firstHit &&
        firstHit.distance > CAMERA_CONFIG.reticlePillarMinDist &&
        firstHit.distance < closestDist
      ) {
        closestDist = firstHit.distance;
        outVec.copy(firstHit.point);
        found = true;
      }
    }

    // Check intersection with active arena floor plane (y = 0)
    if (this.raycaster.ray.intersectPlane(this.floorPlane, this.scratchFloorHit)) {
      const dist = this.camera.position.distanceTo(this.scratchFloorHit);
      const bounds = arena?.bounds;
      let withinFloor = false;
      if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR) {
        withinFloor =
          Math.abs(this.scratchFloorHit.x) <=
            bounds.halfWidth + CAMERA_CONFIG.reticleFloorRadiusPad &&
          Math.abs(this.scratchFloorHit.z) <=
            bounds.halfLength + CAMERA_CONFIG.reticleFloorRadiusPad;
      } else if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY) {
        withinFloor = isPointInsideCompositeLobby(
          this.scratchFloorHit.x,
          this.scratchFloorHit.z,
          bounds,
          -CAMERA_CONFIG.reticleFloorRadiusPad,
        );
      } else {
        const radialSq =
          this.scratchFloorHit.x * this.scratchFloorHit.x +
          this.scratchFloorHit.z * this.scratchFloorHit.z;
        const maxFloorR =
          (bounds ? bounds.radius : ARENA_CONFIG.radius) +
          CAMERA_CONFIG.reticleFloorRadiusPad;
        withinFloor = radialSq <= maxFloorR * maxFloorR;
      }
      if (
        dist > CAMERA_CONFIG.reticleFloorMinDist &&
        dist < closestDist &&
        withinFloor
      ) {
        outVec.copy(this.scratchFloorHit);
        found = true;
      }
    }

    if (found) return outVec;

    return this.raycaster.ray.at(CAMERA_CONFIG.reticleFallbackDist, outVec);
  }

  /**
   * Resolves the active camera mode from the GameState machine.
   */
  public resolveModeForState(state: GameState): CameraMode {
    if (state === GAME_STATES.TITLE) return 'TITLE';
    if (
      state === GAME_STATES.SIPHON_FINISHER ||
      state === GAME_STATES.LOBBY_SIPHON ||
      state === GAME_STATES.VICTORY_DIORAMA ||
      state === GAME_STATES.ENDLESS_SAVOR ||
      state === GAME_STATES.DEFEAT_DIORAMA
    ) {
      return 'SPHERICAL_ORBIT';
    }
    return 'COMBAT';
  }

  /**
   * Updates camera transform for TITLE orbit, COMBAT follow (with spring-arm wall/pillar
   * collision clamping), or 360° SPHERICAL_ORBIT.
   */
  public update(
    dt: number,
    state: GameState,
    followTarget: ICameraTarget,
    orbitTarget: ICameraTarget | null = null,
    arena: IArenaGeometry | null = null,
  ): void {
    this.activeMode = this.resolveModeForState(state);
    const targetPos = followTarget.position;

    if (this.activeMode === 'TITLE') {
      this.orbitRimGroup.visible = false;
      this._cameraDistanceToPivot = CAMERA_CONFIG.playerFadeStartDist + 1;
      const isLobbyBackdrop =
        arena?.activeEnvironment === ENVIRONMENT_IDS.LOBBY;
      const orbitSpeed = isLobbyBackdrop
        ? LOBBY_CONFIG.titleOrbitSpeed
        : CAMERA_CONFIG.titleOrbitSpeed;
      const r = isLobbyBackdrop
        ? LOBBY_CONFIG.titleOrbitRadius
        : CAMERA_CONFIG.titleOrbitRadius;
      const orbitH = isLobbyBackdrop
        ? LOBBY_CONFIG.titleOrbitHeight
        : CAMERA_CONFIG.titleOrbitHeight;

      this.titleOrbitAngle += dt * orbitSpeed;
      this.desiredPos.set(
        targetPos.x + Math.sin(this.titleOrbitAngle) * r,
        targetPos.y + orbitH,
        targetPos.z + Math.cos(this.titleOrbitAngle) * r,
      );
      this.desiredLookAt.set(
        targetPos.x,
        targetPos.y +
          (followTarget.focusOffsetY ?? CAMERA_CONFIG.titleLookAtHeight),
        targetPos.z,
      );

      this.currentPosition.lerp(
        this.desiredPos,
        Math.min(1, dt * CAMERA_CONFIG.titlePosLerp),
      );
      this.currentLookAt.lerp(
        this.desiredLookAt,
        Math.min(1, dt * CAMERA_CONFIG.titleLookLerp),
      );
    } else if (this.activeMode === 'SPHERICAL_ORBIT') {
      this._cameraDistanceToPivot = CAMERA_CONFIG.playerFadeStartDist + 1;
      const focus = orbitTarget ?? followTarget;
      const focusY = focus.position.y + (focus.focusOffsetY ?? 0);
      const horizR = Math.cos(this.orbitElevation) * this.orbitDistance;
      const vertY = Math.sin(this.orbitElevation) * this.orbitDistance;

      this.desiredLookAt.set(focus.position.x, focusY, focus.position.z);
      this.desiredPos.set(
        focus.position.x + Math.sin(this.orbitAzimuth) * horizR,
        Math.max(0.18, focusY + vertY),
        focus.position.z + Math.cos(this.orbitAzimuth) * horizR,
      );

      this.orbitRimGroup.visible = true;
      this.orbitRimGroup.position.set(focus.position.x, focusY, focus.position.z);
      this.orbitRimGroup.rotation.y = this.orbitAzimuth;

      const smooth = Math.min(1, dt * CAMERA_CONFIG.finisherOrbitLerp);
      this.currentPosition.lerp(this.desiredPos, smooth);
      this.currentLookAt.lerp(this.desiredLookAt, smooth);
    } else if (this.firstPersonActive) {
      // Planted first-person gaze: glide to eye-level anchor, orient instantly to gaze yaw/pitch
      this.orbitRimGroup.visible = false;
      const cosP = Math.cos(this.gazePitch);
      this.gazeDir.set(
        -Math.sin(this.yaw) * cosP,
        -Math.sin(this.gazePitch),
        -Math.cos(this.yaw) * cosP,
      );
      this.gazeEye
        .set(
          targetPos.x,
          targetPos.y + FIRST_PERSON_GAZE_CONFIG.eyeHeightOffset,
          targetPos.z,
        )
        .addScaledVector(this.gazeDir, FIRST_PERSON_GAZE_CONFIG.forwardEyeOffset);

      const gazeAlpha =
        1 -
        Math.exp(
          -Math.max(0, dt) * FIRST_PERSON_GAZE_CONFIG.transitionLerpSpeed,
        );
      this.currentPosition.lerp(this.gazeEye, gazeAlpha);
      this.currentLookAt.copy(this.currentPosition).add(this.gazeDir);

      const eyeDist = this.currentPosition.distanceTo(this.gazeEye);
      this._cameraDistanceToPivot = eyeDist;
      this._shouldHideRig =
        eyeDist <= FIRST_PERSON_GAZE_CONFIG.hideRigDistanceThreshold;
    } else {
      this.orbitRimGroup.visible = false;
      const dist = CAMERA_CONFIG.followDistance;
      const heightOffset = CAMERA_CONFIG.followHeight;

      const horizDist = Math.cos(this.pitch) * dist;
      const vertOffset = Math.sin(this.pitch) * dist;

      // Shoulder pivot & ideal unobstructed camera position
      this.springPivotPos.set(
        targetPos.x,
        targetPos.y + CAMERA_CONFIG.combatShoulderPivotY,
        targetPos.z,
      );
      this.desiredPos.set(
        targetPos.x + Math.sin(this.yaw) * horizDist,
        Math.max(
          CAMERA_CONFIG.minCameraY,
          targetPos.y + heightOffset + vertOffset,
        ),
        targetPos.z + Math.cos(this.yaw) * horizDist,
      );

      // Spring-arm ray from Dark Mage shoulder pivot -> desired camera position
      this.springDir.subVectors(this.desiredPos, this.springPivotPos);
      const fullDist = Math.max(0.001, this.springDir.length());
      this.springDir.divideScalar(fullDist);

      let allowedDist = fullDist;
      const bounds = arena ? arena.getArenaBounds() : null;
      const margin = CAMERA_CONFIG.combatWallMargin;

      // 1. Analytical Bounds Clamp for enclosed rectangular halls (walls & ceiling)
      if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR) {
        const boxMinX = -(bounds.halfWidth - margin);
        const boxMaxX = bounds.halfWidth - margin;
        const boxMinZ = -(bounds.halfLength - margin);
        const boxMaxZ = bounds.halfLength - margin;
        const boxMinY = CAMERA_CONFIG.minCameraY;
        const boxMaxY = CAMERA_CONFIG.combatCeilingMaxY;

        if (this.springDir.x > 0.0001) {
          const t = (boxMaxX - this.springPivotPos.x) / this.springDir.x;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        } else if (this.springDir.x < -0.0001) {
          const t = (boxMinX - this.springPivotPos.x) / this.springDir.x;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        }

        if (this.springDir.z > 0.0001) {
          const t = (boxMaxZ - this.springPivotPos.z) / this.springDir.z;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        } else if (this.springDir.z < -0.0001) {
          const t = (boxMinZ - this.springPivotPos.z) / this.springDir.z;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        }

        if (this.springDir.y > 0.0001) {
          const t = (boxMaxY - this.springPivotPos.y) / this.springDir.y;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        } else if (this.springDir.y < -0.0001) {
          const t = (boxMinY - this.springPivotPos.y) / this.springDir.y;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        }
      } else if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY) {
        // Analytical ray-union clamp across Rotunda ∪ Southern Bridge ∪ Siphon Gallery
        const compositeDist = intersectRayCompositeLobby(
          this.springPivotPos.x,
          this.springPivotPos.z,
          this.springDir.x,
          this.springDir.z,
          allowedDist,
          bounds,
          margin,
        );
        allowedDist = Math.min(allowedDist, compositeDist);

        if (this.springDir.y > 0.0001) {
          const t =
            (CAMERA_CONFIG.combatCeilingMaxY - this.springPivotPos.y) /
            this.springDir.y;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        } else if (this.springDir.y < -0.0001) {
          const t =
            (CAMERA_CONFIG.minCameraY - this.springPivotPos.y) /
            this.springDir.y;
          if (t >= 0) allowedDist = Math.min(allowedDist, t);
        }
      } else if (
        bounds &&
        bounds.kind === ARENA_BOUNDS_KINDS.CIRCULAR &&
        arena?.activeEnvironment === ENVIRONMENT_IDS.LOBBY
      ) {
        // Analytical cylinder intersection for enclosed circular Obsidian Spire Sanctum rotunda
        const safeR = Math.max(2.0, bounds.radius - margin);
        const ox = this.springPivotPos.x;
        const oz = this.springPivotPos.z;
        const dx = this.springDir.x;
        const dz = this.springDir.z;
        const a = dx * dx + dz * dz;
        if (a > 0.00001) {
          const b = 2 * (ox * dx + oz * dz);
          const c = ox * ox + oz * oz - safeR * safeR;
          const disc = b * b - 4 * a * c;
          if (disc >= 0) {
            const tExit = (-b + Math.sqrt(disc)) / (2 * a);
            if (tExit >= 0) {
              allowedDist = Math.min(allowedDist, tExit);
            }
          }
        }
      }

      // 2. Interior Pillar Raycast against chamber ice pillars
      const colliders = arena ? arena.getCameraColliders() : [];
      if (colliders.length > 0 && allowedDist > CAMERA_CONFIG.combatMinSpringDist) {
        this.springRaycaster.set(this.springPivotPos, this.springDir);
        this.springRaycaster.near = 0.05;
        this.springRaycaster.far = allowedDist;
        const hits = this.springRaycaster.intersectObjects(
          colliders as THREE.Object3D[],
          false,
        );
        const firstHit = hits[0];
        if (firstHit) {
          allowedDist = Math.min(allowedDist, firstHit.distance - margin);
        }
      }

      // 3. Asymmetric spring smoothing: fast inward compression, smooth outward recovery
      const targetSpringDist = Math.max(
        CAMERA_CONFIG.combatMinSpringDist,
        Math.min(fullDist, allowedDist),
      );
      const isCompressing = targetSpringDist < this.currentSpringDist;
      const springSpeed = isCompressing
        ? CAMERA_CONFIG.springCompressLerp
        : CAMERA_CONFIG.springRecoverLerp;
      const springAlpha = 1 - Math.exp(-Math.max(0, dt) * springSpeed);
      this.currentSpringDist = Math.max(
        CAMERA_CONFIG.combatMinSpringDist,
        THREE.MathUtils.lerp(
          this.currentSpringDist,
          targetSpringDist,
          springAlpha,
        ),
      );

      // Reconstruct collision-safe desired position along spring ray
      this.desiredPos
        .copy(this.springPivotPos)
        .addScaledVector(this.springDir, this.currentSpringDist);

      this.desiredLookAt.set(
        targetPos.x - Math.sin(this.yaw) * CAMERA_CONFIG.lookAheadOffset,
        targetPos.y +
          (followTarget.focusOffsetY ?? CAMERA_CONFIG.lookAtHeight) -
          Math.sin(this.pitch) * CAMERA_CONFIG.lookPitchOffset,
        targetPos.z - Math.cos(this.yaw) * CAMERA_CONFIG.lookAheadOffset,
      );

      if (this.enterGlideDuration > 0) {
        this.enterGlideElapsed += dt;
        const rawT = THREE.MathUtils.clamp(
          this.enterGlideElapsed / this.enterGlideDuration,
          0,
          1,
        );
        const smoothT = rawT * rawT * (3 - 2 * rawT);
        this.currentPosition.lerpVectors(
          this.glideStartPos,
          this.desiredPos,
          smoothT,
        );
        this.currentLookAt.lerpVectors(
          this.glideStartLookAt,
          this.desiredLookAt,
          smoothT,
        );
        if (rawT >= 1) {
          this.enterGlideDuration = 0;
        }
      } else {
        const posSmooth = isCompressing
          ? 1 - Math.exp(-Math.max(0, dt) * CAMERA_CONFIG.springCompressLerp)
          : Math.min(1, dt * CAMERA_CONFIG.smoothFactor);
        this.currentPosition.lerp(this.desiredPos, posSmooth);
        this.currentLookAt.lerp(
          this.desiredLookAt,
          Math.min(1, dt * CAMERA_CONFIG.smoothFactor),
        );
      }

      // Hard-clamp final smoothed camera inside enclosed box or composite lobby so fast turns never clip a wall
      if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.RECTANGULAR) {
        this.currentPosition.x = THREE.MathUtils.clamp(
          this.currentPosition.x,
          -(bounds.halfWidth - margin),
          bounds.halfWidth - margin,
        );
        this.currentPosition.z = THREE.MathUtils.clamp(
          this.currentPosition.z,
          -(bounds.halfLength - margin),
          bounds.halfLength - margin,
        );
        this.currentPosition.y = THREE.MathUtils.clamp(
          this.currentPosition.y,
          CAMERA_CONFIG.minCameraY,
          CAMERA_CONFIG.combatCeilingMaxY,
        );
      } else if (bounds && bounds.kind === ARENA_BOUNDS_KINDS.COMPOSITE_LOBBY) {
        clampPointToCompositeLobby(this.currentPosition, bounds, margin);
        this.currentPosition.y = THREE.MathUtils.clamp(
          this.currentPosition.y,
          CAMERA_CONFIG.minCameraY,
          CAMERA_CONFIG.combatCeilingMaxY,
        );
      }

      this._cameraDistanceToPivot = this.currentPosition.distanceTo(
        this.springPivotPos,
      );
    }

    // Apply decaying camera shake
    this.camera.position.copy(this.currentPosition);
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(
        0,
        this.shakeIntensity - dt * CAMERA_CONFIG.shakeDecayRate,
      );
    }

    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Dramatic 3/4 side framing for the ranged Umbral Siphon Beam ([R]) finisher,
   * smoothly tracking both the Dark Mage raising his staff and the shielding Boss.
   * When `isLobbyGallery` is true, picks the open gallery-interior side and tighter
   * offsets so the camera never clips into Siphon Gallery walls or pillars.
   */
  public updateBeamFinisherCamera(
    dt: number,
    magePos: THREE.Vector3,
    bossPos: THREE.Vector3,
    isLobbyGallery = false,
  ): void {
    this.activeMode = 'COMBAT';
    this._shouldHideRig = false;

    const dx = bossPos.x - magePos.x;
    const dz = bossPos.z - magePos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const axisX = dx / dist;
    const axisZ = dz / dist;

    // Perpendicular side axis for a clean 3/4 side composition framing both silhouettes
    let sideX = -axisZ;
    let sideZ = axisX;

    const midX = THREE.MathUtils.lerp(
      magePos.x,
      bossPos.x,
      SIPHON_BEAM_CONFIG.cameraBossBias,
    );
    const midZ = THREE.MathUtils.lerp(
      magePos.z,
      bossPos.z,
      SIPHON_BEAM_CONFIG.cameraBossBias,
    );

    const sideOffset = isLobbyGallery
      ? SIPHON_BEAM_CONFIG.lobbyCameraSideOffset
      : SIPHON_BEAM_CONFIG.cameraSideOffset;
    const heightOffset = isLobbyGallery
      ? SIPHON_BEAM_CONFIG.lobbyCameraHeightOffset
      : SIPHON_BEAM_CONFIG.cameraHeightOffset;
    const backOffset = isLobbyGallery
      ? SIPHON_BEAM_CONFIG.lobbyCameraBackOffset
      : SIPHON_BEAM_CONFIG.standoffDistance * 0.22;
    const focusY = isLobbyGallery
      ? SIPHON_BEAM_CONFIG.lobbyCameraMidpointFocusY
      : SIPHON_BEAM_CONFIG.cameraMidpointFocusY;

    if (isLobbyGallery) {
      // Pick whichever lateral side faces into the open center of the Siphon Gallery
      const centerZ = SIPHON_GALLERY_CONFIG.galleryCenterZ;
      const candPosX = midX + sideX * sideOffset - axisX * backOffset;
      const candPosZ = midZ + sideZ * sideOffset - axisZ * backOffset;
      const candNegX = midX - sideX * sideOffset - axisX * backOffset;
      const candNegZ = midZ - sideZ * sideOffset - axisZ * backOffset;
      const distPosSq =
        candPosX * candPosX + (candPosZ - centerZ) * (candPosZ - centerZ);
      const distNegSq =
        candNegX * candNegX + (candNegZ - centerZ) * (candNegZ - centerZ);
      if (distNegSq < distPosSq) {
        sideX = -sideX;
        sideZ = -sideZ;
      }
    }

    this.desiredLookAt.set(midX, focusY, midZ);
    this.desiredPos.set(
      midX + sideX * sideOffset - axisX * backOffset,
      heightOffset,
      midZ + sideZ * sideOffset - axisZ * backOffset,
    );

    const alpha =
      1 - Math.exp(-Math.max(0, dt) * SIPHON_BEAM_CONFIG.cameraLerpSpeed);
    this.currentPosition.lerp(this.desiredPos, alpha);
    this.currentLookAt.lerp(this.desiredLookAt, alpha);

    this.orbitRimGroup.visible = true;
    this.orbitRimGroup.position.copy(this.desiredLookAt);
    this.orbitRimGroup.rotation.y = Math.atan2(axisX, axisZ);

    this.camera.position.copy(this.currentPosition);
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(
        0,
        this.shakeIntensity - dt * CAMERA_CONFIG.shakeDecayRate,
      );
    }

    this.camera.lookAt(this.currentLookAt);
  }

  /**
   * Tight 3/4 front-side close-up camera for the Mid-Fight Over-the-Shoulder Stolen Kiss,
   * framing the Sovereign's tilted-back face over her shoulder and the Dark Mage leaning in from behind.
   */
  public updateStolenKissCamera(
    dt: number,
    bossPos: THREE.Vector3,
    bossYaw: number,
    beat: 1 | 2 | 3,
  ): void {
    const cfg = STOLEN_KISS_CONFIG;
    this.activeMode = 'COMBAT';
    this._shouldHideRig = false;

    const fwdX = Math.sin(bossYaw);
    const fwdZ = Math.cos(bossYaw);
    // Right-hand side of the Sovereign (+X in boss local space): cross(up, fwd) = (fwdZ, 0, -fwdX)
    const rightX = fwdZ;
    const rightZ = -fwdX;

    const zoomScale = beat === 2 ? 0.9 : beat === 3 ? 1.42 : 1.02;
    this.desiredLookAt.set(
      bossPos.x - fwdX * 0.14 + rightX * 0.08,
      bossPos.y + cfg.cameraFocusY,
      bossPos.z - fwdZ * 0.14 + rightZ * 0.08,
    );
    this.desiredPos.set(
      bossPos.x +
        (fwdX * cfg.cameraFrontOffset + rightX * cfg.cameraSideOffset) *
          zoomScale,
      bossPos.y + cfg.cameraHeightOffset + (beat === 3 ? 0.25 : 0),
      bossPos.z +
        (fwdZ * cfg.cameraFrontOffset + rightZ * cfg.cameraSideOffset) *
          zoomScale,
    );

    const alpha = 1 - Math.exp(-Math.max(0, dt) * cfg.cameraLerpSpeed);
    this.currentPosition.lerp(this.desiredPos, alpha);
    this.currentLookAt.lerp(this.desiredLookAt, alpha);

    this.orbitRimGroup.visible = true;
    this.orbitRimGroup.position.copy(this.desiredLookAt);
    this.orbitRimGroup.rotation.y = bossYaw;

    this.camera.position.copy(this.currentPosition);
    if (this.shakeIntensity > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity = Math.max(
        0,
        this.shakeIntensity - dt * CAMERA_CONFIG.shakeDecayRate,
      );
    }

    this.camera.lookAt(this.currentLookAt);
  }

  public onResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  public dispose(): void {
    document.removeEventListener(
      'pointerlockchange',
      this.handlePointerLockChange,
    );
    document.removeEventListener(
      'pointerlockerror',
      this.handlePointerLockError,
    );
    document.removeEventListener('mousemove', this.handleMouseMove);
    this.domElement.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.domElement.removeEventListener('wheel', this.handleWheel);
    this.domElement.removeEventListener('touchstart', this.handleTouchStart);
    this.domElement.removeEventListener('touchmove', this.handleTouchMove);
    this.domElement.removeEventListener('touchend', this.handleTouchEnd);
    if (this.rimLightScene) {
      this.rimLightScene.remove(this.orbitRimGroup);
      this.rimLightScene = null;
    }
  }
}
