/**
 * Centralized frozen configuration, aesthetic color tokens, and strict
 * string-literal state unions for Arcane Usurper.
 *
 * All numeric constants, speeds, cooldowns, hitbox radii, drain rates,
 * camera bounds, audio frequencies, and color hex values live here so
 * engine, ECS, rig, and UI modules contain zero magic numbers or inline hexes.
 */

// ============================================================================
// STRICT STATE & IDENTIFIER UNIONS
// ============================================================================

export const GAME_STATES = Object.freeze({
  TITLE: 'TITLE',
  CHAMBER_COMBAT: 'CHAMBER_COMBAT',
  PORTAL_TRANSITION: 'PORTAL_TRANSITION',
  BOSS_COMBAT: 'BOSS_COMBAT',
  STAGGER: 'STAGGER',
  SIPHON_FINISHER: 'SIPHON_FINISHER',
  VICTORY_DIORAMA: 'VICTORY_DIORAMA',
  ENDLESS_SAVOR: 'ENDLESS_SAVOR',
  ENCORE_NG_PLUS: 'ENCORE_NG_PLUS',
  DEFEAT_DIORAMA: 'DEFEAT_DIORAMA',
} as const);

export type GameState = (typeof GAME_STATES)[keyof typeof GAME_STATES];

export const BOSS_EXPRESSIONS = Object.freeze({
  COMBAT: 'COMBAT',
  STAGGER: 'STAGGER',
  SIPHON_KISS: 'SIPHON_KISS',
  DRAINED_FAINT: 'DRAINED_FAINT',
} as const);

export type BossExpression =
  (typeof BOSS_EXPRESSIONS)[keyof typeof BOSS_EXPRESSIONS];

export const FINISHER_POSE_IDS = Object.freeze({
  CHIN_LIFT: 1,
  BALLROOM_DIP: 2,
  HAIR_REINS: 3,
  STAFF_LEAN: 4,
} as const);

export type FinisherPoseId =
  (typeof FINISHER_POSE_IDS)[keyof typeof FINISHER_POSE_IDS];

export const FINISHER_POSE_LABELS: Readonly<Record<FinisherPoseId, string>> =
  Object.freeze({
    1: 'Chin-Lift Tilt',
    2: 'Glacial Ballroom Dip',
    3: 'Silver-Hair Reins',
    4: 'Staff-Prop Lean',
  } as const);

export const DRAIN_THROTTLE_MODES = Object.freeze({
  SAVOR: 'SAVOR',
  FLOW: 'FLOW',
  SURGE: 'SURGE',
} as const);

export type DrainThrottleMode =
  (typeof DRAIN_THROTTLE_MODES)[keyof typeof DRAIN_THROTTLE_MODES];

export const AUDIO_MODES = Object.freeze({
  SILENT: 'SILENT',
  COMBAT_P1: 'COMBAT_P1',
  COMBAT_P2: 'COMBAT_P2',
  COMBAT_P3: 'COMBAT_P3',
  STAGGER: 'STAGGER',
  SIPHON: 'SIPHON',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
  CHAMBER: 'CHAMBER',
} as const);

export type AudioMode = (typeof AUDIO_MODES)[keyof typeof AUDIO_MODES];

export const ENVIRONMENT_IDS = Object.freeze({
  CHAMBER: 'CHAMBER',
  SUMMIT: 'SUMMIT',
} as const);

export type EnvironmentId =
  (typeof ENVIRONMENT_IDS)[keyof typeof ENVIRONMENT_IDS];

export const ARENA_BOUNDS_KINDS = Object.freeze({
  RECTANGULAR: 'RECTANGULAR',
  CIRCULAR: 'CIRCULAR',
} as const);

export type ArenaBoundsKind =
  (typeof ARENA_BOUNDS_KINDS)[keyof typeof ARENA_BOUNDS_KINDS];

export const PORTAL_STATES = Object.freeze({
  SEALED: 'SEALED',
  IGNITED: 'IGNITED',
} as const);

export type PortalState = (typeof PORTAL_STATES)[keyof typeof PORTAL_STATES];

export const SERVANT_AI_STATES = Object.freeze({
  SPAWNING: 'SPAWNING',
  IDLE: 'IDLE',
  CHASE: 'CHASE',
  TELEGRAPH: 'TELEGRAPH',
  ATTACK: 'ATTACK',
  RECOVER: 'RECOVER',
  GUARD_BROKEN: 'GUARD_BROKEN',
  DYING: 'DYING',
} as const);

export type ServantAIState =
  (typeof SERVANT_AI_STATES)[keyof typeof SERVANT_AI_STATES];

export const SERVANT_ANIM_STATES = Object.freeze({
  SPAWNING: 'SPAWNING',
  IDLE: 'IDLE',
  MOVE: 'MOVE',
  TELEGRAPH: 'TELEGRAPH',
  ATTACK: 'ATTACK',
  GUARD_BROKEN: 'GUARD_BROKEN',
  DEAD: 'DEAD',
} as const);

export type ServantAnimState =
  (typeof SERVANT_ANIM_STATES)[keyof typeof SERVANT_ANIM_STATES];

export const DESTRUCTIBLE_PROP_TYPES = Object.freeze({
  FROST_URN: 'FROST_URN',
} as const);

export type DestructiblePropType =
  (typeof DESTRUCTIBLE_PROP_TYPES)[keyof typeof DESTRUCTIBLE_PROP_TYPES];

export const SOUL_WISP_KINDS = Object.freeze({
  PORTAL_CHARGE: 'PORTAL_CHARGE',
  HEAL_PLAYER: 'HEAL_PLAYER',
} as const);

export type SoulWispKind =
  (typeof SOUL_WISP_KINDS)[keyof typeof SOUL_WISP_KINDS];

export const BOSS_PHASES = Object.freeze({
  PHASE_1: 1,
  PHASE_2: 2,
  PHASE_3: 3,
} as const);

export type BossPhase = (typeof BOSS_PHASES)[keyof typeof BOSS_PHASES];

export const REALM_IDS = Object.freeze({
  GLACIAL_SPIRE: 'GLACIAL_SPIRE',
  CYBER_CATHEDRAL: 'CYBER_CATHEDRAL',
  ABYSSAL_PALACE: 'ABYSSAL_PALACE',
} as const);

export type RealmId = (typeof REALM_IDS)[keyof typeof REALM_IDS];

export const SERVANT_ARCHETYPES = Object.freeze({
  GLACIAL_VANGUARD: 'GLACIAL_VANGUARD',
  CRYO_ACOLYTE: 'CRYO_ACOLYTE',
  RIME_HOUND: 'RIME_HOUND',
  FROSTBITE_WARDEN: 'FROSTBITE_WARDEN',
} as const);

export type ServantArchetype =
  (typeof SERVANT_ARCHETYPES)[keyof typeof SERVANT_ARCHETYPES];

// ============================================================================
// COLOR PALETTE TOKENS (Three.js numeric hex + CSS string hex)
// ============================================================================

export const PALETTE = Object.freeze({
  // Sky & Glacial Spire Arena
  midnightSky: 0x040711,
  glacialNavy: 0x0b132b,
  iceFloor: 0x1e3a5f,
  iceFloorCenter: 0x274c77,
  iceFloorOuter: 0x132544,
  frostRunes: 0x38bdf8,
  iceHighlights: 0xe0f2fe,
  glacialPaleBlue: 0xbae6fd,

  // Obsidian Siphon Dark Mage
  abyssalCloak: 0x09090b,
  shadowSlate: 0x18181b,
  obsidianTrim: 0x27272a,
  amethystTrim: 0x8b5cf6,
  glowViolet: 0xa855f7,
  voidCoreFuchsia: 0xf5d0fe,
  pulseLavender: 0xddd6fe,
  cowlShadow: 0x020617,
  inkOutline: 0x03040a,
  silverRune: 0xcbd5e1,

  // Marina — The Glacial Empress
  marinaHair: 0xf8fafc,
  marinaHairTips: 0x38bdf8,
  marinaIris: 0x0284c7,
  marinaGown: 0xf0f9ff,
  marinaTrim: 0x7dd3fc,
  drainedAshSilver: 0x94a3b8,
  marinaSkin: 0xfff1eb,

  // Phase 2 & 3 Escalation / Telegraph Accents
  auroraSapphire: 0x0284c7,
  sovereignIndigo: 0x6366f1,
  blindingFrost: 0xe0f2fe,
  warningRune: 0x38bdf8,

  // Siphon Finisher FX Ribbons & Hearts
  voidRibbon: 0xa855f7,
  frostRibbon: 0x38bdf8,
  roseHeart: 0xf472b6,

  // Facial Canvas & UI Semantic Accents
  pureBlack: 0x000000,
  pureWhite: 0xffffff,
  snowWhite: 0xf1f5f9,
  emeraldReady: 0x34d399,
  roseMuted: 0xfb7185,
  blushCrimson: 0xf43f5e,
  lipRose: 0x9f4a58,
  deepLipBerry: 0x881337,
  deepEyeNavy: 0x041226,
  eyeMidSapphire: 0x0369a1,
  eyeDeepCyan: 0x082f49,
  eyeDarkCyan: 0x0c4a6e,
  lashSlate: 0x0f172a,
  browSlate: 0x1e293b,
  mutedSlate: 0x475569,
  coolGray: 0x64748b,

  // Royal Ice Chambers (Realm I Chamber Hall)
  royalIndigo: 0x1e1b4b,
  frostMarble: 0x0f172a,
  bannerTrim: 0x38bdf8,
  coldFlame: 0x7dd3fc,
  chamberVoid: 0x05060f,
  marbleWall: 0x111a33,
  knightFrost: 0xa5b4cf,

  // CSS Hex Strings for Canvas2D, Tailwind inline styles, and SVG tokens
  hex: Object.freeze({
    midnightSky: '#040711',
    glacialNavy: '#0B132B',
    iceFloor: '#1E3A5F',
    iceFloorCenter: '#274C77',
    iceFloorOuter: '#132544',
    frostRunes: '#38BDF8',
    iceHighlights: '#E0F2FE',
    glacialPaleBlue: '#BAE6FD',
    abyssalCloak: '#09090B',
    shadowSlate: '#18181B',
    obsidianTrim: '#27272A',
    amethystTrim: '#8B5CF6',
    glowViolet: '#A855F7',
    voidCoreFuchsia: '#F5D0FE',
    pulseLavender: '#DDD6FE',
    cowlShadow: '#020617',
    inkOutline: '#03040A',
    silverRune: '#CBD5E1',
    marinaHair: '#F8FAFC',
    marinaHairTips: '#38BDF8',
    marinaIris: '#0284C7',
    marinaGown: '#F0F9FF',
    marinaTrim: '#7DD3FC',
    drainedAshSilver: '#94A3B8',
    marinaSkin: '#FFF1EB',
    auroraSapphire: '#0284C7',
    sovereignIndigo: '#6366F1',
    blindingFrost: '#E0F2FE',
    warningRune: '#38BDF8',
    voidRibbon: '#A855F7',
    frostRibbon: '#38BDF8',
    roseHeart: '#F472B6',
    pureBlack: '#000000',
    pureWhite: '#FFFFFF',
    snowWhite: '#F1F5F9',
    emeraldReady: '#34D399',
    roseMuted: '#FB7185',
    blushCrimson: '#F43F5E',
    lipRose: '#9F4A58',
    deepLipBerry: '#881337',
    deepEyeNavy: '#041226',
    eyeMidSapphire: '#0369A1',
    eyeDeepCyan: '#082F49',
    eyeDarkCyan: '#0C4A6E',
    lashSlate: '#0F172A',
    browSlate: '#1E293B',
    mutedSlate: '#475569',
    coolGray: '#64748B',
    royalIndigo: '#1E1B4B',
    frostMarble: '#0F172A',
    bannerTrim: '#38BDF8',
    coldFlame: '#7DD3FC',
    chamberVoid: '#05060F',
    marbleWall: '#111A33',
    knightFrost: '#A5B4CF',
  } as const),

  // Canvas2D RGBA & Gradient Stop Tokens (Zero Inline Color Literals)
  rgba: Object.freeze({
    snowInner: 'rgba(224, 242, 254, 1)',
    snowOuter: 'rgba(56, 189, 248, 0.45)',
    sparkInner: 'rgba(245, 208, 254, 1)',
    sparkOuter: 'rgba(168, 85, 247, 0.55)',
    transparentBlack: 'rgba(0, 0, 0, 0)',
    floorFacetLight: 'rgba(224, 242, 254, 0.08)',
    floorFacetCyan: 'rgba(56, 189, 248, 0.09)',
    floorPrimaryEmissive: 'rgba(56, 189, 248, 0.95)',
    floorPrimaryDiffuse: 'rgba(125, 211, 252, 0.78)',
    floorHighlightEmissive: 'rgba(224, 242, 254, 0.95)',
    floorHighlightDiffuse: 'rgba(224, 242, 254, 0.85)',
    floorGlowEmissive: 'rgba(56, 189, 248, 0.35)',
    floorGlowDiffuse: 'rgba(56, 189, 248, 0.22)',
    auroraStop0: 'rgba(139, 92, 246, 0.0)',
    auroraStop1: 'rgba(139, 92, 246, 0.35)',
    auroraStop2: 'rgba(56, 189, 248, 0.72)',
    auroraStop3: 'rgba(224, 242, 254, 0.45)',
    auroraStop4: 'rgba(56, 189, 248, 0.0)',
    auroraStreakRgb: '224, 242, 254',
    auroraFadeZero: 'rgba(255, 255, 255, 0)',
    auroraFadeFull: 'rgba(255, 255, 255, 1)',
    blushCoreRgb: '244, 63, 94',
    blushSoftRgb: '251, 113, 133',
    blushHatchRgb: '225, 29, 72',
    irisCrescent: 'rgba(224, 242, 254, 0.72)',
    eyelidCrease: 'rgba(100, 116, 139, 0.55)',
    noseTint: 'rgba(180, 125, 118, 0.58)',
    lipGloss: 'rgba(255, 255, 255, 0.72)',
    puckerGloss: 'rgba(255, 255, 255, 0.82)',
    kissHeart: 'rgba(236, 72, 153, 0.85)',
    pauseBackdrop: 'rgba(9, 9, 11, 0.78)',
    pauseModalShadow:
      '0 0 36px rgba(139, 92, 246, 0.28), inset 0 0 18px rgba(56, 189, 248, 0.14)',
    pauseRestartShadow: '0 0 20px rgba(56, 189, 248, 0.22)',

    // Royal Ice Chambers Canvas Tokens
    marbleVeinLight: 'rgba(148, 163, 184, 0.14)',
    marbleVeinDeep: 'rgba(2, 6, 23, 0.45)',
    filigreeEmissive: 'rgba(56, 189, 248, 0.95)',
    filigreeDiffuse: 'rgba(125, 211, 252, 0.5)',
    filigreeGlow: 'rgba(56, 189, 248, 0.26)',
    carpetPile: 'rgba(99, 102, 241, 0.09)',
    carpetShadow: 'rgba(2, 6, 23, 0.35)',
    carpetTrimSilver: 'rgba(226, 232, 240, 0.92)',
    carpetTrimCyan: 'rgba(56, 189, 248, 0.88)',
    bannerCrestGlow: 'rgba(186, 230, 253, 0.9)',
    bannerFold: 'rgba(2, 6, 23, 0.28)',
  } as const),
} as const);

// ============================================================================
// ARENA & ENVIRONMENT CONFIGURATION
// ============================================================================

export const ARENA_CONFIG = Object.freeze({
  radius: 18.0,
  pillarRingRadius: 16.5,
  pillarCount: 12,
  pillarBaseRadius: 0.78,
  pillarCollisionRadius: 0.85,
  pillarHeight: 7.4,
  playerClampRadius: 15.5,
  fogDensity: 0.0135,
  snowCount: 350,
  snowAreaRadius: 25.0,
  snowMaxHeight: 20.0,
  floorCollisionY: 0.14,
  floorCollisionRadiusPad: 0.5,
  portalTriggerRadius: 2.5,
  toonGradientBands: Object.freeze([52, 118, 198, 255] as const),
  defaultOutlineScale: 1.045,
  floorTextureSize: 1024,
  faceTextureSize: 512,
  rendererMaxPixelRatio: 2,
  rendererToneMappingExposure: 1.08,
  maxDeltaTime: 0.05,
  hudSyncIntervalSec: 1 / 20,
  starCount: 420,
  distantSpireCount: 14,
  cliffIcicleCount: 24,

  // Calibrated Three.js r187 Physically-Based Light Intensities
  lighting: Object.freeze({
    hemiIntensity: 1.45,
    moonIntensityP1: 2.75,
    moonIntensityP2: 3.1,
    moonIntensityP3: 3.45,
    moonIntensityStagger: 2.45,
    amethystRimP1: 1.65,
    amethystRimP2: 2.2,
    amethystRimP3: 2.9,
    amethystRimStagger: 1.95,
    frostRimP1: 1.32,
    frostRimP2: 2.25,
    frostRimP3: 3.05,
    frostRimStagger: 1.15,
    shadowMapSize: 2048,
    shadowCameraExtent: 22,
    shadowCameraNear: 2,
    shadowCameraFar: 75,
    shadowBias: -0.0005,
    staffLightBaseIntensity: 4.8,
    staffLightPulseAmp: 0.5,
    staffLightCastBoost: 6.5,
    staffLightPulseBoost: 10.0,
    staffLightDistance: 9.5,
    staffLightDecay: 1.8,
    tiaraLightCombatBase: 4.2,
    tiaraLightPhaseStep: 1.4,
    tiaraLightStaggerBase: 1.9,
    tiaraLightCastBoost: 3.0,
    tiaraLightDistance: 8.5,
    tiaraLightDecay: 1.8,
    auroraScaleP1: 1.0,
    auroraSpeedP1: 1.0,
    auroraScaleP2: 1.48,
    auroraSpeedP2: 1.45,
    auroraScaleP3: 1.95,
    auroraSpeedP3: 2.05,
    auroraScaleStagger: 0.78,
    auroraSpeedStagger: 0.72,
  } as const),
} as const);

// ============================================================================
// PLAYER (OBSIDIAN SIPHON MAGE) CONFIGURATION
// ============================================================================

export const PLAYER_CONFIG = Object.freeze({
  maxHp: 100,
  maxStamina: 100,
  staminaRegen: 24.0,
  moveSpeed: 7.6,
  turnSpeed: 13.5,
  accelLerp: 14.0,
  radius: 0.45,
  spawnX: 0,
  spawnY: 0,
  spawnZ: 4.5,
  spawnYaw: Math.PI,

  // Shadow Blink Dash
  dashSpeed: 23.0,
  dashDuration: 0.22,
  dashCooldown: 1.15,
  dashStaminaCost: 28,
  dashInvulnDuration: 0.34,
  afterimageInterval: 0.042,
  afterimageLife: 0.36,
  afterimageOpacity: 0.52,
  dashCameraShake: 0.08,

  // Abyssal Void Bolt (Primary Fire)
  boltCooldown: 0.16,
  boltSpeed: 44.0,
  boltMaxLife: 1.85,
  boltRadius: 0.22,
  boltTrailInterval: 0.016,
  boltSpinSpeed: 14.0,
  boltDamage: 24,
  boltImpactSparkCount: 12,
  aimFaceDuration: 0.42,

  // Umbral Pulse (Secondary Radial Shockwave — widened ~70% projectile-clear sweep)
  pulseCooldown: 2.2,
  pulseStaminaCost: 24,
  umbralPulseRadius: 10.0,
  pulseMaxRadius: 10.0,
  pulseDuration: 0.55,
  pulseDamage: 72,
  pulseStartScale: 0.65,
  pulseSpinSpeed: 2.4,
  pulseImpactSparkCount: 22,
  pulseCameraShake: 0.16,
  pulseFlashLightDistance: 22.0,

  // Hit & Reticle Feedback
  playerHitCameraShake: 0.24,
  frostHitVignetteMs: 210,
  reticlePulseMs: 75,

  // Encore NG+ Upgrades
  encoreBoltDamageMultiplier: 1.35,
  encoreBeamPierceCount: 3,
} as const);

// ============================================================================
// BOSS (MARINA — GLACIAL EMPRESS & PHASE STRATEGIES) CONFIGURATION
// ============================================================================

export const BOSS_CONFIG = Object.freeze({
  defaultId: 'marina',
  defaultDisplayName: 'MARINA',
  defaultTitle: 'THE GLACIAL EMPRESS',
  maxHp: 1000,
  staggerThreshold: 0.08,
  moveSpeed: 5.2,
  floatHeight: 0.35,
  hitRadius: 0.85,
  hitHeight: 2.05,
  hitMinY: 0.15,
  hitMaxYPad: 0.4,
  finisherRange: 8.5,
  orbitRadius: 9.2,
  orbitAngularFactor: 0.72,
  innerTerraceLimit: 13.6,
  spawnX: 0,
  spawnY: 0,
  spawnZ: -9.0,
  spawnYaw: 0,
  turnSpeedCombat: 7.5,
  turnSpeedStagger: 4.0,
  staggerCenterLerp: 3.4,
  staggerCameraShake: 0.32,
  personalSpaceRadius: 4.8,
  personalSpacePush: 2.2,
  bodySeparationFactor: 0.85,
  encoreHpMultiplier: 1.35,

  // Incoming & Outgoing Base Damage
  boltDamage: 24,
  pulseDamage: 72,
  lanceDamage: 14,
  crescentDamage: 18,
  novaDamage: 22,
  novaTriggerDist: 4.5,

  // Phase 1 — Serene Sovereign
  phase1: Object.freeze({
    subtitle: 'PHASE I • SERENE SOVEREIGN',
    attackCooldownInitial: 1.8,
    attackCooldownReset: 1.65,
    attackCooldownMin: 1.65,
    attackCooldownMax: 2.3,
    orbitSwitchInitial: 5.5,
    orbitSwitchBase: 4.2,
    orbitSwitchJitter: 2.8,

    // Crystalline Ice Lance Fan
    lanceCount: 6,
    lanceFanArc: Math.PI * 0.72,
    lanceHoverDelayBase: 0.55,
    lanceHoverDelayStep: 0.1,
    lancePhase2SpeedScale: 0.82,
    lanceAttackDuration: 1.3,
    lanceSpreadRadius: 1.75,
    lanceBackOffset: 0.72,
    lanceBaseHeight: 1.85,
    lanceArcHeightBoost: 0.95,
    lanceSpeedP1: 25.5,
    lanceSpeedP2Plus: 27.5,
    lanceLife: 3.4,
    lanceHoverSpinSpeed: 8.0,
    lanceFlySpinSpeed: 12.0,
    lanceHitRadius: 0.72,
    lanceHitMaxY: 1.95,
    lancePillarPad: 0.25,

    // Glacial Crescent Wave
    crescentSpreadAngles: Object.freeze([-0.34, 0, 0.34] as const),
    crescentSpawnHeight: 0.72,
    crescentSpawnForwardOffset: 0.9,
    crescentTelegraphP1: 0.45,
    crescentTelegraphP2Plus: 0.36,
    crescentRecoveryDuration: 0.45,
    crescentSpeedP1: 17.5,
    crescentSpeedP2Plus: 20.0,
    crescentLife: 1.75,
    crescentHitRadius: 1.38,
    crescentArenaPad: 0.6,

    // Frost Ring Nova
    novaTelegraph: 0.42,
    novaAttackDuration: 0.92,
    novaStartRadius: 0.85,
    novaMaxRadius: 9.2,
    novaDuration: 1.05,
    novaRingHitThickness: 0.68,
    novaSpinSpeed: 1.6,
  } as const),

  // Phase 2 — Blizzard Tempest
  phase2: Object.freeze({
    subtitle: 'PHASE II • BLIZZARD TEMPEST',
    threshold: 0.55,
    moveSpeedMultiplier: 1.24,
    attackCooldownMin: 1.12,
    attackCooldownMax: 1.62,
    orbitSwitchBase: 3.0,
    transitionCooldown: 0.72,
    transitionCameraShake: 0.26,
    phaseWaveDuration: 0.85,
    phaseWaveMaxRadius: 13.5,

    // Frost Clone Illusions
    cloneDuration: 4.5,
    cloneOpacity: 0.52,
    cloneFlankOffset: 3.6,
    cloneVolleyInitialDelay: 0.72,
    cloneVolleyInterval: 1.9,
    cloneMaxVolleys: 2,
    cloneMinLifeForVolley: 0.8,
    cloneFadeWindow: 0.45,
    cloneDashSpeed: 17.0,
    cloneDashDuration: 0.26,
    cloneAttackDuration: 1.25,
    cloneMirrorLanceCount: 4,
    cloneMirrorLanceArc: Math.PI * 0.55,
    cloneLanceAngles: Object.freeze([-0.32, 0.32] as const),
    cloneLanceBaseHeight: 1.75,

    // Twin Glacial Laser Sweep
    laserTelegraph: 0.65,
    laserDuration: 2.2,
    laserRecoveryPad: 0.15,
    laserDamage: 18,
    laserLength: 24.0,
    laserHeight: 1.08,
    laserMinProjDist: 0.4,
    laserHitWidth: 0.78,
    laserHitCooldown: 0.55,
    laserSweepStartOffset: 0.88,
    laserSweepEndOffset: 0.52,
    laserCameraShake: 0.18,
    laserTailFadeStart: 0.85,
    laserMinDamageFade: 0.25,
  } as const),

  // Phase 3 — Absolute Zero Awakening
  phase3: Object.freeze({
    subtitle: 'PHASE III • ABSOLUTE ZERO AWAKENING',
    threshold: 0.2,
    moveSpeedMultiplier: 1.42,
    attackCooldownMin: 0.85,
    attackCooldownMax: 1.25,
    transitionCameraShake: 0.36,
    phaseWaveMaxRadius: 16.5,

    // Snowflake Bullet-Hell Curtain
    ascendHeight: 0.75,
    spiralArms: 6,
    spiralDuration: 3.4,
    spiralInitialFireDelay: 0.28,
    spiralStopBeforeEndPad: 0.35,
    spiralFireInterval: 0.26,
    spiralAngleStep: 0.23,
    spiralOrbSpeed: 11.4,
    spiralOrbDamage: 15,
    spiralOrbLife: 2.8,
    spiralOrbHeight: 1.08,
    spiralOrbSpawnRadius: 0.9,
    spiralOrbHitRadius: 0.68,
    spiralOrbPillarPad: 0.25,

    // Falling Ice-Pillar Telegraphs
    pillarRuneCount: 4,
    pillarRuneRadius: 2.2,
    pillarTelegraph: 0.9,
    pillarEruptDuration: 0.52,
    pillarCascadeStep: 0.08,
    pillarDamage: 22,
    pillarAttackDuration: 1.45,
    pillarPredictFactor: 0.55,
    pillarFlankOffset: 3.8,
    pillarEdgeMargin: 1.2,
    pillarCameraShake: 0.14,
  } as const),

  staggerSubtitle: 'STAGGERED • DEFENSES SHATTERED',
} as const);

// ============================================================================
// INTERACTIVE SIPHON FINISHER & DIORAMA CONFIGURATION (BLOCKS 4 & 5)
// ============================================================================

export const FINISHER_CONFIG = Object.freeze({
  // Stagger-to-Finisher Approach Blink
  approachDuration: 0.85,
  approachArrivalDistance: 1.28,
  approachDashDuration: 0.28,
  approachInvulnDuration: 0.35,
  approachAfterimageInterval: 0.06,

  // Three-Tier Drain Throttle Rates (normalized 0.0 -> 1.0 per second)
  savorRatePerSec: 0.015,
  standardRatePerSec: 0.065,
  surgeRatePerSec: 0.45,
  surgeTapBoost: 0.06,
  drainRates: Object.freeze({
    SAVOR: 0.015,
    FLOW: 0.065,
    SURGE: 0.45,
  } as const),

  // Progressive Limpness & [F] Taunt
  limpThreshold: 0.5,
  limpnessThreshold: 0.5,
  tauntDizzyDuration: 1.5,
  tauntCooldown: 0.45,
  savorParticleMultiplier: 2.0,
  endlessSavorLockedProgress: 1.0,
  spaceTapSurgeBoost: 0.06,

  // Dominance Pose Alignment & Smooth Reactive Animation (Zero Air Gap across [1-4])
  defaultRootSeparation: 0.54,
  dipRootSeparation: 0.37,
  dipBossSpineAngleRad: Math.PI * 0.25,
  dipMageExtraPitch: 0.46,
  reinsRootSeparation: 0.48,
  staffLeanRootSeparation: 0.52,
  poseBlendSpeed: 6.5,
  poseTransitionDurationSec: 0.25,
  earlyBreathFreq: 5.5,
  lateBreathFreq: 1.85,
  trembleFreq: 24.0,
  trembleSecondaryFreq: 31.5,
  surgeShudderMultiplier: 2.35,
  savorSwayMultiplier: 0.45,
  savorSwayFreq: 1.2,
  pendulumFreq: 1.55,
  pendulumAmp: 0.085,
  lipLockMaxCorrection: 0.28,
  finisherStaffLightIntensity: 1.85,
  finisherStaffLightSurgeBoost: 0.45,

  // Pose [2] (Glacial Ballroom Dip) Upright Skyward Staff Channeling Angles (~18° off vertical)
  dipRightShoulderX: -2.48,
  dipRightShoulderY: 0.14,
  dipRightShoulderZ: -0.38,
  dipRightElbowX: -1.18,
  dipRightElbowZ: -0.1,
  dipStaffRotX: 2.96,
  dipStaffRotZ: -0.18,

  // Coupled Lip-Pivot Head Choreography & Asymmetric -> <- Kiss Press-and-Ease (All 4 Poses)
  kissPressDepth: 0.022,
  kissEaseGap: 0.018,
  kissPitchNod: 0.06,
  savorPulseHz: 0.75,
  flowPulseHz: 1.25,
  surgePulseHz: 2.5,
  kissRollAmp: 0.05,
  kissAsymmetryExponent: 0.68,
  kissAlternatingRollRatio: 0.38,
  kissEarlyMageShare: 0.65,
  kissEarlyBossShare: 0.35,
  kissPassiveYieldDepth: 0.014,
  headSwayFreqSavor: 0.72,
  headSwayFreqFlow: 1.25,
  headSwayFreqSurge: 2.35,
  headRollAmpSavor: 0.14,
  headRollAmpFlow: 0.115,
  headRollAmpSurge: 0.105,
  headPitchAmpSavor: 0.048,
  headPitchAmpFlow: 0.036,
  headPitchAmpSurge: 0.055,
  headYawAmpSavor: 0.055,
  headYawAmpFlow: 0.042,
  headYawAmpSurge: 0.035,
  headHarmonicRatio: 1.63,
  headPitchFreqRatio: 1.35,
  headYawFreqRatio: 0.82,
  headTremorFreq: 21.5,
  headTremorAmp: 0.022,
  passiveNeckYieldMult: 1.35,
  passiveNeckDroopPitch: 0.055,

  // Energy Ribbon & Rim-Light FX
  ribbonSegments: 22,
  ribbonPulseSpeed: 5.5,
  ribbonSurgeWaveAmp: 0.14,
  ribbonNormalWaveAmp: 0.055,

  // Victory Collapse & Defeat "Forced Frost Puppet" Dioramas
  victoryCollapseBlendSpeed: 4.0,
  victoryVaporSpawnInterval: 0.22,
  puppetFloatFrequency: 1.8,
  puppetStringCount: 4,
  puppetSeatDistance: 1.65,
  puppetCrystalBobAmp: 0.12,
} as const);

// ============================================================================
// VICTORY / ENDLESS SAVOR / DEFEAT PUPPET DIORAMA CONFIGURATION (BLOCK 5)
// ============================================================================

export const DIORAMA_CONFIG = Object.freeze({
  // Victory Floor Collapse
  collapseLerpSpeed: 4.0,
  collapseBodyY: 0.15,
  collapseMageOffsetX: 0.78,
  collapseMageOffsetZ: 0.62,
  collapseCameraFocusY: 0.25,
  collapseCameraDistance: 2.05,
  collapseCameraElevation: 0.42,
  collapseSpiralRefreshInterval: 0.08,
  collapseSpiralSpeed: 3.8,

  // Rising Exhaustion Vapor Wisps
  vaporSpawnInterval: 0.22,
  vaporRiseSpeed: 0.62,
  vaporDriftSpeed: 0.18,
  vaporLife: 1.35,
  vaporStartRadius: 0.08,
  vaporEndScale: 2.2,

  // Siphon Climax Shockwave
  victoryShockwaveRadius: 15.0,
  victoryShockwaveDuration: 0.95,
  victoryShockwaveShake: 0.34,

  // Forced Frost Puppet Defeat Diorama
  puppetSeatDistance: 1.65,
  puppetMageBodyY: 0.34,
  puppetWaveCadence: 2.2,
  puppetWaveAmp: 0.36,
  puppetCrystalBobAmp: 0.08,
  puppetMarionetteThreadCount: 4,
  puppetThreadOpacity: 0.72,
  puppetCameraFocusY: 0.82,
  puppetCameraDistance: 2.35,
  puppetCameraElevation: 0.28,
  defeatMusicBoxStepDuration: 0.36,
  defeatMusicBoxNotes: Object.freeze([
    659.25, 587.33, 523.25, 440.0, 523.25, 587.33, 659.25, 880.0,
  ] as const),
} as const);

// ============================================================================
// ENCORE (NEW GAME+) SCALING & USURPED FROST POWER CONFIGURATION
// ============================================================================

export const NG_PLUS_CONFIG = Object.freeze({
  bossHpMultiplierPerTier: 1.35,
  bossSpeedMultiplierPerTier: 1.12,
  bossCooldownReductionPerTier: 0.92,
  minCooldownScale: 0.65,

  // Usurped Glacial Spear-Beam Upgrades (Encore Tier >= 1)
  frostBeamDamageBase: 32,
  frostBeamDamagePerTier: 6,
  frostBeamPierceCount: 3,
  frostBeamSpeed: 54.0,
  frostBeamRadius: 0.28,
  frostBeamLength: 2.2,
  frostBeamMaxLife: 2.0,
  frostWingScaleBase: 1.0,
  frostWingScalePerTier: 0.12,
  frostWingMaxScale: 1.5,
} as const);

// ============================================================================
// ROYAL ICE CHAMBERS (REALM I CHAMBER HALL, WAVES & ASTRAL PORTAL)
// ============================================================================

export interface ChamberWaveEntry {
  readonly archetype: ServantArchetype;
  readonly count: number;
}

export interface ChamberWaveRecipe {
  readonly servants: readonly ChamberWaveEntry[];
}

export const CHAMBER_CONFIG = Object.freeze({
  // Rectangular Vaulted Hall (X = width, Z = length; entrance at +Z, dais at -Z)
  width: 24,
  length: 52,
  wallHeight: 16,
  wallThickness: 1.2,
  movementWallPadding: 1.15,
  playerSpawnX: 0,
  playerSpawnZ: 19.5,
  playerSpawnYaw: Math.PI,

  // Colonnade of Faceted Hexagonal Ice Pillars & Pointed Gothic Arches
  pillarRowX: 9.0,
  pillarCountPerSide: 7,
  pillarStartZ: 19.5,
  pillarSpacing: 6.4,
  pillarHeight: 8.6,
  pillarRadius: 0.62,
  pillarCollisionRadius: 0.95,
  archApexRise: 4.6,
  archRibRadius: 0.22,
  archRibOutlineRadius: 0.3,
  archTubularSegments: 28,
  ceilingY: 14.2,

  // Royal Velvet Runner
  carpetWidth: 4.2,
  carpetStartZ: 24.5,
  carpetEndZ: -15.8,
  carpetTextureRepeat: 6,
  carpetY: 0.012,

  // Swaying Royal Crest Banners
  bannerWidth: 1.55,
  bannerHeight: 5.2,
  bannerTopY: 8.4,
  bannerSegmentsY: 10,
  bannerWallInset: 0.8,
  bannerSwayAmp: 0.16,
  bannerSwaySpeed: 1.35,
  bannerSwayPhaseStep: 0.85,

  // Cold-Flame Obsidian Braziers
  brazierInset: 1.3,
  brazierLightStride: 3,
  brazierLightIntensity: 6.0,
  brazierLightDistance: 9.0,
  brazierLightDecay: 1.8,
  brazierFlickerSpeed: 9.0,
  brazierFlickerAmp: 0.22,

  // Geometric Hanging Icicle Chandeliers
  chandelierZPositions: Object.freeze([12, 0, -12] as const),
  chandelierY: 11.4,
  chandelierSpinSpeed: 0.18,
  chandelierIcicleCount: 12,
  chandelierLightIntensity: 4.5,
  chandelierLightDistance: 16.0,
  chandelierLightDecay: 1.6,

  // Frosted Knight Statues flanking the runway
  statueZPositions: Object.freeze([16, 7, -2] as const),
  statueX: 3.6,
  statueScale: 1.35,
  statueCollisionRadius: 0.8,

  // Destructible Frost Urns along the colonnade edges
  urnCount: 8,
  urnHealAmount: 8,
  urnHp: 1,
  urnRowX: 7.25,
  urnZPositions: Object.freeze([14.2, 4.6, -5.0, -13.4] as const),
  urnHitRadius: 0.55,

  // Astral Portal Dais
  daisZ: -20.6,
  daisRadius: 5.4,
  daisTierHeights: Object.freeze([0.08, 0.16] as const),
  daisTierRadiusStep: 1.1,
  portalZ: -22.3,
  portalCenterY: 3.35,
  portalRingRadius: 2.7,
  portalTubeRadius: 0.3,
  portalRuneSegmentCount: 12,
  portalPylonOffsetX: 3.45,
  portalPylonCollisionRadius: 0.75,
  portalInteractionRadius: 4.0,
  portalSealPulseSpeed: 2.2,
  portalVortexSwirlSpeed: 1.6,
  portalVortexArms: 5,
  portalIgniteLerp: 4.0,
  portalSpinSpeed: 0.35,

  // Wave Escalation & Portal Flow
  waveEscalationDelay: 1.5,
  portalWarpDuration: 1.1,
  portalIgniteDuration: 0.9,
  portalTriggerAutoRadius: 2.2,
  portalWarpCameraRise: 3.2,
  summitCarryoverMinHpRatio: 0.4,
  wardenShieldDotThreshold: 0.45,
  wardenGuardBrokenDuration: 3.5,
  vanguardLungeSpeed: 15.5,
  vanguardLungeDuration: 0.34,
  vanguardTelegraphLength: 5.8,
  vanguardTelegraphWidth: 1.35,
  vanguardHitRadius: 1.2,
  vanguardMidRange: 5.5,
  acolyteStrafeSpeed: 2.8,
  acolyteMinBolts: 3,
  acolyteMaxBolts: 5,
  acolyteFanSpread: 0.56,
  houndPounceHitRadius: 1.1,
  houndStillSpeedThreshold: 1.4,
  wardenSlamRange: 10.5,
  wardenPillarTelegraph: 0.95,
  wardenPillarRadius: 2.35,
  wardenPillarEruptDuration: 0.52,
  encoreServantHpMultiplierPerTier: 1.3,
  encoreServantSpeedMultiplierPerTier: 1.08,
  servantSpawnPoints: Object.freeze([
    Object.freeze({ x: -5.0, z: 3.0 }),
    Object.freeze({ x: 5.0, z: 3.0 }),
    Object.freeze({ x: -6.2, z: -6.0 }),
    Object.freeze({ x: 6.2, z: -6.0 }),
    Object.freeze({ x: 0.0, z: -9.5 }),
    Object.freeze({ x: -3.2, z: 9.0 }),
    Object.freeze({ x: 3.2, z: 9.0 }),
  ] as const),

  // Soul Wisps (servant kills charge portal; urn shatters heal player)
  soulWispSpeed: 9.0,
  soulWispArcHeight: 2.4,
  soulWispMaxLife: 1.05,
  soulWispHealLife: 0.72,

  // Ambient Frost Motes drifting through the hall
  frostMoteCount: 220,
  frostMoteRiseSpeed: 0.22,
  frostMoteSwayAmp: 0.35,

  // Procedural Texture Resolutions
  floorTextureSize: 1024,
  carpetTextureSize: 512,
  bannerTextureSize: 512,

  // Indoor Royal Lighting (calibrated for Three.js r187 physically-based lights)
  lighting: Object.freeze({
    hemiIntensity: 1.2,
    keyIntensity: 2.2,
    rimIntensity: 1.15,
    fogDensity: 0.016,
    shadowExtent: 28,
    portalLightSealed: 1.6,
    portalLightIgnited: 9.0,
    portalLightDistance: 14.0,
    portalLightDecay: 1.6,
  } as const),

  WAVES: Object.freeze([
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: SERVANT_ARCHETYPES.GLACIAL_VANGUARD, count: 2 }),
        Object.freeze({ archetype: SERVANT_ARCHETYPES.CRYO_ACOLYTE, count: 2 }),
      ]),
    }),
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: SERVANT_ARCHETYPES.FROSTBITE_WARDEN, count: 1 }),
        Object.freeze({ archetype: SERVANT_ARCHETYPES.RIME_HOUND, count: 2 }),
        Object.freeze({ archetype: SERVANT_ARCHETYPES.CRYO_ACOLYTE, count: 1 }),
      ]),
    }),
  ] as readonly ChamberWaveRecipe[]),
} as const);

// ============================================================================
// CHAMBER SERVANT ARCHETYPE STATS (Marina's Royal Ice Guard)
// ============================================================================

export interface ServantArchetypeStats {
  readonly displayName: string;
  readonly maxHp: number;
  readonly moveSpeed: number;
  readonly turnSpeed: number;
  readonly damage: number;
  readonly attackCooldown: number;
  readonly attackTelegraph: number;
  readonly attackRecovery: number;
  readonly attackRange: number;
  readonly preferredRange: number;
  readonly aggroRadius: number;
  readonly hitRadius: number;
  readonly hitHeight: number;
  readonly spawnDuration: number;
  readonly scale: number;
}

export const SERVANT_CONFIG = Object.freeze({
  // Shielded halberd knight: frontal shield blocks bolts until guard is broken
  GLACIAL_VANGUARD: Object.freeze({
    displayName: 'Glacial Vanguard',
    maxHp: 140,
    moveSpeed: 3.4,
    turnSpeed: 5.5,
    damage: 16,
    attackCooldown: 2.1,
    attackTelegraph: 0.62,
    attackRecovery: 0.55,
    attackRange: 2.4,
    preferredRange: 1.8,
    aggroRadius: 30,
    hitRadius: 0.72,
    hitHeight: 2.2,
    spawnDuration: 1.1,
    scale: 1.0,
    shieldBlockArcRad: Math.PI * 0.55,
    shieldBlockDamageMultiplier: 0.15,
    guardBreakHits: 4,
    guardBreakDuration: 2.4,
    guardBrokenDamageMultiplier: 1.5,
  } as const),

  // Ranged frost caster: keeps distance and fires triple shard volleys
  CRYO_ACOLYTE: Object.freeze({
    displayName: 'Cryo Acolyte',
    maxHp: 70,
    moveSpeed: 3.0,
    turnSpeed: 7.0,
    damage: 10,
    attackCooldown: 2.6,
    attackTelegraph: 0.8,
    attackRecovery: 0.45,
    attackRange: 14.0,
    preferredRange: 9.5,
    aggroRadius: 30,
    hitRadius: 0.55,
    hitHeight: 1.95,
    spawnDuration: 1.0,
    scale: 0.95,
    boltSpeed: 13.5,
    boltRadius: 0.42,
    boltLife: 2.6,
    boltSpread: 0.22,
    boltsPerVolley: 3,
    boltHeight: 1.25,
  } as const),

  // Fast pack beast: circles the player then lunges
  RIME_HOUND: Object.freeze({
    displayName: 'Rime Hound',
    maxHp: 55,
    moveSpeed: 6.4,
    turnSpeed: 9.0,
    damage: 12,
    attackCooldown: 1.7,
    attackTelegraph: 0.42,
    attackRecovery: 0.6,
    attackRange: 5.2,
    preferredRange: 4.2,
    aggroRadius: 30,
    hitRadius: 0.6,
    hitHeight: 1.05,
    spawnDuration: 0.85,
    scale: 1.0,
    lungeSpeed: 15.0,
    lungeDuration: 0.32,
    circleAngularSpeed: 1.4,
  } as const),

  // Armored elite: slow, heavy ground-slam shockwave with long telegraph
  FROSTBITE_WARDEN: Object.freeze({
    displayName: 'Frostbite Warden',
    maxHp: 320,
    moveSpeed: 2.4,
    turnSpeed: 3.8,
    damage: 24,
    attackCooldown: 3.4,
    attackTelegraph: 1.15,
    attackRecovery: 0.9,
    attackRange: 4.2,
    preferredRange: 3.0,
    aggroRadius: 30,
    hitRadius: 1.05,
    hitHeight: 2.9,
    spawnDuration: 1.45,
    scale: 1.35,
    slamRadius: 4.6,
    armorDamageMultiplier: 0.7,
    guardBreakDuration: 3.5,
    guardBrokenDamageMultiplier: 1.5,
    slamCameraShake: 0.22,
  } as const),

  // Shared servant feedback & rig animation tuning
  hitFlashDuration: 0.12,
  hitFlashEmissiveIntensity: 0.95,
  deathDissolveDuration: 0.65,
  summonGlyphRadius: 1.4,
  rigPoseLerpSpeed: 11.5,
  spawnRiseOffset: 1.1,
  spawnScaleMin: 0.08,
  deadCollapseSpeed: 6.5,

  // Archetype animation cadences & amplitudes (zero magic numbers in rigs)
  vanguardStrideSpeed: 7.2,
  vanguardBreathSpeed: 2.4,
  vanguardTelegraphDropY: 0.16,
  vanguardLungeForwardZ: 0.48,

  acolyteFloatHeight: 0.42,
  acolyteHoverSpeed: 2.8,
  acolyteHoverAmp: 0.11,
  acolyteSigilSpinSpeed: 1.8,
  acolyteSigilFlareSpinMult: 3.2,
  acolyteSigilFlareScale: 1.38,

  houndBaseHipY: 0.62,
  houndGallopSpeed: 12.5,
  houndCrouchDropY: 0.2,
  houndPounceLiftY: 0.56,
  houndPounceForwardZ: 0.42,

  wardenStrideSpeed: 4.8,
  wardenBreathSpeed: 1.9,
  wardenTelegraphArmX: -2.55,
  wardenSlamArmX: 0.62,
  wardenGuardBreakLeanX: -0.34,
  wardenShieldOpacity: 0.66,
} as const);

// ============================================================================
// CAMERA & RETICLE CONFIGURATION
// ============================================================================

export const CAMERA_CONFIG = Object.freeze({
  fov: 55,
  near: 0.02,
  nearPlane: 0.02,
  far: 260,
  farPlane: 260,

  // Third-Person Combat Follow & Spring-Arm Wall Collision
  followDistance: 6.5,
  followHeight: 2.8,
  lookAtHeight: 1.55,
  combatShoulderPivotY: 1.55,
  combatMinSpringDist: 1.15,
  combatWallMargin: 0.55,
  combatCeilingMaxY: 11.0,
  springCompressLerp: 22.0,
  springRecoverLerp: 8.5,
  playerFadeStartDist: 1.75,
  playerMinFadeOpacity: 0.25,
  minPitch: -0.32,
  maxPitch: 0.72,
  initialYaw: Math.PI,
  combatInitialYaw: 0,
  initialPitch: 0.22,
  combatInitialPitch: 0.2,
  mouseSensitivity: 0.0022,
  dragSensitivity: 0.0045,
  touchSensitivityMultiplier: 1.2,
  smoothFactor: 12.0,
  minCameraY: 0.55,
  lookAheadOffset: 1.4,
  lookPitchOffset: 0.6,
  maxShakeIntensity: 0.45,
  shakeDecayRate: 1.8,

  // Reticle Raycast Targeting
  reticleMaxDist: 75.0,
  reticleFallbackDist: 55.0,
  reticleBossAimHeight: 1.38,
  reticleBossRadiusMult: 1.18,
  reticleBossMinDist: 1.8,
  reticlePillarMinDist: 3.0,
  reticleFloorMinDist: 3.2,
  reticleFloorRadiusPad: 2.0,

  // Title Screen Orbit
  titleOrbitRadius: 4.35,
  titleOrbitHeight: 2.05,
  titleOrbitSpeed: 0.24,
  titleOrbitInitialAngle: 0.55,
  titleLookAtHeight: 1.38,
  titlePosLerp: 6.0,
  titleLookLerp: 8.0,

  // 360° Finisher & Diorama Orbit/Zoom
  minDistance: 0.85,
  maxDistance: 3.2,
  defaultDistance: 1.55,
  minElevation: 0.08,
  maxElevation: 1.25,
  finisherMinDistance: 0.85,
  finisherMaxDistance: 3.2,
  finisherDefaultDistance: 1.55,
  finisherMinElevation: 0.08,
  finisherMaxElevation: 1.25,
  finisherDefaultElevation: 0.34,
  finisherZoomSpeed: 0.0018,
  finisherOrbitLerp: 10.0,
  orbitRimVioletIntensity: 0.95,
  orbitRimFrostIntensity: 0.9,
  orbitRimDistance: 6.5,
  orbitRimOffsetRadius: 2.15,
  orbitRimOffsetY: 0.78,
} as const);

// ============================================================================
// PROCEDURAL WEB AUDIO SYNTHESIZER & SEQUENCER CONFIGURATION
// ============================================================================

export const AUDIO_CONFIG = Object.freeze({
  masterVolume: 0.35,
  defaultMusicVolume: 0.7,
  defaultSfxVolume: 0.85,
  gainRampTime: 0.02,
  bgmGain: 0.7,
  sfxGain: 0.85,
  compressorThreshold: -16,
  compressorKnee: 18,
  compressorRatio: 6,
  muteRampTimeConstant: 0.03,
  minGainFloor: 0.0001,
  pauseToggleGuardMs: 160,
  previewChimeNotes: Object.freeze([1046.5, 1567.98] as const),
  previewChimeGain: 0.14,
  previewChimeStepSec: 0.035,
  previewChimeDurationSec: 0.24,

  // Sequencer Tempos (BPM) & Scheduling
  p1Tempo: 112,
  p2Tempo: 126,
  p3Tempo: 140,
  staggerStepDuration: 0.44,
  siphonStepDuration: 0.52,
  defaultStepDuration: 0.5,
  schedulerIntervalMs: 38,
  schedulerLookAheadSec: 0.12,
  modeSwitchLeadTimeSec: 0.05,
  initialNoteLeadTimeSec: 0.1,
  noiseBufferDurationSec: 2,

  // Ambient Wintry Wind Bed
  windFilterFrequency: 720,
  windFilterQ: 3.2,
  windLfoFrequency: 0.16,
  windLfoGain: 280,
  windRampTimeConstant: 0.25,
  windGains: Object.freeze({
    SILENT: 0.0001,
    COMBAT_P1: 0.055,
    COMBAT_P2: 0.085,
    COMBAT_P3: 0.115,
    STAGGER: 0.05,
    SIPHON: 0.025,
    VICTORY: 0.0001,
    DEFEAT: 0.05,
    CHAMBER: 0.03,
  } as const),

  // Royal Ice Chambers Harpsichord Sequencer (D-minor regal ostinato)
  chamberTempo: 104,
  chamberArp: Object.freeze([
    293.66, 440.0, 587.33, 698.46, 880.0, 698.46, 587.33, 440.0,
    277.18, 440.0, 554.37, 659.25, 880.0, 659.25, 554.37, 440.0,
  ] as const),
  chamberBass: Object.freeze([
    73.42, 73.42, 69.3, 69.3, 58.27, 58.27, 55.0, 55.0,
  ] as const),
  chamberHarpsichordGain: 0.075,
  chamberHarpsichordDuration: 0.32,
  chamberHarpsichordCutoff: 3200,
  chamberBassGain: 0.13,
  chamberBassDuration: 0.5,
  chamberAccentBellGain: 0.045,

  // Chamber SFX Tables
  urnShatterGrainCount: 7,
  urnShatterBaseFreq: 1800,
  urnShatterFreqSpread: 2600,
  shieldClangFreqs: Object.freeze([523.25, 1244.51, 1975.53] as const),
  guardBreakFreqs: Object.freeze([196.0, 155.56, 123.47] as const),
  summonGlyphFreqs: Object.freeze([880.0, 1108.73, 1318.51, 1760.0] as const),
  portalIgniteFreqs: Object.freeze([146.83, 220.0, 293.66, 440.0, 587.33] as const),
  portalWarpStartFreq: 110,
  portalWarpEndFreq: 1760,

  // Winter-Cathedral D-Minor / Dorian Note Tables (Hz)
  arpP1: Object.freeze([
    587.33, 698.46, 880.0, 1046.5, 1318.51, 1046.5, 880.0, 783.99,
  ] as const),
  arpP2: Object.freeze([
    587.33, 880.0, 1046.5, 1174.66, 1396.91, 1174.66, 1046.5, 880.0,
  ] as const),
  arpP3: Object.freeze([
    587.33, 880.0, 1174.66, 1396.91, 1567.98, 1760.0, 1396.91, 1174.66,
  ] as const),
  bassLine: Object.freeze([
    73.42, 73.42, 58.27, 58.27, 65.41, 65.41, 55.0, 65.41,
  ] as const),
  staggerChimes: Object.freeze([1174.66, 1396.91, 1046.5, 880.0] as const),
  siphonNotes: Object.freeze([293.66, 349.23, 440.0, 523.25] as const),
  victoryChord: Object.freeze([587.33, 739.99, 880.0, 1174.66] as const),
  defeatToll: Object.freeze([440.0, 349.23, 293.66] as const),

  // Default SFX Durations & Harmonic Parameters
  defaultLaserDurationSec: 2.2,
  defaultShatterIntensity: 0.85,
  umbralPulseRingNotes: Object.freeze([293.66, 440.0, 587.33] as const),
  iceLanceChimeNotes: Object.freeze([1760, 2637] as const),
} as const);
