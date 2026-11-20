import type * as THREE from 'three';
import type {
  BossExpression,
  BossPhase,
  DrainThrottleMode,
  FinisherPoseId,
  ServantArchetype,
} from '../config/gameConfig';

/**
 * Pure data ECS component definitions (SRP & ISP).
 * Components hold only serializable state or direct scene-graph handles —
 * zero methods and zero simulation logic.
 */

export type EntityId = number;

export type Faction = 'PLAYER' | 'BOSS' | 'SERVANT';

export type ProjectileKind =
  | 'VOID_BOLT'
  | 'USURPED_BEAM'
  | 'ICE_LANCE'
  | 'GLACIAL_CRESCENT'
  | 'SPIRAL_ORB'
  | 'SERVANT_BOLT';

export type HazardKind =
  | 'UMBRAL_PULSE'
  | 'FROST_RING_NOVA'
  | 'GLACIAL_LASER'
  | 'ICE_PILLAR'
  | 'PHASE_SHOCKWAVE';

export type ServantAIState = 'IDLE' | 'CHASE' | 'ATTACK' | 'STAGGERED';

export interface Vec3Data {
  x: number;
  y: number;
  z: number;
}

export interface TransformComponent {
  position: Vec3Data;
  rotationY: number;
  scale: number;
}

export interface VelocityComponent {
  vx: number;
  vy: number;
  vz: number;
  maxSpeed: number;
}

export interface HealthComponent {
  current: number;
  max: number;
  invulnTimer: number;
  isInvulnerable: boolean;
}

export interface StaminaComponent {
  current: number;
  max: number;
  regenRate: number;
}

export interface HurtboxComponent {
  radius: number;
  minY: number;
  maxY: number;
  faction: Faction;
}

export interface PlayerTagComponent {
  readonly isPlayer: true;
}

export interface PlayerIntentComponent {
  moveForward: number;
  moveRight: number;
  primaryFireHeld: boolean;
  blinkRequested: boolean;
  pulseRequested: boolean;
  finisherExecuteRequested: boolean;
  tauntRequested: boolean;
  requestedPose: FinisherPoseId | null;
  drainThrottle: DrainThrottleMode;
}

export interface PlayerCombatStateComponent {
  dashTimer: number;
  dashCooldown: number;
  dashDirX: number;
  dashDirZ: number;
  afterimageTimer: number;
  boltCooldown: number;
  pulseCooldown: number;
  aimFaceTimer: number;
  encoreTier: number;
}

export interface MeshRefComponent {
  object3D: THREE.Object3D;
}

export interface ProjectileComponent {
  faction: Faction;
  kind: ProjectileKind;
  damage: number;
  radius: number;
  life: number;
  maxLife: number;
  trailTimer: number;
  spinSpeed: number;
  pierceRemaining: number;
  hitEntityIds: EntityId[];
  state: 'HOVER' | 'FLY';
  fireDelay: number;
  fanAngle: number;
  baseHeight: number;
  ownerEntityId: EntityId | null;
}

export interface HazardZoneComponent {
  kind: HazardKind;
  faction: Faction;
  damage: number;
  elapsed: number;
  telegraphDuration: number;
  activeDuration: number;
  currentRadius: number;
  maxRadius: number;
  hitThickness: number;
  angle: number;
  startAngle: number;
  endAngle: number;
  beamLength: number;
  hitCooldown: number;
  hasHitPlayer: boolean;
  hasTriggered: boolean;
}

export interface BossPhaseStateComponent {
  bossId: string;
  displayName: string;
  title: string;
  phase: BossPhase;
  expression: BossExpression;
  isStaggered: boolean;
  orbitAngle: number;
  orbitDir: 1 | -1;
  orbitSwitchTimer: number;
  attackCooldown: number;
  patternIndex: number;
  activePatternId: string | null;
  activePatternElapsed: number;
  activePatternDuration: number;
  activePatternLaunched: boolean;
  activePatternFireTimer: number;
  activePatternAngle: number;
  pendingPhaseOpener: boolean;
  dashTimer: number;
  dashVelX: number;
  dashVelZ: number;
  ascendHeight: number;
}

export interface SiphonableBossComponent {
  siphonProgress: number;
  finisherPose: FinisherPoseId;
  drainThrottle: DrainThrottleMode;
  isEndlessSavor: boolean;
  tauntDizzyTimer: number;
  tauntCooldown: number;
  finisherRange: number;
}

export interface ServantAIComponent {
  archetype: ServantArchetype;
  chamberIndex: number;
  aggroRadius: number;
  preferredRange: number;
  attackCooldown: number;
  attackTimer: number;
  attackDamage: number;
  state: ServantAIState;
}

export interface CloneIllusionComponent {
  ownerEntityId: EntityId;
  side: -1 | 1;
  life: number;
  maxLife: number;
  volleyTimer: number;
  volleyCount: number;
}

export interface LifetimeComponent {
  remaining: number;
  max: number;
}

/**
 * Complete registry of all ECS component traits keyed by property name.
 */
export interface ComponentMap {
  transform: TransformComponent;
  velocity: VelocityComponent;
  health: HealthComponent;
  stamina: StaminaComponent;
  hurtbox: HurtboxComponent;
  playerTag: PlayerTagComponent;
  playerIntent: PlayerIntentComponent;
  playerCombat: PlayerCombatStateComponent;
  meshRef: MeshRefComponent;
  projectile: ProjectileComponent;
  hazardZone: HazardZoneComponent;
  bossPhase: BossPhaseStateComponent;
  siphonableBoss: SiphonableBossComponent;
  servantAI: ServantAIComponent;
  cloneIllusion: CloneIllusionComponent;
  lifetime: LifetimeComponent;
}

export type ComponentKey = keyof ComponentMap;

/**
 * Plain typed ECS entity carrying an immutable ID and any combination of granular traits.
 */
export type Entity = {
  readonly id: EntityId;
} & Partial<ComponentMap>;

/**
 * Narrowed entity view returned by typed archetype queries.
 */
export type EntityWith<K extends ComponentKey> = Entity &
  Required<Pick<ComponentMap, K>>;
