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
  LOBBY: 'LOBBY',
  LOBBY_SIPHON: 'LOBBY_SIPHON',
  CHAMBER_COMBAT: 'CHAMBER_COMBAT',
  PORTAL_TRANSITION: 'PORTAL_TRANSITION',
  BOSS_COMBAT: 'BOSS_COMBAT',
  STOLEN_KISS: 'STOLEN_KISS',
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
  UPRIGHT_EMBRACE: 1,
  BALLROOM_DIP: 2,
} as const);

export type FinisherPoseId =
  (typeof FINISHER_POSE_IDS)[keyof typeof FINISHER_POSE_IDS];

export const FINISHER_POSE_LABELS: Readonly<Record<FinisherPoseId, string>> =
  Object.freeze({
    1: 'Upright Embrace',
    2: 'Ballroom Dip',
  } as const);

export const FINISHER_MODES = Object.freeze({
  KISS: 'KISS',
  BEAM: 'BEAM',
} as const);

export type FinisherMode =
  (typeof FINISHER_MODES)[keyof typeof FINISHER_MODES];

export const DRAIN_THROTTLE_MODES = Object.freeze({
  SAVOR: 'SAVOR',
  FLOW: 'FLOW',
  SURGE: 'SURGE',
} as const);

export type DrainThrottleMode =
  (typeof DRAIN_THROTTLE_MODES)[keyof typeof DRAIN_THROTTLE_MODES];

export const AUDIO_MODES = Object.freeze({
  SILENT: 'SILENT',
  LOBBY: 'LOBBY',
  COMBAT_P1: 'COMBAT_P1',
  COMBAT_P2: 'COMBAT_P2',
  COMBAT_P3: 'COMBAT_P3',
  STAGGER: 'STAGGER',
  SIPHON: 'SIPHON',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
  CHAMBER: 'CHAMBER',
  SUNKEN_CHAMBER: 'SUNKEN_CHAMBER',
  SUNKEN_BOSS: 'SUNKEN_BOSS',
  HARMONIC_CHAMBER: 'HARMONIC_CHAMBER',
  HARMONIC_BOSS: 'HARMONIC_BOSS',
} as const);

export type AudioMode = (typeof AUDIO_MODES)[keyof typeof AUDIO_MODES];

export const ENVIRONMENT_IDS = Object.freeze({
  LOBBY: 'LOBBY',
  CHAMBER: 'CHAMBER',
  SUMMIT: 'SUMMIT',
  SUNKEN_CHAMBER: 'SUNKEN_CHAMBER',
  SUNKEN_SUMMIT: 'SUNKEN_SUMMIT',
  HARMONIC_CHAMBER: 'HARMONIC_CHAMBER',
  HARMONIC_SUMMIT: 'HARMONIC_SUMMIT',
  SKELLIGE_PEAK: 'SKELLIGE_PEAK',
  SHARRAN_CRYPT: 'SHARRAN_CRYPT',
} as const);

export type EnvironmentId =
  (typeof ENVIRONMENT_IDS)[keyof typeof ENVIRONMENT_IDS];
export type SceneEnvironment = EnvironmentId;

export const LOBBY_PROMPT_KINDS = Object.freeze({
  REALM_1: 'REALM_1',
  REALM_2: 'REALM_2',
  REALM_3: 'REALM_3',
  REALM_2_SEALED: 'REALM_2_SEALED',
  REALM_3_SEALED: 'REALM_3_SEALED',
  ASTRAL_RIFT: 'ASTRAL_RIFT',
  TROPHY_PEDESTAL: 'TROPHY_PEDESTAL',
  SIPHON_GALLERY_WARD: 'SIPHON_GALLERY_WARD',
  MARINA_DAIS: 'MARINA_DAIS',
  SERENA_DAIS: 'SERENA_DAIS',
  MIKU_DAIS: 'MIKU_DAIS',
  YENNEFER_DAIS: 'YENNEFER_DAIS',
  SHADOWHEART_DAIS: 'SHADOWHEART_DAIS',
  GUEST_PEDESTAL_RESERVED: 'GUEST_PEDESTAL_RESERVED',
} as const);

export type LobbyPromptKind =
  (typeof LOBBY_PROMPT_KINDS)[keyof typeof LOBBY_PROMPT_KINDS];

export const ARENA_BOUNDS_KINDS = Object.freeze({
  RECTANGULAR: 'RECTANGULAR',
  CIRCULAR: 'CIRCULAR',
  COMPOSITE_LOBBY: 'COMPOSITE_LOBBY',
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
  PEARL_URN: 'PEARL_URN',
  ACOUSTIC_CAPACITOR: 'ACOUSTIC_CAPACITOR',
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
  TIDEGUARD_HOPLITE: 'TIDEGUARD_HOPLITE',
  ABYSSAL_SIREN_WEAVER: 'ABYSSAL_SIREN_WEAVER',
  RAZORFIN_MANTA: 'RAZORFIN_MANTA',
  CORAL_BASTION: 'CORAL_BASTION',
  PULSE_STRIKER: 'PULSE_STRIKER',
  SYNTH_CANTOR: 'SYNTH_CANTOR',
  FREQUENCY_DRONE: 'FREQUENCY_DRONE',
  AEGIS_MONOLITH: 'AEGIS_MONOLITH',
} as const);

export type ServantArchetype =
  (typeof SERVANT_ARCHETYPES)[keyof typeof SERVANT_ARCHETYPES];

export const SUNKEN_SERVANT_ARCHETYPES = Object.freeze({
  TIDEGUARD_HOPLITE: SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE,
  ABYSSAL_SIREN_WEAVER: SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER,
  RAZORFIN_MANTA: SERVANT_ARCHETYPES.RAZORFIN_MANTA,
  CORAL_BASTION: SERVANT_ARCHETYPES.CORAL_BASTION,
} as const);

export type SunkenServantArchetype =
  (typeof SUNKEN_SERVANT_ARCHETYPES)[keyof typeof SUNKEN_SERVANT_ARCHETYPES];

export const HARMONIC_SERVANT_ARCHETYPES = Object.freeze({
  PULSE_STRIKER: SERVANT_ARCHETYPES.PULSE_STRIKER,
  SYNTH_CANTOR: SERVANT_ARCHETYPES.SYNTH_CANTOR,
  FREQUENCY_DRONE: SERVANT_ARCHETYPES.FREQUENCY_DRONE,
  AEGIS_MONOLITH: SERVANT_ARCHETYPES.AEGIS_MONOLITH,
} as const);

export type HarmonicServantArchetype =
  (typeof HARMONIC_SERVANT_ARCHETYPES)[keyof typeof HARMONIC_SERVANT_ARCHETYPES];

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

  // Obsidian Spire Sanctum (3D Playable Hub Lobby)
  sanctumStone: 0x12101e,
  astrolabeBrass: 0xd97706,
  sunkenTeal: 0x06b6d4,
  harmonicEmerald: 0x10b981,
  harmonicMagenta: 0xec4899,
  candleWarm: 0xfbbf24,
  oakWood: 0x451a03,
  parchmentCream: 0xfef3c7,
  crimsonPotion: 0xe11d48,
  candleWax: 0xfde68a,
  galleryVelvet: 0x3b1354,

  // Realm II — The Sunken Sanctuary (Atlantean Aqueduct & Pearl Amphitheater)
  abyssalTeal: 0x041e2b,
  biolumCyan: 0x06b6d4,
  atlanteanGold: 0xeab308,
  coralRose: 0xfb7185,
  pearlWhite: 0xf8fafc,
  seaStoneDark: 0x0a2534,
  seaStoneMid: 0x103447,
  kelpEmerald: 0x0d9488,
  bronzeTrident: 0xb45309,

  // Serena — Voice of the Deep (Realm II Sovereign Boss)
  serenaSkin: 0xfef3ed,
  serenaHairBase: 0x2dd4bf,
  serenaHairMid: 0x14b8a6,
  serenaHairTips: 0x67e8f9,
  serenaTailTeal: 0x0d9488,
  serenaTailViolet: 0x7c3aed,
  serenaFinSheer: 0x38bdf8,
  serenaBodiceDeep: 0x164e63,
  serenaCoralTiara: 0xfb7185,
  serenaPearl: 0xf8fafc,
  serenaBubbleGlow: 0x67e8f9,
  serenaWhirlpoolCore: 0x14b8a6,

  // Realm III — The Harmonic Citadel (Cyber Backstage & Astral Concert Stage)
  cyberObsidian: 0x090d16,
  mikuCyan: 0x2dd4bf,
  trussChrome: 0x64748b,
  cyberStageDark: 0x0f172a,
  cyberStageMid: 0x1e293b,
  speakerConeDark: 0x09090b,
  flightCaseSlate: 0x334155,
  mikuSkin: 0xfff2ec,
  mikuHairEmerald: 0x10b981,
  mikuHairCyan: 0x2dd4bf,
  mikuHairHighlight: 0x67e8f9,
  mikuVestDark: 0x141824,
  mikuSkirtDark: 0x0d1220,
  mikuTieCyan: 0x2dd4bf,
  mikuTieCubeBlack: 0x0b0e17,
  mikuTieCubeMagenta: 0xec4899,
  mikuEyeEmerald: 0x10b981,
  mikuEyeDeepTeal: 0x065f46,
  mikuBootDark: 0x0b0f1a,

  // Special Scenarios — Astral Rift, Wolf & Raven (Geralt & Yennefer) & Skellige Peak
  riftAmber: 0xf59e0b,
  steelSilver: 0xcbd5e1,
  ashEmber: 0xf97316,
  ashCharcoal: 0x1e293b,
  yenneferSkin: 0xfde4d6,
  yenneferRaven: 0x111827,
  yenneferHairHighlight: 0x6d28d9,
  yenneferLilac: 0xc084fc,
  yenneferVioletEye: 0xa855f7,
  yenneferVelvet: 0x111118,
  yenneferFeatherDark: 0x0f172a,
  yenneferFeatherSlate: 0x1e293b,
  yenneferLace: 0xf1f5f9,
  geraltArmor: 0x1e293b,
  geraltChainmail: 0x64748b,
  geraltLeather: 0x2b2320,
  geraltSteel: 0xd1d5db,
  geraltHairSilver: 0xf1f5f9,
  geraltAmberEye: 0xf59e0b,
  geraltIgniOrange: 0xf97316,
  geraltQuenGold: 0xfacc15,
  geraltYrdenViolet: 0x9333ea,
  skelligeTwilightSky: 0x120e29,
  skelligeHorizonViolet: 0x2e1065,
  skelligeObsidianRock: 0x131722,
  skelligeSnowDust: 0xdbeafe,

  // Sharran Crypt Dungeon Arena & Baldur's Gate 3 Party Accents
  sharranObsidianFloor: 0x0b0a12,
  sharranCryptStone: 0x161422,
  sharranArchSlate: 0x1f1c2e,
  sharranLunarSilver: 0xe2e8f0,
  sharranBrazierMagenta: 0xd946ef,
  sharranShadowMist: 0x3b0764,
  bg3LaezelSteel: 0xcbd5e1,
  bg3AstarionCrimson: 0xe11d48,
  bg3GaleArcane: 0x38bdf8,
  bg3ShadowheartViolet: 0x8b5cf6,

  // Shadowheart — Dark Justiciar Sovereign
  shadowheartSkin: 0xffeae0,
  shadowheartHair: 0x0f172a,
  shadowheartHairRim: 0x3b2d68,
  shadowheartEmeraldEye: 0x10b981,
  shadowheartEmeraldGlow: 0x6ee7b7,
  shadowheartScar: 0xc27a72,
  shadowheartArmorDark: 0x1e293b,
  shadowheartArmorViolet: 0x4c1d95,
  shadowheartEmblemGlow: 0xa855f7,

  // Lae'zel — Githyanki Vanguard
  laezelSkin: 0x84cc16,
  laezelSkinDeep: 0x65a30d,
  laezelAmberEye: 0xf59e0b,
  laezelHair: 0x450a0a,
  laezelCrimson: 0x7f1d1d,
  laezelBronze: 0xb45309,
  laezelSteel: 0x64748b,
  laezelAstralBlade: 0xe2e8f0,

  // Astarion — High-Elf Vampire Spawn
  astarionSkin: 0xf1f5f9,
  astarionHair: 0xe2e8f0,
  astarionCrimsonEye: 0xef4444,
  astarionBurgundy: 0x4c0519,
  astarionNavy: 0x0f172a,
  astarionGoldTrim: 0xf59e0b,
  astarionDaggerGlow: 0xf43f5e,

  // Gale of Waterdeep — Archmage Prodigy
  galeSkin: 0xf3c6a8,
  galeHair: 0x451a03,
  galeRobePurple: 0x581c87,
  galeRobeGold: 0xf59e0b,
  galeTunicDark: 0x1e1b4b,

  // CSS Hex Strings for Canvas2D, Tailwind inline styles, and SVG tokens
  hex: Object.freeze({
    riftAmber: '#F59E0B',
    steelSilver: '#CBD5E1',
    ashEmber: '#F97316',
    yenneferSkin: '#FDE4D6',
    yenneferHairHighlight: '#6D28D9',
    yenneferLilac: '#C084FC',
    yenneferVioletEye: '#A855F7',
    yenneferRaven: '#111827',
    geraltAmberEye: '#F59E0B',
    geraltSteel: '#D1D5DB',
    geraltScar: '#B91C1C',
    geraltIgniOrange: '#F97316',
    geraltQuenGold: '#FACC15',
    geraltYrdenViolet: '#9333EA',
    skelligeTwilightSky: '#120E29',
    skelligeHorizonViolet: '#2E1065',
    skelligeObsidianRock: '#131722',
    skelligeSnowDust: '#DBEAFE',
    sharranObsidianFloor: '#0B0A12',
    sharranCryptStone: '#161422',
    sharranArchSlate: '#1F1C2E',
    sharranLunarSilver: '#E2E8F0',
    sharranBrazierMagenta: '#D946EF',
    sharranShadowMist: '#3B0764',
    bg3LaezelSteel: '#CBD5E1',
    bg3AstarionCrimson: '#E11D48',
    bg3GaleArcane: '#38BDF8',
    bg3ShadowheartViolet: '#8B5CF6',
    shadowheartSkin: '#FFEAE0',
    shadowheartHair: '#0F172A',
    shadowheartHairRim: '#3B2D68',
    shadowheartEmeraldEye: '#10B981',
    shadowheartEmeraldGlow: '#6EE7B7',
    shadowheartScar: '#C27A72',
    shadowheartArmorDark: '#1E293B',
    shadowheartArmorViolet: '#4C1D95',
    shadowheartEmblemGlow: '#A855F7',
    laezelSkin: '#84CC16',
    laezelSkinDeep: '#65A30D',
    laezelAmberEye: '#F59E0B',
    laezelHair: '#450A0A',
    laezelCrimson: '#7F1D1D',
    laezelBronze: '#B45309',
    laezelSteel: '#64748B',
    laezelAstralBlade: '#E2E8F0',
    astarionSkin: '#F1F5F9',
    astarionHair: '#E2E8F0',
    astarionCrimsonEye: '#EF4444',
    astarionBurgundy: '#4C0519',
    astarionNavy: '#0F172A',
    astarionGoldTrim: '#F59E0B',
    astarionDaggerGlow: '#F43F5E',
    galeSkin: '#F3C6A8',
    galeHair: '#451A03',
    galeRobePurple: '#581C87',
    galeRobeGold: '#F59E0B',
    galeTunicDark: '#1E1B4B',
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
    sanctumStone: '#12101E',
    astrolabeBrass: '#D97706',
    sunkenTeal: '#06B6D4',
    harmonicEmerald: '#10B981',
    harmonicMagenta: '#EC4899',
    candleWarm: '#FBBF24',
    oakWood: '#451A03',
    parchmentCream: '#FEF3C7',
    crimsonPotion: '#E11D48',
    candleWax: '#FDE68A',
    galleryVelvet: '#3B1354',
    abyssalTeal: '#041E2B',
    biolumCyan: '#06B6D4',
    atlanteanGold: '#EAB308',
    coralRose: '#FB7185',
    pearlWhite: '#F8FAFC',
    seaStoneDark: '#0A2534',
    seaStoneMid: '#103447',
    kelpEmerald: '#0D9488',
    bronzeTrident: '#B45309',
    serenaEyeTop: '#0F766E',
    serenaEyeMid: '#14B8A6',
    serenaEyeBottom: '#99F6E4',
    serenaEyeRim: '#042F2E',
    serenaBrow: '#0D9488',
    cyberObsidian: '#090D16',
    mikuCyan: '#2DD4BF',
    trussChrome: '#64748B',
    cyberStageDark: '#0F172A',
    cyberStageMid: '#1E293B',
    speakerConeDark: '#09090B',
    flightCaseSlate: '#334155',
    mikuSkin: '#FFF2EC',
    mikuEyeTop: '#065F46',
    mikuEyeMid: '#10B981',
    mikuEyeBottom: '#99F6E4',
    mikuEyeRim: '#022C22',
    mikuBrow: '#059669',
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

    // Obsidian Spire Sanctum Canvas Tokens
    sanctumTileDark: 'rgba(18, 16, 30, 0.96)',
    sanctumTileJoint: 'rgba(9, 9, 11, 0.65)',
    sanctumRuneEmissive: 'rgba(139, 92, 246, 0.95)',
    sanctumRuneDiffuse: 'rgba(168, 85, 247, 0.62)',
    sanctumRuneSoftGlow: 'rgba(139, 92, 246, 0.28)',
    sanctumNebulaViolet: 'rgba(139, 92, 246, 0.28)',
    sanctumNebulaIndigo: 'rgba(67, 56, 202, 0.24)',
    sanctumStarCore: 'rgba(248, 250, 252, 0.92)',

    // Realm II — Sunken Sanctuary Canvas Tokens
    causticCyanGlow: 'rgba(6, 182, 212, 0.36)',
    causticCyanBright: 'rgba(248, 250, 252, 0.44)',
    atlanteanGoldSoft: 'rgba(234, 179, 8, 0.55)',
    atlanteanGoldBright: 'rgba(234, 179, 8, 0.92)',
    pearlMosaicGlow: 'rgba(248, 250, 252, 0.65)',
    seaTileJoint: 'rgba(4, 30, 43, 0.72)',

    // Realm III — Harmonic Citadel Canvas Tokens
    hazardStripeCyan: 'rgba(45, 212, 191, 0.72)',
    hazardStripeMagenta: 'rgba(236, 72, 153, 0.72)',
    cyberGridEmerald: 'rgba(16, 185, 129, 0.88)',
    cyberGridMagenta: 'rgba(236, 72, 153, 0.88)',
    cyberGridSoft: 'rgba(45, 212, 191, 0.36)',
    cyberTileJoint: 'rgba(9, 13, 22, 0.78)',
    eqBarEmerald: 'rgba(16, 185, 129, 0.92)',
    eqBarCyan: 'rgba(45, 212, 191, 0.92)',
    eqBarMagenta: 'rgba(236, 72, 153, 0.95)',
    eqBarPeak: 'rgba(248, 250, 252, 0.96)',
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
  releaseKey: 'KeyX',
  releaseKeyLabel: 'X',

  // Dominance Pose Alignment & Smooth Reactive Animation (Zero Air Gap across [1-2])
  poseCount: 2,
  defaultRootSeparation: 0.54,
  dipRootSeparation: 0.37,
  dipBossSpineAngleRad: Math.PI * 0.25,
  dipMageExtraPitch: 0.46,
  mikuWaistWrapRadius: 0.31,
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

  // Planted Staff Positioning Beside Dark Mage During Finisher (Frees Both Hands)
  staffPlantedLateralOffset: 0.92,
  staffPlantedForwardOffset: -0.15,
  staffPlantedBaseY: 0.0,
  staffPlantedTiltZRad: -0.06,
  staffPlantedTiltXRad: 0.04,
  staffFerruleBottomOffsetY: 0.99,

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

export const FINISHER_RESISTANCE_CONFIG = Object.freeze({
  // 3-Stage Resistance-to-Limp Thresholds (0% -> 35% Active Push, 35% -> 75% Fading, 75% -> 100% Limp)
  stage1End: 0.35,
  stage2End: 0.75,
  stage1PushEnd: 0.82,
  stage2PushEnd: 0.08,
  stage1SlideEnd: 0.14,
  stage2SlideEnd: 0.88,
  stage2LimpEnd: 0.25,

  // Tremor, Intermittent Shoves & Throttle Reactivity
  baseTremorFreqHz: 4.4,
  secondaryTremorFreqHz: 5.8,
  stage2ShoveFreqHz: 1.55,
  baseTremorAmpRad: 0.048,
  stage2ShoveScale: 0.78,
  surgeTremorAmpMultiplier: 2.15,
  savorTremorAmpMultiplier: 0.45,
  tauntStunSlackBlendRate: 11.5,

  // Clip-Free Chest Push Clearance & Cadence-Synced Limp Pendulum Sway
  chestPushSurfaceOffset: 0.24,
  chestPushReferenceOffset: 0.24,
  chestPushClearancePitchGain: 1.6,
  limpPendulumFreqHz: 1.25,
  limpPendulumAmpRad: 0.095,
  limpPendulumElbowRatio: 0.9,
  limpPendulumCrossAmpRad: 0.045,
  limpPendulumPhaseLagRad: 0.55,
  limpPendulumElbowPhaseLagRad: 1.35,

  // Upper-Spine Resistance Arch -> Embrace Softening (decoupled from headAnchor!)
  stage1SpineArchRad: -0.055,
  stage2SpineSoftenRad: 0.045,
  stage3SpineSlumpRad: 0.085,
  spineResistanceHeadBaseY: 0.515,
  spineResistanceHeadBaseZ: 0.008,

  // Full-Body Early-Stage Struggle: Torso Pull-Back, Strained Head Roll & Shove Impulses (0% -> 50%)
  maxTorsoPullBackRad: 0.21,
  maxHipPullBackOffset: 0.11,
  maxHeadStruggleRollRad: 0.087,
  headRollFreqHz: 2.6,
  shoveIntervalMinSec: 1.1,
  shoveIntervalMaxSec: 1.5,
  shovePulseDecayRate: 8.5,
  shoveElbowFlareRad: 0.24,
  shoveChestRecoilOffset: 0.04,
  mageCounterGripBoost: 0.05,
  surgeSpikeBoost: 0.35,

  // Rig-Specific Lower-Body & Silhouette Struggle Multipliers
  marinaRibbonFlareRad: 0.32,
  marinaLegBracePitchRad: 0.18,
  serenaTailCurlRad: 0.55,
  serenaTailThrashFreqHz: 3.4,
  serenaTailThrashAmpRad: 0.36,
  mikuTwinTailFlareRad: 0.28,
  mikuStaticJitterAmpRad: 0.045,

  // Chest-Contact Elemental Backlash Sparks (drainProgress < 0.50)
  sparkCutoffDrain: 0.5,
  sparkPoolSize: 28,
  sparkBurstCount: 6,
  sparkSurgeBurstCount: 10,
  sparkSpeedMin: 0.9,
  sparkSpeedMax: 2.2,
  sparkLifetimeSec: 0.38,
  sparkSurgeEmitIntervalSec: 0.24,
  sparkGravity: 2.8,
  sparkBaseRadius: 0.028,

  // Siphon Gallery Rune-Cuff Tether Tension (LOBBY_SIPHON)
  tetherHighChargeThreshold: 0.7,
  tetherRelaxChargeThreshold: 0.5,
  tetherMaxThicknessScale: 1.75,
  tetherPulseFreqHz: 9.0,
  tetherPulseAmp: 0.22,

  // Pose-Specific 3-Stage Arm Kinematics (Zero Chest Clipping)
  // Pose [1] Upright Embrace
  uprightStage1ShoulderX: 0.08,
  uprightStage1ShoulderZ: 0.38,
  uprightStage1ElbowX: -2.18,
  uprightStage1ElbowZ: 0.34,
  uprightStage2ShoulderX: -0.02,
  uprightStage2ShoulderZ: 0.17,
  uprightStage2ElbowX: -1.08,
  uprightStage2ElbowZ: 0.16,
  uprightStage3ShoulderX: 0.16,
  uprightStage3ShoulderZ: 0.1,
  uprightStage3ElbowX: -0.1,
  uprightStage3ElbowZ: 0.0,

  // Pose [2] Ballroom Dip (Inner Right Hand braces his shoulder; Outer Left Arm reaches back -> both droop)
  dipInnerStage1ShoulderX: -0.52,
  dipInnerStage1ShoulderZ: 0.32,
  dipInnerStage1ElbowX: -1.42,
  dipInnerStage1ElbowZ: -0.34,
  dipInnerStage2ShoulderX: 0.22,
  dipInnerStage2ShoulderZ: 0.18,
  dipInnerStage2ElbowX: -0.68,
  dipInnerStage2ElbowZ: -0.12,
  dipInnerStage3ShoulderX: 0.8,
  dipInnerStage3ShoulderZ: 0.11,
  dipInnerStage3ElbowX: -0.12,
  dipInnerStage3ElbowZ: 0.0,

  dipOuterStage1ShoulderX: 0.38,
  dipOuterStage1ShoulderZ: -0.56,
  dipOuterStage1ElbowX: -0.36,
  dipOuterStage1ElbowZ: -0.14,
  dipOuterStage2ShoulderX: 0.62,
  dipOuterStage2ShoulderZ: -0.3,
  dipOuterStage2ElbowX: -0.22,
  dipOuterStage2ElbowZ: -0.05,
  dipOuterStage3ShoulderX: 0.82,
  dipOuterStage3ShoulderZ: -0.11,
  dipOuterStage3ElbowX: -0.1,
  dipOuterStage3ElbowZ: 0.0,

  // Boss-Specific Silhouette Fatigue
  marinaRibbonTailStage1X: 0.26,
  marinaRibbonTailStage3X: 0.03,
  marinaRibbonTailDipStage3X: 0.48,
  marinaRibbonTailStage1Z: 0.16,
  marinaRibbonTailStage3Z: 0.04,
  marinaRibbonLoopStage1Z: 0.28,
  marinaRibbonLoopStage3Z: 0.08,
  marinaSkirtRelaxDelta: 0.06,

  serenaTailUncurlSeg1X: 0.22,
  serenaTailUncurlSeg2X: -0.18,
  serenaTailUncurlSeg3X: -0.08,
  serenaTailUncurlSeg4X: -0.04,
  serenaDipTailUncurlSeg1X: -0.24,
  serenaDipTailUncurlSeg2X: -0.26,
  serenaDipTailUncurlSeg3X: -0.22,
  serenaDipTailUncurlSeg4X: -0.14,
  serenaTailYawRelaxScale: 0.42,
  serenaTailRollRelaxScale: 0.48,

  mikuTailFlareStage1: 0.6,
  mikuTailFlareStage3: 0.16,
  mikuDipTailFlareStage1: 0.64,
  mikuDipTailFlareStage3: 0.22,
  mikuTailSeg2FlareStage1: 0.16,
  mikuTailSeg2FlareStage3: 0.02,
  mikuTailSeg1DroopRad: 0.26,
  mikuTailSeg2DroopRad: 0.32,
  mikuTailSeg3DroopRad: 0.34,
  mikuTailSeg4DroopRad: 0.28,
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

/**
 * Frozen supine arm-rest & clearance angles for subjugated sovereigns in VICTORY_DIORAMA
 * so arms splay naturally outward along the arena floor with zero torso, skirt, sleeve, or floor clipping.
 */
export const VICTORY_DIORAMA_CONFIG = Object.freeze({
  baseShoulderAbductionRad: 0.42,
  marinaExtraAbductionRad: 0.08,
  serenaExtraAbductionRad: 0.04,
  mikuExtraAbductionRad: 0.1,
  shoulderFloorLiftRad: -0.08,
  relaxedElbowBendRad: 0.14,
  relaxedWristRollRad: 0.12,
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
// OBSIDIAN SPIRE SANCTUM (PHASE 4 PLAYABLE 3D HUB LOBBY) CONFIGURATION
// ============================================================================

export const LOBBY_CONFIG = Object.freeze({
  rotundaRadius: 12.2,
  outerWallRadius: 13.0,
  wallHeight: 11.2,
  domeRadius: 13.0,
  skyDomeRadius: 54.0,
  playerSpawn: Object.freeze({ x: 0, y: 0, z: 4.5 }),
  playerSpawnYaw: Math.PI,
  titleOrbitRadius: 4.8,
  titleOrbitHeight: 2.3,
  titleOrbitSpeed: 0.22,
  enterGlideDuration: 0.95,

  // 3 Northern Arc Realm Portals & Grounded Plinths
  realm1PortalPos: Object.freeze({ x: 0, z: -9.8 }),
  realm2PortalPos: Object.freeze({ x: -6.8, z: -7.2 }),
  realm3PortalPos: Object.freeze({ x: 6.8, z: -7.2 }),
  // West Perimeter Terrace Single Astral Rift Portal (Special Scenarios)
  astralRiftPortalPos: Object.freeze({ x: -9.8, z: -1.8 }),
  astralRiftInteractRadius: 2.8,
  astralRiftSnowMoteCount: 38,
  portalInteractRadius: 2.6,
  portalCenterY: 2.45,
  portalRingRadius: 1.95,
  portalTubeRadius: 0.22,
  portalPylonOffset: 2.45,
  portalPylonCollisionRadius: 0.6,
  portalPlinthTier1Width: 5.6,
  portalPlinthTier1Height: 0.2,
  portalPlinthTier1Depth: 2.3,
  portalPlinthTier2Width: 4.9,
  portalPlinthTier2Height: 0.18,
  portalPlinthTier2Depth: 1.75,
  portalSupportPillarOffsetX: 2.2,
  portalSupportPillarHeight: 3.35,
  portalSupportPillarRadius: 0.28,

  // Floor Summoning Circle, Non-Overlapping Runners & Side Bookshelves (keeping southern archway open)
  summoningCircleRingRadiiPx: Object.freeze([62, 76, 128, 142] as const),
  outerFloorRuneRingPx: 438,
  runnerStartRadius: 3.95,
  runnerWidth: 1.55,
  runnerBorderWidth: 1.72,
  bookshelfRadiusOffset: 0.95,
  bookshelfBayAngles: Object.freeze([
    -Math.PI * 0.4167,
    -Math.PI * 0.25,
    Math.PI * 0.25,
    Math.PI * 0.4167,
  ] as const),

  // Stolen Trophy Pedestal & Abyssal Target Crystal
  trophyPedestalPos: Object.freeze({ x: -3.2, z: 1.5 }),
  trophyInteractRadius: 2.2,
  trophyCollisionRadius: 0.65,
  dummyPos: Object.freeze({ x: 6.5, z: 2.0 }),
  dummyRadius: 0.85,
  dummyCenterY: 1.55,
  deskPos: Object.freeze({ x: -7.2, z: 3.4 }),
  deskCollisionRadius: 1.45,

  // Observatory Architecture, Astrolabe & Study Props
  archCount: 12,
  archPierCollisionRadius: 0.72,
  astrolabeY: 8.6,
  astrolabeOuterRadius: 4.5,
  astrolabeMidRadius: 3.3,
  astrolabeInnerRadius: 2.1,
  astrolabeSpeed1: 0.26,
  astrolabeSpeed2: -0.38,
  astrolabeSpeed3: 0.52,
  floatingBookCount: 3,
  candleClusterCount: 6,
  realm1SnowMoteCount: 44,
  floorTextureSize: 1024,
  skyTextureSize: 1024,
  marinaDefeatedStorageKey: 'arcane_usurper_marina_defeated',

  // Sanctum Lighting
  lighting: Object.freeze({
    hemiIntensity: 1.25,
    keyIntensity: 1.95,
    rimIntensity: 1.15,
    fogDensity: 0.0115,
    shadowExtent: 28,
    candleLightIntensity: 3.4,
    candleLightDistance: 7.5,
    portalLightIntensity: 5.2,
    portalLightDistance: 9.0,
    trophyLightIntensity: 3.8,
    trophyLightDistance: 5.5,
  } as const),
} as const);

// ============================================================================
// SIPHON GALLERY ANNEX (PHASE 5 CAPTIVE SOVEREIGN RECHARGE WING) CONFIGURATION
// ============================================================================

export const SIPHON_GALLERY_CONFIG = Object.freeze({
  marinaCoreChargeStorageKey: 'arcane_usurper_marina_core_charge',

  // Spatial Layout (Southern Archway + Velvet Bridge + Circular Gallery)
  bridgeHalfWidth: 2.3,
  bridgeStartZ: 10.8,
  bridgeEndZ: 18.8,
  bridgeVisualStartZ: 11.5,
  bridgeVisualEndZ: 18.5,
  bridgeWallHalfSpan: 2.68,
  bridgeWallHeight: 5.4,
  bridgeArchCount: 3,
  galleryCenterZ: 24.5,
  galleryRadius: 7.2,
  galleryOuterWallRadius: 7.85,
  galleryWallHeight: 8.6,
  galleryArchCount: 8,
  galleryPierCollisionRadius: 0.62,
  southArchwayZ: 12.2,
  southArchwayHalfWidth: 2.52,
  southArchwayHeight: 5.4,

  // Raised Velvet Dais Alcoves (Center-South Marina + Left Serena Tide-Pool + Right Miku Harmonic Stage)
  marinaDaisPos: Object.freeze({ x: 0, y: 0, z: 27.6 }),
  serenaDaisPos: Object.freeze({ x: -4.75, y: 0, z: 24.9 }),
  mikuDaisPos: Object.freeze({ x: 4.75, y: 0, z: 24.9 }),
  leftDormantDaisPos: Object.freeze({ x: -4.75, y: 0, z: 24.9 }),
  rightDormantDaisPos: Object.freeze({ x: 4.75, y: 0, z: 24.9 }),

  // East Twin-Pedestal Guest Wing (Accessed through East Archway off Siphon Gallery)
  guestWingMinX: 5.0,
  guestWingMaxX: 15.0,
  guestWingMinZ: 19.0,
  guestWingMaxZ: 25.6,
  guestWingOuterMaxX: 15.6,
  guestWingOuterMinZ: 18.4,
  guestWingOuterMaxZ: 26.2,
  guestPedestal1Pos: Object.freeze({ x: 13.3, y: 0, z: 20.5 }),
  guestPedestal1FacingYaw: -Math.PI * 0.56,
  guestPedestal2Pos: Object.freeze({ x: 13.3, y: 0, z: 24.1 }),
  guestPedestal2FacingYaw: -Math.PI * 0.44,
  guestPedestalRadius: 1.52,
  guestPedestalCollisionRadius: 1.1,
  guestSiphonInitialAzimuth: -Math.PI * 0.56 - 0.52,
  guestPedestal2SiphonInitialAzimuth: -Math.PI * 0.44 - 0.52,
  daisRadius: 1.85,
  serenaDaisRadius: 1.72,
  mikuDaisRadius: 1.72,
  dormantDaisRadius: 1.45,
  daisHeight: 0.28,
  serenaPoolSurfaceY: 0.285,
  daisCollisionRadius: 1.15,
  dormantDaisCollisionRadius: 1.35,
  interactRadius: 2.6,
  wardInteractRadius: 2.8,

  // Bound Sovereign Captive Postures, Arcane Rune-Cuffs & Core Reservoir Crystals
  marinaFacingYaw: Math.PI,
  serenaFacingYaw: 1.655,
  mikuFacingYaw: -1.655,
  conduitOffsetX: 1.32,
  conduitOffsetZ: -0.22,
  serenaConduitOffsetX: 1.24,
  serenaConduitOffsetZ: -0.22,
  mikuConduitOffsetX: 1.24,
  mikuConduitOffsetZ: -0.22,
  conduitHeight: 2.05,
  conduitTipY: 1.88,
  reservoirOffsetX: 2.15,
  reservoirOffsetZ: -0.45,
  serenaReservoirOffsetX: -1.92,
  serenaReservoirOffsetZ: -0.48,
  mikuReservoirOffsetX: 1.92,
  mikuReservoirOffsetZ: -0.48,
  reservoirHeight: 2.35,
  reservoirCoreRadius: 0.22,
  reservoirMinFillScale: 0.04,
  runeSegmentCount: 12,
  runeRingInnerRadius: 1.98,
  runeRingOuterRadius: 2.18,
  serenaRuneRingInnerRadius: 1.82,
  serenaRuneRingOuterRadius: 2.02,
  mikuRuneRingInnerRadius: 1.82,
  mikuRuneRingOuterRadius: 2.02,
  tetherRadius: 0.016,
  wristCuffRadius: 0.056,
  wristCuffTube: 0.014,
  captiveLowChargeThreshold: 0.2,
  captiveHighChargeThreshold: 0.72,
  captiveBreathFreqMin: 1.45,
  captiveBreathFreqMax: 2.5,
  captiveHeadDroopMax: 0.34,
  captiveHeadLiftMin: -0.14,
  captiveTorsoSlumpMax: 0.3,
  captiveTorsoUprightMin: 0.14,
  captiveKneelBodyY: 0.48,
  captiveFaceRedrawIntervalSec: 0.12,

  // Recharge Rates & Bounds
  passiveRechargePerSec: 0.018,
  chamberWaveRechargeBonus: 0.35,
  bossDefeatRechargeBonus: 1.0,
  minDrainableCharge: 0.05,
  defaultCoreCharge: 1.0,
  chargeStoreSyncIntervalSec: 0.2,
  releaseStandOffsetZ: 2.25,
  siphonInitialAzimuth: Math.PI + 0.55,
  serenaSiphonInitialAzimuth: 1.655 + 0.55,
  mikuSiphonInitialAzimuth: -1.655 - 0.55,

  // Gallery Atmosphere & Cold-Flame Brazier Lights
  brazierLightIntensity: 3.1,
  brazierLightDistance: 10.5,
  reservoirLightIntensity: 3.4,
  reservoirLightDistance: 7.5,
  wardRippleDuration: 0.65,
} as const);

// ============================================================================
// REALM II — THE SUNKEN SANCTUARY (AQUEDUCT CHAMBERS, SERVANTS & SERENA)
// ============================================================================

export interface SunkenWaveEntry {
  readonly archetype: SunkenServantArchetype;
  readonly count: number;
}

export interface SunkenChamberWaveRecipe {
  readonly servants: readonly SunkenWaveEntry[];
}

export const SUNKEN_CHAMBER_CONFIG = Object.freeze({
  // Rectangular Flooded Atlantean Hall Bounds (matching Realm I Chamber scale)
  width: 24,
  length: 52,
  wallHeight: 11.4,
  wallThickness: 1.2,
  movementWallPadding: 1.2,
  playerSpawnX: 0,
  playerSpawnZ: 22.0,
  playerSpawnYaw: Math.PI,

  // Fluted Coral-Overgrown Aqueduct Colonnade
  pillarCountPerSide: 6,
  pillarRowX: 8.4,
  pillarStartZ: 18.5,
  pillarSpacing: 7.4,
  pillarRadius: 0.7,
  pillarCollisionRadius: 0.9,
  pillarHeight: 8.6,
  archApexRise: 3.6,
  archRibRadius: 0.24,
  archTubularSegments: 24,
  ceilingY: 13.8,

  // Animated Water-Caustic Floor Overlay
  causticY: 0.025,
  causticScrollSpeedX: 0.045,
  causticScrollSpeedY: 0.072,
  causticOpacityBase: 0.42,
  causticPulseAmp: 0.1,
  floorTextureSize: 1024,
  causticTextureSize: 512,

  // Swaying Ribbon-Kelp Fronds along outer edges
  kelpCountPerSide: 10,
  kelpRowX: 10.4,
  kelpStartZ: 21.0,
  kelpSpacing: 4.4,
  kelpHeight: 5.8,
  kelpWidth: 0.55,
  kelpSegmentsY: 10,
  kelpSwayAmp: 0.28,
  kelpSwaySpeed: 1.45,

  // Rising Bioluminescent Plankton & Bubble Motes
  bubbleMoteCount: 240,
  bubbleRiseSpeed: 0.58,
  bubbleSwayAmp: 0.42,

  // 8 Destructible Luminous Pearl Urns
  urnCount: 8,
  urnHealAmount: 8,
  urnHp: 1,
  urnRowX: 7.25,
  urnZPositions: Object.freeze([14.2, 4.6, -5.0, -13.4] as const),
  urnHitRadius: 0.58,

  // Coral-Encrusted Tidal Astral Portal Dais
  daisZ: -20.6,
  daisRadius: 5.4,
  daisTierHeights: Object.freeze([0.1, 0.18] as const),
  daisTierRadiusStep: 1.05,
  portalZ: -22.3,
  portalCenterY: 3.35,
  portalRingRadius: 2.7,
  portalTubeRadius: 0.3,
  portalRuneSegmentCount: 12,
  portalPylonOffsetX: 3.45,
  portalPylonCollisionRadius: 0.75,
  portalInteractionRadius: 4.0,
  portalSealPulseSpeed: 2.0,
  portalVortexSwirlSpeed: 1.7,
  portalVortexArms: 6,
  portalIgniteLerp: 4.0,
  portalSpinSpeed: 0.38,

  // Wave Escalation & Portal Flow
  waveEscalationDelay: 1.5,
  portalWarpDuration: 1.1,
  portalIgniteDuration: 0.9,

  // Underwater Atlantean Lighting
  lighting: Object.freeze({
    hemiIntensity: 1.25,
    keyIntensity: 2.05,
    rimIntensity: 1.35,
    fogDensity: 0.0175,
    shadowExtent: 28,
    portalLightSealed: 1.8,
    portalLightIgnited: 9.2,
    portalLightDistance: 15.0,
    portalLightDecay: 1.6,
    brazierLightIntensity: 5.2,
    brazierLightDistance: 10.0,
    brazierLightDecay: 1.7,
  } as const),

  WAVES: Object.freeze([
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: SUNKEN_SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE, count: 2 }),
        Object.freeze({ archetype: SUNKEN_SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER, count: 2 }),
      ]),
    }),
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: SUNKEN_SERVANT_ARCHETYPES.CORAL_BASTION, count: 1 }),
        Object.freeze({ archetype: SUNKEN_SERVANT_ARCHETYPES.RAZORFIN_MANTA, count: 2 }),
        Object.freeze({ archetype: SUNKEN_SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER, count: 1 }),
      ]),
    }),
  ] as readonly SunkenChamberWaveRecipe[]),
} as const);

export const SUNKEN_SERVANT_CONFIG = Object.freeze({
  // Bronze-shielded Atlantean spearman: frontal phalanx shield + thrust telegraph
  TIDEGUARD_HOPLITE: Object.freeze({
    displayName: 'Tideguard Hoplite',
    maxHp: 150,
    moveSpeed: 3.3,
    turnSpeed: 5.4,
    damage: 17,
    attackCooldown: 2.15,
    attackTelegraph: 0.64,
    attackRecovery: 0.55,
    attackRange: 2.6,
    preferredRange: 1.9,
    aggroRadius: 30,
    hitRadius: 0.74,
    hitHeight: 2.25,
    spawnDuration: 1.1,
    scale: 1.0,
    shieldBlockArcRad: Math.PI * 0.58,
    shieldBlockDamageMultiplier: 0.15,
    guardBreakHits: 4,
    guardBreakDuration: 2.5,
    guardBrokenDamageMultiplier: 1.5,
  } as const),

  // Floating oceanic caster: launches bioluminescent pearl-bubble volleys
  ABYSSAL_SIREN_WEAVER: Object.freeze({
    displayName: 'Abyssal Siren Weaver',
    maxHp: 75,
    moveSpeed: 3.1,
    turnSpeed: 7.2,
    damage: 11,
    attackCooldown: 2.45,
    attackTelegraph: 0.68,
    attackRecovery: 0.5,
    attackRange: 15.5,
    preferredRange: 10.5,
    aggroRadius: 30,
    hitRadius: 0.56,
    hitHeight: 1.98,
    spawnDuration: 1.0,
    scale: 0.96,
    boltSpeed: 12.8,
    boltRadius: 0.44,
    boltLife: 2.8,
    boltSpread: 0.24,
    boltsPerVolley: 3,
    boltHeight: 1.32,
  } as const),

  // Agile swimming ray-beast: weaves laterally before rapid hydro-slash swoop
  RAZORFIN_MANTA: Object.freeze({
    displayName: 'Razorfin Manta',
    maxHp: 62,
    moveSpeed: 6.6,
    turnSpeed: 9.2,
    damage: 13,
    attackCooldown: 1.65,
    attackTelegraph: 0.44,
    attackRecovery: 0.58,
    attackRange: 5.6,
    preferredRange: 4.5,
    aggroRadius: 30,
    hitRadius: 0.65,
    hitHeight: 1.15,
    spawnDuration: 0.85,
    scale: 1.04,
    lungeSpeed: 15.8,
    lungeDuration: 0.34,
    circleAngularSpeed: 1.55,
  } as const),

  // Heavy coral-plated colossus: triggers pressurized hydro-geyser slams
  CORAL_BASTION: Object.freeze({
    displayName: 'Coral Bastion',
    maxHp: 340,
    moveSpeed: 2.35,
    turnSpeed: 3.6,
    damage: 25,
    attackCooldown: 3.5,
    attackTelegraph: 1.15,
    attackRecovery: 0.92,
    attackRange: 4.4,
    preferredRange: 3.1,
    aggroRadius: 30,
    hitRadius: 1.08,
    hitHeight: 2.95,
    spawnDuration: 1.45,
    scale: 1.36,
    geyserRadius: 4.7,
    armorDamageMultiplier: 0.7,
    guardBreakDuration: 3.6,
    guardBrokenDamageMultiplier: 1.5,
    slamCameraShake: 0.24,
  } as const),
} as const);

export const SERENA_CONFIG = Object.freeze({
  id: 'serena',
  displayName: 'SERENA',
  title: 'Voice of the Deep',
  defeatedStorageKey: 'arcane_usurper_serena_defeated',
  coreChargeStorageKey: 'arcane_usurper_serena_core_charge',
  defaultCoreCharge: 1.0,

  // Pearl Amphitheater Circular Arena Dimensions (matching Summit arena scale)
  arenaRadius: 18.0,
  playerClampRadius: 15.5,
  aqueductRingRadius: 16.5,
  aqueductArchCount: 12,
  aqueductPillarRadius: 0.72,
  aqueductPillarCollisionRadius: 0.85,
  aqueductPillarHeight: 7.4,
  anemoneCount: 8,
  anemoneRingRadius: 14.8,
  brazierCount: 6,
  brazierRingRadius: 13.8,
  bubbleCurtainCount: 340,
  bubbleCurtainRadius: 24.0,
  bubbleCurtainMaxHeight: 20.0,
  mosaicTextureSize: 1024,

  // Serena Boss Core Stats & 3-Phase Thresholds
  maxHp: 1150,
  moveSpeed: 4.6,
  orbitRadius: 9.0,
  floatHeight: 0.42,
  combatBaseBodyY: 0.96,
  tailUndulateSpeed: 3.4,
  hitRadius: 1.12,
  phase2HpThreshold: 0.6,
  phase3HpThreshold: 0.25,
  staggerHpThreshold: 0.08,
  phaseTransitionCooldown: 0.8,
  attackCooldownMin: 1.15,
  attackCooldownMax: 1.75,
  defeatBubbleRadius: 1.08,

  // Phase 1: Tidal Sweep (sweeping hydro-crescent waves & bubble chorale clusters)
  tidalSweep: Object.freeze({
    subtitle: 'PHASE I • TIDAL SWEEP',
    waveCount: 5,
    waveArcSpread: 0.95,
    waveSpeed: 13.5,
    waveDamage: 16,
    waveRadius: 1.18,
    waveTelegraphSec: 0.42,
    waveRecoverySec: 0.55,
    waveSpawnHeight: 0.72,
    waveSpawnForwardOffset: 1.0,
    waveLife: 2.8,
    attackCooldown: 1.65,
    moveSpeedMultiplier: 1.0,
  } as const),

  // Phase 1 & 2: Bubble Chorale (expanding/orbiting bubble clusters clearable by Umbral Pulse)
  bubbleChorale: Object.freeze({
    orbCount: 9,
    orbHeight: 1.05,
    orbRadius: 0.44,
    orbLife: 4.0,
    orbSpeed: 8.6,
    orbDamage: 12,
    burstCount: 2,
    burstInterval: 0.62,
    patternDuration: 1.85,
  } as const),

  // Phase 2: Siren's Harmonic Spiral (fast lateral tail-glide + double wave arcs & harmonic spirals)
  sirensChorale: Object.freeze({
    subtitle: "PHASE II • SIREN'S HARMONIC SPIRAL",
    ringCount: 3,
    ringMaxRadius: 14.5,
    ringSpeed: 8.5,
    ringDamage: 18,
    orbVolleyCount: 7,
    orbSpeed: 11.4,
    orbDamage: 13,
    dashSpeed: 13.8,
    dashDuration: 0.48,
    waveCount: 4,
    waveArcSpread: 1.08,
    waveSpeed: 14.5,
    waveDamage: 17,
    waveRadius: 1.15,
    spiralArms: 6,
    spiralFireInterval: 0.28,
    spiralAngleStep: 0.34,
    patternDuration: 2.25,
    attackCooldown: 1.45,
    moveSpeedMultiplier: 1.24,
  } as const),

  // Phase 3: Abyssal Undertow (swirling whirlpool floor pull + delayed boiling geyser eruptions)
  abyssalUndertow: Object.freeze({
    subtitle: 'PHASE III • ABYSSAL UNDERTOW',
    undertowPullSpeed: 4.1,
    undertowDuration: 3.6,
    whirlpoolRadius: 14.8,
    whirlpoolSpinSpeed: 2.35,
    geyserCount: 5,
    geyserTelegraphSec: 0.92,
    geyserEruptDuration: 1.15,
    geyserCascadeStep: 0.24,
    geyserRadius: 2.35,
    geyserDamage: 21,
    geyserMinRadius: 2.8,
    geyserMaxRadius: 11.8,
    geyserCameraShake: 0.24,
    curtainArms: 6,
    curtainBulletSpeed: 8.6,
    ascendHeight: 0.85,
    patternDuration: 3.6,
    attackCooldown: 1.25,
    moveSpeedMultiplier: 1.46,
  } as const),

  // Pearl Amphitheater Underwater Lighting
  lighting: Object.freeze({
    hemiIntensity: 1.35,
    keyIntensity: 2.15,
    rimIntensity: 1.3,
    fogDensity: 0.0145,
    shadowExtent: 24,
    brazierLightIntensity: 5.5,
    brazierLightDistance: 12.5,
    brazierLightDecay: 1.7,
    anemoneLightIntensity: 2.8,
    anemoneLightDistance: 8.0,
  } as const),
} as const);

// ============================================================================
// REALM III — THE HARMONIC CITADEL (CYBER BACKSTAGE, SERVANTS & MIKU)
// ============================================================================

export interface HarmonicWaveEntry {
  readonly archetype: HarmonicServantArchetype;
  readonly count: number;
}

export interface HarmonicChamberWaveRecipe {
  readonly servants: readonly HarmonicWaveEntry[];
}

export const HARMONIC_CHAMBER_CONFIG = Object.freeze({
  // Rectangular Cyber-Arcane Backstage Hall Bounds (matching Chamber scale)
  width: 24,
  length: 52,
  wallHeight: 11.4,
  wallThickness: 1.2,
  movementWallPadding: 1.2,
  playerSpawnX: 0,
  playerSpawnZ: 22.0,
  playerSpawnYaw: Math.PI,

  // Towering Line-Array Subwoofer Speaker-Stack Pillars & Overhead Trusses
  pillarCountPerSide: 6,
  pillarRowX: 8.4,
  pillarStartZ: 18.5,
  pillarSpacing: 7.4,
  pillarRadius: 0.78,
  pillarCollisionRadius: 0.92,
  pillarHeight: 8.6,
  ceilingY: 13.8,
  trussY: 10.6,
  trussSpanX: 16.8,
  spotlightConeLength: 9.8,
  spotlightConeRadius: 2.35,

  // Central Dark-Velvet VIP Runner & Backstage Props
  carpetWidth: 4.2,
  carpetStartZ: 24.5,
  carpetEndZ: -15.8,
  carpetY: 0.014,
  flightCaseCountPerSide: 4,
  flightCaseRowX: 10.35,
  flightCaseZPositions: Object.freeze([15.2, 6.8, -1.6, -10.0] as const),
  mixingDeskRowX: 10.1,
  mixingDeskZPositions: Object.freeze([10.8, -5.8] as const),
  wardrobeRackRowX: 10.2,
  wardrobeRackZPositions: Object.freeze([2.4, -14.2] as const),
  floorTextureSize: 1024,
  eqTextureWidth: 256,
  eqTextureHeight: 128,
  eqBarCount: 16,

  // Rising Neon Synth-Note & Harmonic Dust Motes
  synthMoteCount: 220,
  synthMoteRiseSpeed: 0.54,
  synthMoteSwayAmp: 0.38,

  // 8 Destructible Acoustic Capacitor Canisters
  urnCount: 8,
  urnHealAmount: 8,
  urnHp: 1,
  urnRowX: 7.25,
  urnZPositions: Object.freeze([14.2, 4.6, -5.0, -13.4] as const),
  urnHitRadius: 0.58,

  // Hydraulic VIP Stage-Lift / Harmonic Astral Portal Dais
  daisZ: -20.6,
  daisRadius: 5.4,
  daisTierHeights: Object.freeze([0.1, 0.18] as const),
  daisTierRadiusStep: 1.05,
  portalZ: -22.3,
  portalCenterY: 3.35,
  portalRingRadius: 2.7,
  portalTubeRadius: 0.3,
  portalRuneSegmentCount: 12,
  portalPylonOffsetX: 3.45,
  portalPylonCollisionRadius: 0.75,
  portalInteractionRadius: 4.0,
  portalSealPulseSpeed: 2.2,
  portalVortexSwirlSpeed: 1.9,
  portalVortexArms: 6,
  portalIgniteLerp: 4.0,
  portalSpinSpeed: 0.45,

  // Wave Escalation & Portal Flow
  waveEscalationDelay: 1.5,
  portalWarpDuration: 1.1,
  portalIgniteDuration: 0.9,

  // Cyber-Arcane Backstage Lighting
  lighting: Object.freeze({
    hemiIntensity: 1.25,
    keyIntensity: 2.15,
    rimIntensity: 1.4,
    fogDensity: 0.0155,
    shadowExtent: 28,
    portalLightSealed: 1.8,
    portalLightIgnited: 9.4,
    portalLightDistance: 15.0,
    portalLightDecay: 1.6,
    spotlightIntensity: 5.4,
    spotlightDistance: 11.5,
    spotlightDecay: 1.7,
  } as const),

  WAVES: Object.freeze([
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: HARMONIC_SERVANT_ARCHETYPES.PULSE_STRIKER, count: 2 }),
        Object.freeze({ archetype: HARMONIC_SERVANT_ARCHETYPES.SYNTH_CANTOR, count: 2 }),
      ]),
    }),
    Object.freeze({
      servants: Object.freeze([
        Object.freeze({ archetype: HARMONIC_SERVANT_ARCHETYPES.AEGIS_MONOLITH, count: 1 }),
        Object.freeze({ archetype: HARMONIC_SERVANT_ARCHETYPES.FREQUENCY_DRONE, count: 2 }),
        Object.freeze({ archetype: HARMONIC_SERVANT_ARCHETYPES.SYNTH_CANTOR, count: 1 }),
      ]),
    }),
  ] as readonly HarmonicChamberWaveRecipe[]),
} as const);

export const HARMONIC_SERVANT_CONFIG = Object.freeze({
  // Shielded harmonic blade-guard: frontal acoustic barrier + laser-blade thrust
  PULSE_STRIKER: Object.freeze({
    displayName: 'Pulse Striker',
    maxHp: 155,
    moveSpeed: 3.45,
    turnSpeed: 5.6,
    damage: 17,
    attackCooldown: 2.1,
    attackTelegraph: 0.62,
    attackRecovery: 0.54,
    attackRange: 2.6,
    preferredRange: 1.9,
    aggroRadius: 30,
    hitRadius: 0.74,
    hitHeight: 2.25,
    spawnDuration: 1.1,
    scale: 1.0,
    shieldBlockArcRad: Math.PI * 0.58,
    shieldBlockDamageMultiplier: 0.15,
    guardBreakHits: 4,
    guardBreakDuration: 2.5,
    guardBrokenDamageMultiplier: 1.5,
  } as const),

  // Floating cyber-chorister: launches tri-chord synth note volleys
  SYNTH_CANTOR: Object.freeze({
    displayName: 'Synth Cantor',
    maxHp: 78,
    moveSpeed: 3.2,
    turnSpeed: 7.4,
    damage: 11,
    attackCooldown: 2.4,
    attackTelegraph: 0.65,
    attackRecovery: 0.48,
    attackRange: 15.5,
    preferredRange: 10.5,
    aggroRadius: 30,
    hitRadius: 0.56,
    hitHeight: 1.98,
    spawnDuration: 1.0,
    scale: 0.96,
    boltSpeed: 13.4,
    boltRadius: 0.44,
    boltLife: 2.8,
    boltSpread: 0.24,
    boltsPerVolley: 3,
    boltHeight: 1.32,
  } as const),

  // Agile hovering audio-construct: banks laterally before high-speed frequency slash
  FREQUENCY_DRONE: Object.freeze({
    displayName: 'Frequency Drone',
    maxHp: 64,
    moveSpeed: 6.8,
    turnSpeed: 9.4,
    damage: 13,
    attackCooldown: 1.6,
    attackTelegraph: 0.42,
    attackRecovery: 0.56,
    attackRange: 5.6,
    preferredRange: 4.5,
    aggroRadius: 30,
    hitRadius: 0.64,
    hitHeight: 1.2,
    spawnDuration: 0.85,
    scale: 1.02,
    lungeSpeed: 16.2,
    lungeDuration: 0.34,
    circleAngularSpeed: 1.6,
  } as const),

  // Heavy subwoofer colossus: unleashes ground-shaking sub-bass drop shockwaves
  AEGIS_MONOLITH: Object.freeze({
    displayName: 'Aegis Monolith',
    maxHp: 350,
    moveSpeed: 2.4,
    turnSpeed: 3.6,
    damage: 26,
    attackCooldown: 3.45,
    attackTelegraph: 1.15,
    attackRecovery: 0.9,
    attackRange: 4.4,
    preferredRange: 3.1,
    aggroRadius: 30,
    hitRadius: 1.08,
    hitHeight: 2.95,
    spawnDuration: 1.45,
    scale: 1.36,
    bassDropRadius: 4.75,
    bassDropWaveMaxRadius: 7.8,
    bassDropWaveDuration: 0.95,
    bassDropWaveHitThickness: 0.72,
    armorDamageMultiplier: 0.7,
    guardBreakDuration: 3.6,
    guardBrokenDamageMultiplier: 1.5,
    slamCameraShake: 0.25,
  } as const),

  // Cyber-Arcane Servant Rig & Combat Cadence Constants (zero magic numbers)
  strikerLungeSpeed: 16.4,
  strikerLungeDuration: 0.34,
  strikerCrouchDropY: 0.24,
  strikerSlashTorsoTwistY: 0.88,
  cantorVolleyCount: 5,
  cantorFanSpread: 0.86,
  cantorRhythmPhaseSpeed: 2.8,
  cantorSpeedHarmonicAmp: 0.22,
  cantorRingSpinSpeed: 2.4,
  cantorRingFlareScale: 1.42,
  cantorEqBarCount: 12,
  droneBaseHoverY: 1.12,
  droneBankAmp: 0.56,
  droneSwoopRoll: -0.62,
  droneRibbonSegments: 4,
  droneRibbonWaveSpeed: 8.5,
  monolithShieldOpacity: 0.62,
  monolithCorePulseSpeed: 5.2,
} as const);

export const MIKU_CONFIG = Object.freeze({
  id: 'miku',
  displayName: 'MIKU',
  title: 'THE HARMONIC SOVEREIGN',
  defeatedStorageKey: 'arcane_usurper_miku_defeated',
  coreChargeStorageKey: 'arcane_usurper_miku_core_charge',
  defaultCoreCharge: 1.0,

  // Astral Concert Stage Circular Arena Dimensions (matching Summit arena scale)
  arenaRadius: 18.0,
  playerClampRadius: 15.5,
  monolithRingRadius: 16.5,
  monolithCount: 12,
  monolithWidth: 1.35,
  monolithDepth: 0.95,
  monolithHeight: 8.2,
  monolithCollisionRadius: 0.9,
  tuningCrystalCount: 8,
  tuningCrystalRingRadius: 14.6,
  spotlightCount: 6,
  spotlightRingRadius: 13.8,
  synthMoteCount: 340,
  synthMoteRadius: 24.0,
  synthMoteMaxHeight: 20.0,
  stageTextureSize: 1024,
  eqTextureWidth: 128,
  eqTextureHeight: 512,
  eqBarCount: 20,

  // Miku Boss Core Stats & 3-Phase Thresholds
  maxHp: 1250,
  moveSpeed: 5.0,
  orbitRadius: 9.0,
  floatHeight: 0.36,
  combatBaseBodyY: 0.9,
  hitRadius: 1.05,
  phase2HpThreshold: 0.6,
  phase3HpThreshold: 0.25,
  staggerHpThreshold: 0.08,
  phaseTransitionCooldown: 0.78,
  attackCooldownMin: 1.05,
  attackCooldownMax: 1.55,

  // Distinct Cyber-Concert Mechanics Constants (Zero Magic Numbers)
  dashSpeed: 20.0,
  dashDuration: 0.42,
  laserWallDuration: 4.5,
  laserWallHalfWidth: 0.44,
  laserWallHeight: 2.15,
  laserWallDamage: 18,
  laserWallHitCooldown: 0.55,
  beatRingExpandSpeed: 9.8,
  beatRingMaxRadius: 15.2,
  beatRingDuration: 1.55,
  beatRingHitThickness: 0.76,
  beatRingDamage: 16,
  ampNodeCount: 4,
  ampNodeHp: 90,
  ampNodeRingRadius: 12.6,
  ampNodeHeight: 1.55,
  ampNodeHitRadius: 0.88,
  ampNodeFireInterval: 1.65,
  ampNodeBeamDamage: 14,
  ampNodeBeamSpeed: 17.5,
  ampNodeBeamLife: 2.4,
  ampNodeBeamRadius: 0.48,
  ampNodeDuration: 12.0,
  spotlightRotateSpeed: 0.88,
  spotlightLength: 17.8,
  spotlightDamage: 19,
  spotlightHitWidth: 0.82,
  spotlightTelegraphSec: 0.65,
  spotlightDurationSec: 3.4,
  defeatRingCount: 3,
  defeatRingBaseRadius: 0.86,

  // Phase 1: Laser-Trail Dash & Beat-Drop Rings
  reverberationArc: Object.freeze({
    subtitle: 'PHASE I • LASER-TRAIL DASH & BEAT-DROP RINGS',
    arcCount: 5,
    arcSpread: 0.98,
    arcSpeed: 14.2,
    arcDamage: 16,
    arcRadius: 1.15,
    telegraphSec: 0.38,
    recoverySec: 0.52,
    beatRingCount: 2,
    beatRingInterval: 0.55,
    attackCooldown: 1.55,
    moveSpeedMultiplier: 1.0,
  } as const),

  // Phase 1 & 2: Chord Barrage (staggered harmonic note-orb volleys)
  chordBarrage: Object.freeze({
    orbCount: 9,
    orbSpeed: 11.8,
    orbDamage: 13,
    orbRadius: 0.44,
    orbLife: 3.6,
    burstCount: 3,
    burstInterval: 0.48,
    patternDuration: 1.85,
  } as const),

  // Phase 2: Harmonic Amp Nodes & Multi-Dash Laser Lattice
  twinTailDash: Object.freeze({
    subtitle: 'PHASE II • HARMONIC AMP NODES & LASER LATTICE',
    dashSpeed: 21.0,
    dashDuration: 0.38,
    latticeDashCount: 2,
    latticeDashInterval: 0.72,
    trailBoltCount: 6,
    trailBoltDamage: 15,
    attackCooldown: 1.38,
    moveSpeedMultiplier: 1.28,
  } as const),

  // Phase 2 & 3: Frequency Walls (twin sweeping emerald-magenta laser barriers)
  frequencyWalls: Object.freeze({
    beamCount: 2,
    beamLength: 17.8,
    beamDamage: 19,
    beamTelegraphSec: 0.65,
    beamDurationSec: 3.4,
    sweepArcRad: 2.95,
    patternDuration: 4.15,
  } as const),

  // Phase 3: Crescendo Overdrive (twin rotating concert spotlight lasers + beat rings + dashes)
  crescendoOverdrive: Object.freeze({
    subtitle: 'PHASE III • CRESCENDO OVERDRIVE',
    bassDropCount: 3,
    bassDropInterval: 0.85,
    bassDropRadius: 2.4,
    bassDropTelegraphSec: 0.88,
    bassDropEruptDuration: 1.1,
    bassDropDamage: 22,
    curtainArms: 6,
    curtainOrbSpeed: 9.4,
    ascendHeight: 0.78,
    patternDuration: 4.2,
    attackCooldown: 1.15,
    moveSpeedMultiplier: 1.48,
  } as const),

  // Astral Concert Stage Lighting
  lighting: Object.freeze({
    hemiIntensity: 1.35,
    keyIntensity: 2.2,
    rimIntensity: 1.45,
    fogDensity: 0.0135,
    shadowExtent: 24,
    spotlightLightIntensity: 5.6,
    spotlightLightDistance: 13.0,
    spotlightLightDecay: 1.7,
    crystalLightIntensity: 2.8,
    crystalLightDistance: 8.5,
  } as const),
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
    LOBBY: 0.012,
    COMBAT_P1: 0.055,
    COMBAT_P2: 0.085,
    COMBAT_P3: 0.115,
    STAGGER: 0.05,
    SIPHON: 0.025,
    VICTORY: 0.0001,
    DEFEAT: 0.05,
    CHAMBER: 0.03,
    SUNKEN_CHAMBER: 0.026,
    SUNKEN_BOSS: 0.042,
    HARMONIC_CHAMBER: 0.018,
    HARMONIC_BOSS: 0.032,
  } as const),

  // Realm III — Harmonic Citadel Synth-Opera Music & Cyber SFX Tables
  harmonicChamberTempo: 116,
  harmonicSynthBass: Object.freeze([
    65.41, 65.41, 77.78, 77.78, 58.27, 58.27, 51.91, 58.27,
  ] as const),
  harmonicBellArp: Object.freeze([
    523.25, 622.25, 783.99, 932.33, 1046.5, 932.33, 783.99, 622.25,
    466.16, 587.33, 698.46, 932.33, 1046.5, 932.33, 698.46, 587.33,
  ] as const),
  harmonicBassGain: 0.14,
  harmonicBassDuration: 0.24,
  harmonicBellGain: 0.068,
  harmonicBellDuration: 0.36,

  harmonicBossTempo: 136,
  harmonicBossLead: Object.freeze([
    523.25, 622.25, 783.99, 1046.5, 932.33, 783.99, 698.46, 783.99,
    622.25, 783.99, 932.33, 1174.66, 1046.5, 932.33, 783.99, 622.25,
  ] as const),
  harmonicBossBass: Object.freeze([
    65.41, 65.41, 51.91, 51.91, 58.27, 58.27, 49.0, 58.27,
  ] as const),
  harmonicBossLeadGain: 0.095,
  harmonicBossLeadDuration: 0.32,
  harmonicBossBassGain: 0.17,
  harmonicBossKickGain: 0.26,
  harmonicBossSnareGain: 0.12,

  // Realm III Cyber-Opera SFX Tables
  chordBurstFreqs: Object.freeze([523.25, 659.25, 783.99, 1046.5] as const),
  capacitorShatterGrainCount: 7,
  capacitorShatterBaseFreq: 1950,
  capacitorShatterFreqSpread: 2400,

  // Realm II — Sunken Sanctuary Music & Oceanic SFX Tables
  sunkenChamberTempo: 96,
  sunkenHarpArp: Object.freeze([
    329.63, 392.0, 493.88, 587.33, 659.25, 587.33, 493.88, 392.0,
    293.66, 369.99, 440.0, 587.33, 659.25, 587.33, 440.0, 369.99,
  ] as const),
  sunkenGlassBellNotes: Object.freeze([
    987.77, 1174.66, 1318.51, 880.0,
  ] as const),
  sunkenHarpGain: 0.068,
  sunkenHarpDuration: 0.62,
  sunkenGlassBellGain: 0.045,
  sunkenGlassBellDuration: 1.35,

  sunkenBossTempo: 124,
  sunkenBossSwellChords: Object.freeze([
    164.81, 146.83, 130.81, 123.47,
  ] as const),
  sunkenBossMelody: Object.freeze([
    659.25, 783.99, 987.77, 880.0, 783.99, 659.25, 587.33, 739.99,
  ] as const),
  sunkenBossSwellGain: 0.13,
  sunkenBossSwellDuration: 1.15,
  sunkenBossPercGain: 0.24,
  sunkenBossMelodyGain: 0.082,

  // Realm II Oceanic SFX Tables
  bubblePopFreqs: Object.freeze([520, 880, 1320] as const),
  coralShatterGrainCount: 6,
  coralShatterBaseFreq: 1150,
  coralShatterFreqSpread: 1850,

  // Obsidian Spire Sanctum ('LOBBY') Music Box & Warm Cello Pad Sequencer
  lobbyTempo: 76,
  lobbyMusicBoxNotes: Object.freeze([
    587.33, 659.25, 698.46, 880.0, 698.46, 659.25, 587.33, 440.0,
    523.25, 587.33, 659.25, 783.99, 659.25, 587.33, 523.25, 440.0,
  ] as const),
  lobbyCelloNotes: Object.freeze([
    146.83, 130.81, 116.54, 110.0,
  ] as const),
  lobbyMusicBoxGain: 0.052,
  lobbyMusicBoxDuration: 0.95,
  lobbyCelloGain: 0.11,
  lobbyCelloDuration: 1.55,
  lobbyCelloCutoff: 290,

  // Obsidian Spire Sanctum SFX Tables
  sunkenWardFreqs: Object.freeze([392.0, 587.33, 783.99] as const),
  harmonicWardFreqs: Object.freeze([523.25, 659.25, 987.77, 1318.51] as const),
  dummyHitFreqs: Object.freeze([880.0, 1318.51, 1760.0] as const),
  trophyToggleFreqs: Object.freeze([659.25, 880.0, 1174.66, 1760.0] as const),

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

// ============================================================================
// DYNAMIC PROCEDURAL SIPHON & KISS-CADENCE AUDIO CONFIGURATION
// ============================================================================

export const SIPHON_AUDIO_CONFIG = Object.freeze({
  // Continuous Ether-Siphon Stream
  baseDroneHz: 110,
  harmonicOvertoneRatio: 2.0,
  maxDrainPitchShiftSemitones: 5,
  savorFilterHz: 420,
  flowFilterHz: 820,
  surgeFilterHz: 1480,
  endlessSavorFilterHz: 520,
  savorGain: 0.08,
  flowGain: 0.12,
  surgeGain: 0.17,
  endlessSavorGain: 0.055,
  rampTimeConstantSec: 0.06,
  droneOvertoneGainScale: 0.42,
  etherFilterQ: 1.6,
  etherShimmerGainScale: 0.24,
  etherShimmerFreqRatio: 1.45,
  etherShimmerQ: 1.8,
  tauntStunGainScale: 0.65,
  endlessSavorPitchShiftSemitones: 2.5,
  pinkNoiseDurationSec: 3,
  stopFadeOutSec: 0.12,
  stopCleanupDelaySec: 0.16,

  // Soft Breath, Contact Sub-Pulse & Parting Transient (Synced to -> <- Kiss Motion)
  breathCenterHz: 1050,
  breathQ: 2.2,
  breathMaxGain: 0.032,
  breathEndlessSavorScale: 0.65,
  breathSurgeScale: 1.2,
  breathSavorScale: 0.85,
  contactPulseStartHz: 65,
  contactPulseEndHz: 42,
  contactPulseDurationSec: 0.12,
  contactPulseGain: 0.085,
  contactPulseEndlessScale: 0.65,
  contactPeakTriggerThreshold: 0.92,
  contactRearmThreshold: 0.45,
  partingTickHz: 2050,
  partingTickQ: 1.4,
  partingTickDurationSec: 0.015,
  partingTickGain: 0.016,
  partingTriggerThreshold: 0.72,

  // Fading Resistance Heartbeat (Stages 1 & 2 Only; silent >= 75% or taunt-stunned)
  heartbeatStage1IntervalSec: 0.68,
  heartbeatStage2IntervalSec: 1.05,
  heartbeatCutoffDrain: 0.75,
  heartbeatGain: 0.055,
  heartbeatSecondBeatDelaySec: 0.16,
  heartbeatFirstFreqStartHz: 58,
  heartbeatFirstFreqEndHz: 32,
  heartbeatSecondFreqStartHz: 50,
  heartbeatSecondFreqEndHz: 28,
  heartbeatPulseDurationSec: 0.14,
  heartbeatSecondBeatGainScale: 0.68,

  // Boss-Specific Elemental Micro-Chimes
  chimeStepPercent: 0.045,
  marinaChimeFreqsHz: Object.freeze([2349, 2793, 3136, 3520] as const),
  marinaChimeGain: 0.052,
  marinaChimeDurationSec: 0.36,
  serenaDropletStartHz: 360,
  serenaDropletEndHz: 940,
  serenaDropletQ: 6.0,
  serenaDropletGain: 0.072,
  serenaDropletDurationSec: 0.14,
  mikuChordFreqsHz: Object.freeze([587.33, 880, 1318.5] as const),
  mikuMaxDepletionDroopCents: -35,
  mikuChimeGain: 0.042,
  mikuChimeDurationSec: 0.28,

  // Entry Seal & 100% Depletion Climax
  sealWhooshDurationSec: 0.28,
  sealWhooshStartHz: 480,
  sealWhooshEndHz: 1450,
  sealWhooshQ: 2.0,
  sealWhooshGain: 0.042,
  sealChimeFreqsHz: Object.freeze([587.33, 880, 1174.66] as const),
  sealChimeStepSec: 0.028,
  sealChimeGain: 0.048,
  sealChimeDurationSec: 0.42,
  climaxSubDropStartHz: 95,
  climaxSubDropEndHz: 36,
  climaxSubDropGain: 0.28,
  climaxChordDurationSec: 0.65,
  climaxChordGain: 0.088,
  climaxChordStepSec: 0.055,
  climaxChordMarinaHz: Object.freeze([1174.66, 880.0, 698.46, 587.33] as const),
  climaxChordSerenaHz: Object.freeze([987.77, 783.99, 659.25, 493.88] as const),
  climaxChordMikuHz: Object.freeze([1318.51, 987.77, 783.99, 587.33] as const),
} as const);

// ============================================================================
// HOLD-[V] FIRST-PERSON GAZE CONFIGURATION
// ============================================================================

export const FIRST_PERSON_GAZE_CONFIG = Object.freeze({
  triggerKey: 'KeyV',
  eyeHeightOffset: 1.55,
  forwardEyeOffset: 0.12,
  minPitchRad: -1.25,
  maxPitchRad: 1.25,
  transitionLerpSpeed: 14.0,
  hideRigDistanceThreshold: 0.45,
  initialPitchRad: 0,
  /** Any of these inputs instantly breaks out of first-person gaze and executes normally. */
  breakoutKeys: Object.freeze([
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Space',
    'KeyE',
  ] as const),
  breakoutMouseButtons: Object.freeze([0, 2] as const),
} as const);

// ============================================================================
// UMBRAL SIPHON BEAM ([R]) ALTERNATIVE BOSS FINISHER CONFIGURATION
// ============================================================================

export const SIPHON_BEAM_CONFIG = Object.freeze({
  // Input & Timing
  triggerKey: 'KeyR',
  drainDurationSec: 3.5,

  // Standoff & Dramatic 3/4 Side Framing
  standoffDistance: 4.2,
  lobbyStandoffDistance: 2.85,
  cameraSideOffset: 3.6,
  cameraHeightOffset: 2.1,
  lobbyCameraSideOffset: 2.65,
  lobbyCameraHeightOffset: 1.95,
  lobbyCameraBackOffset: 0.65,
  lobbyCameraMidpointFocusY: 1.12,
  cameraLerpSpeed: 8.0,
  cameraMidpointFocusY: 1.02,
  cameraBossBias: 0.45,
  bossChestTargetOffsetY: 0.88,

  // Procedural Dual-Layer Beam & Pooled Elemental Essence Orbs
  beamCoreRadius: 0.055,
  beamOuterRadius: 0.14,
  beamPulseFreqHz: 18.0,
  beamPulseAmp: 0.04,
  essenceOrbCount: 10,
  essenceOrbRadius: 0.07,
  essenceOrbSpeed: 7.5,
  essenceOrbSpiralRadius: 0.24,
  beamImpactFlareRadius: 0.26,
  beamParticleIntervalSec: 0.06,

  // High-Voltage Arcane Beam Audio
  audioBaseHz: 145,
  audioPeakHz: 420,
  audioGain: 0.14,
  crackleRateHz: 24,
  audioOvertoneRatio: 1.5,
  audioSubRatio: 0.5,
  audioOvertoneGainScale: 0.45,
  audioSubGainScale: 0.6,
  audioNoiseRoarGainScale: 0.22,
  audioFilterStartHz: 680,
  audioFilterPeakHz: 2600,
  audioFilterQ: 3.2,
  audioCrackleGain: 0.075,
  audioCrackleDurationSec: 0.028,
  audioCrackleCenterHz: 3400,
  audioCrackleQ: 2.4,
  audioRampTimeConstantSec: 0.05,
  audioStopFadeOutSec: 0.1,
  audioStopCleanupDelaySec: 0.14,

  // Dark Mage Standoff Channeling Pose & Boss Shielding-to-Slump Pose
  mageBodyY: 0.92,
  mageTorsoPitch: 0.14,
  mageStanceHipSpread: 0.16,
  mageRecoilFreqHz: 16.0,
  mageRecoilAmpRad: 0.032,
  bossKneelBodyY: 0.47,
  bossShieldTorsoStartX: 0.12,
  bossShieldTorsoSlumpX: 0.42,
  bossShieldHeadStartX: -0.14,
  bossShieldHeadSlumpX: 0.34,
  bossShieldHeadTurnY: 0.36,
  bossTremorFreqHz: 22.0,
  bossTremorAmpRad: 0.042,
  bossShieldArmStartX: -1.68,
  bossShieldArmStartZ: -0.58,
  bossShieldElbowStartX: -1.42,
  bossShieldElbowStartZ: 0.72,
  bossBraceArmStartX: -0.45,
  bossBraceArmStartZ: 0.28,
  bossBraceElbowStartX: -0.62,
  bossSlumpArmX: 0.14,
  bossSlumpArmZ: 0.12,
  bossSlumpElbowX: -0.16,
} as const);

// ============================================================================
// MID-FIGHT 360° FRONTAL GUARD-BREAK STOLEN KISS ([E]) CONFIGURATION
// ============================================================================

export const STOLEN_KISS_CONFIG = Object.freeze({
  // 360° Proximity Exposure Window & Cooldown
  triggerKey: 'KeyE',
  exposureDurationSec: 1.8,
  cooldownSec: 10.0,
  maxTriggerDistance: 2.8,
  exposedBossTurnScale: 0.28,

  // Three-Beat Timing (1.80s total: Step-In & Chin Catch -> Angled Siphon Kiss -> Breakaway Blast)
  totalDurationSec: 1.8,
  wrapEndSec: 0.3,
  siphonEndSec: 1.45,

  // Frontal Guard-Break Kinematics
  frontOffsetDistance: 0.48,
  mageHeadTiltRollRad: 0.21,
  targetSpinePullRad: 0.12,
  kissPulseAmp: 0.013,
  kissPulseFreqHz: 3.4,
  bossStandingBodyY: 0.9,
  mageStandingBodyY: 0.92,
  lipLockMaxCorrection: 0.28,

  // Combat Rewards & Breakaway
  bossDamage: 45,
  minRemainingBossHp: 1,
  playerHpRestore: 28,
  playerManaRestore: 45,
  breakawayPushDistance: 4.2,
  postBreakawayIFramesSec: 0.85,
  breakawayShockwaveRadius: 7.4,
  breakawayShockwaveDuration: 0.55,
  breakawayCameraShake: 0.24,

  // Pooled Front-Facing Chest Telegraph Glint & Exhausted Shoulder Heave
  telegraphDiamondRadius: 0.14,
  telegraphLocalY: 0.36,
  telegraphLocalZ: 0.24,
  telegraphParticleCount: 6,
  telegraphPulseFreqHz: 5.2,
  exhaustedHeaveFreqHz: 3.8,
  exhaustedTorsoPitchRad: 0.14,
  exhaustedShoulderDropRad: 0.26,
  exhaustedShoulderHeaveAmpRad: 0.11,

  // Pooled Lip-to-Cloak Essence Particles
  essenceParticlePoolSize: 20,
  essenceEmitIntervalSec: 0.055,
  essenceParticleLifetimeSec: 0.46,
  essenceParticleRadius: 0.036,

  // Tight 3/4 Side-Profile Close-Up Camera Framing
  cameraFrontOffset: 0.62,
  cameraSideOffset: 1.85,
  cameraHeightOffset: 1.54,
  cameraFocusY: 1.38,
  cameraLerpSpeed: 10.5,

  // Heavy Channeled / Signature Patterns Triggering Frontal Guard-Break Exposure
  heavyExposurePatterns: Object.freeze([
    'TWIN_GLACIAL_LASER',
    'SNOWFLAKE_CURTAIN',
    'FALLING_ICE_PILLARS',
    'FROST_RING_NOVA',
    'TIDAL_SWEEP',
    'HARMONIC_SPIRAL',
    'ABYSSAL_UNDERTOW',
    'MIKU_BEAT_DROP_RINGS',
    'MIKU_LASER_LATTICE',
    'MIKU_CRESCENDO_OVERDRIVE',
    'YENNEFER_CHAOS_NOVA',
    'YENNEFER_OBSIDIAN_LASERS',
    'YENNEFER_CHAOS_MAELSTROM',
    'SHADOWHEART_SHARRAN_ECLIPSE',
  ] as const),

  // Procedural Web Audio Cues
  windowChimeBaseHz: 587.33,
  windowChimeGain: 0.17,
  windowChimeDurationSec: 0.68,
  wrapWhooshDurationSec: 0.34,
  wrapWhooshStartHz: 260,
  wrapWhooshEndHz: 780,
  wrapWhooshGain: 0.18,
  siphonChordDurationSec: 1.15,
  siphonChordBaseHz: 110,
  siphonChordGain: 0.14,
  breakawayBurstDurationSec: 0.48,
  breakawayBurstGain: 0.24,
} as const);

// ============================================================================
// SPECIAL SCENARIOS & DYNAMIC N-BOSS ARCHITECTURE REGISTRY
// ============================================================================

export type SpecialScenarioRigKey =
  | 'marina'
  | 'serena'
  | 'miku'
  | 'geralt'
  | 'yennefer'
  | 'laezel'
  | 'astarion'
  | 'gale'
  | 'shadowheart';

export type GuestPedestalTargetId = 'yennefer' | 'shadowheart';

export interface GuestPedestalConfig {
  readonly index: number;
  readonly targetId: GuestPedestalTargetId;
  readonly scenarioId: string;
  readonly displayName: string;
  readonly shortName: string;
  readonly coreLabel: string;
  readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  readonly facingYaw: number;
  readonly siphonInitialAzimuth: number;
  readonly accentHex: number;
  readonly accentCssHex: string;
  readonly dormantTitle: string;
  readonly dormantSubtitle: string;
}

export const GUEST_PEDESTALS: readonly GuestPedestalConfig[] = Object.freeze([
  Object.freeze({
    index: 0,
    targetId: 'yennefer' as const,
    scenarioId: 'wolf_and_raven',
    displayName: 'YENNEFER OF VENGERBERG',
    shortName: 'YENNEFER',
    coreLabel: 'CHAOS CORE CHARGE',
    pos: SIPHON_GALLERY_CONFIG.guestPedestal1Pos,
    facingYaw: SIPHON_GALLERY_CONFIG.guestPedestal1FacingYaw,
    siphonInitialAzimuth: SIPHON_GALLERY_CONFIG.guestSiphonInitialAzimuth,
    accentHex: PALETTE.yenneferLilac,
    accentCssHex: PALETTE.hex.yenneferLilac,
    dormantTitle: 'GUEST PEDESTAL I — DORMANT',
    dormantSubtitle: 'Complete "The Wolf & The Raven" at the West Astral Rift',
  }),
  Object.freeze({
    index: 1,
    targetId: 'shadowheart' as const,
    scenarioId: 'baldurs_gate_party',
    displayName: 'SHADOWHEART',
    shortName: 'SHADOWHEART',
    coreLabel: 'SHARRAN CORE CHARGE',
    pos: SIPHON_GALLERY_CONFIG.guestPedestal2Pos,
    facingYaw: SIPHON_GALLERY_CONFIG.guestPedestal2FacingYaw,
    siphonInitialAzimuth:
      SIPHON_GALLERY_CONFIG.guestPedestal2SiphonInitialAzimuth,
    accentHex: PALETTE.bg3ShadowheartViolet,
    accentCssHex: PALETTE.hex.bg3ShadowheartViolet,
    dormantTitle: 'GUEST PEDESTAL II — DORMANT',
    dormantSubtitle:
      'Complete "Shadows of the Sharran Crypt" at the West Astral Rift',
  }),
]);

export interface SpecialScenarioBossEntry {
  readonly bossId: string;
  readonly displayName: string;
  readonly title: string;
  readonly rigKey: SpecialScenarioRigKey;
  readonly maxHp: number;
  readonly hitRadius: number;
  readonly canBeSiphoned: boolean;
  readonly guestPedestalIndex: number | null;
  readonly spawnOffsetX: number;
  readonly spawnOffsetZ: number;
  readonly barAccentHex: string;
}

export interface SpecialScenarioDefinition {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly arenaId: string;
  readonly unlocked: boolean;
  readonly guestPedestalIndex: number | null;
  readonly bosses: readonly SpecialScenarioBossEntry[];
}

export const SPECIAL_SCENARIO_CONFIG = Object.freeze({
  ashDissolveDurationSec: 1.6,
  ashEmberBurstIntervalSec: 0.18,
  geraltAshParticleCount: 36,
  duoSpacingOffsetX: 2.35,
  duoSpacingOffsetZ: 0.0,
  duoIntroDurationSec: 1.35,
  bossToBossMinSeparation: 2.35,
  maxSimultaneousBosses: 4,
  guestPedestalPassiveRechargePerSec: 0.025,
  guestPedestalDefaultCoreCharge: 1.0,
  guestPedestalDefeatRechargeBonus: 1.0,
  disperseShockwaveRadius: 11.5,
  disperseShockwaveDuration: 0.65,
  disperseCameraShake: 0.28,
  yenneferDefeatedStorageKey: 'arcane_usurper_yennefer_defeated',
  wolfAndRavenDefeatedStorageKey: 'arcane_usurper_wolf_and_raven_defeated',
  yenneferCoreChargeStorageKey: 'arcane_usurper_yennefer_core_charge',
  shadowheartDefeatedStorageKey: 'arcane_usurper_shadowheart_defeated',
  baldursGatePartyDefeatedStorageKey:
    'arcane_usurper_baldurs_gate_party_defeated',
  shadowheartCoreChargeStorageKey: 'arcane_usurper_shadowheart_core_charge',

  // Geralt & Yennefer baseline combat tuning (zero magic numbers)
  geraltId: 'geralt',
  geraltDisplayName: 'GERALT OF RIVIA',
  geraltTitle: 'The White Wolf',
  geraltMaxHp: 560,
  geraltHitRadius: 1.05,
  geraltAttackCooldownP1: 2.4,
  geraltAttackCooldownP2: 1.85,
  geraltLungeSpeed: 13.5,
  geraltIgniCount: 5,
  geraltIgniSpeed: 16.5,
  geraltIgniDamage: 14,
  geraltAardRadius: 13.5,
  geraltAardDamage: 16,

  yenneferId: 'yennefer',
  yenneferDisplayName: 'YENNEFER OF VENGERBERG',
  yenneferTitle: 'Sorceress of Obsidian & Lilac',
  yenneferMaxHp: 780,
  yenneferHitRadius: 1.05,
  yenneferPhase1Subtitle: 'PHASE I • OBSIDIAN & LILAC',
  yenneferPhase2Subtitle: 'PHASE II • CHAOS CONVERGENCE',
  yenneferPhase3Subtitle: 'PHASE III • MAELSTROM OF VENGERBERG',
  yenneferAttackCooldownP1: 2.6,
  yenneferAttackCooldownP2: 2.0,
  yenneferAttackCooldownP3: 1.55,
  yenneferBoltDamage: 14,
  yenneferNovaDamage: 18,
  yenneferLaserDamage: 16,
  finisherLockedCueText: 'DEFEAT ALL REMAINING FOES TO SIPHON',
  finisherLockedBossBarTag: 'STAGGERED • LOCKED',
  sovereignIncappedBannerText: 'SOVEREIGN INCAPACITATED',
  sovereignIncappedBannerSubtext: 'DEFEAT ALL REMAINING FOES TO SIPHON',
} as const);

// ============================================================================
// THE WOLF & THE RAVEN — ASYMMETRIC DUO COMBAT AI & ABILITIES CONFIGURATION
// ============================================================================

export const WOLF_AND_RAVEN_CONFIG = Object.freeze({
  // Duo HP Pools
  geraltMaxHp: 420,
  yenneferMaxHp: 520,

  // Geralt Vanguard Pressure & 2-Hit Silver Sword Dash-Slash Combo
  geraltVanguardOrbitRadius: 4.9,
  geraltVanguardPersonalSpace: 2.0,
  geraltMoveSpeedMult: 1.16,
  geraltAttackCooldownP1: 1.85,
  geraltAttackCooldownP2: 1.4,
  swordTelegraph1Sec: 0.36,
  swordDash1DurationSec: 0.24,
  swordChainWindupSec: 0.32,
  swordDash2DurationSec: 0.26,
  swordRecoverySec: 0.28,
  swordDashSpeed: 18.5,
  swordSlashHitRadius: 2.35,
  swordSlashDamage: 14,
  swordWaveSpeed: 17.5,
  swordWaveDamage: 12,
  swordWaveRadius: 1.25,
  swordWaveLife: 1.15,

  // Geralt Quen Active Shield (3 frontal hits OR shattered by Right-Click Umbral Pulse / bypassed from rear)
  quenMaxHits: 3,
  quenDurationSec: 9.0,
  quenCooldownSec: 10.5,
  quenInitialCooldownSec: 3.5,
  quenCastDurationSec: 0.65,
  quenFrontalMinDot: -0.15,
  quenDeflectSparkCount: 10,
  quenShatterSparkCount: 22,
  quenShatterCameraShake: 0.18,

  // Geralt Igni Fire Arc (0.65s orange left-hand Sign telegraph -> close-range fire spark cone)
  igniTelegraphSec: 0.65,
  igniRecoverySec: 0.35,
  igniSparkCount: 7,
  igniConeRad: 1.15,
  igniSparkSpeed: 16.5,
  igniSparkRadius: 0.68,
  igniSparkLife: 1.1,
  igniDamage: 14,

  // Geralt Yrden Violet Floor Trap (3.2m radius, 6.0s duration, 0.55x movement slow + visible violet tether)
  yrdenCastDurationSec: 0.65,
  yrdenRadius: 3.2,
  yrdenDurationSec: 6.0,
  yrdenSlowFactor: 0.55,
  yrdenSlowRefreshSec: 0.16,

  // Yennefer Zoning & Spatial Rift Repositioning
  yenneferZoneOrbitRadius: 10.8,
  yenneferZonePersonalSpace: 6.2,
  yenneferAttackCooldownP1: 2.15,
  yenneferAttackCooldownP2: 1.7,
  yenneferAttackCooldownP3: 1.35,
  riftTriggerDist: 4.8,
  riftCooldownSec: 5.5,
  riftSoloCooldownSec: 3.2,
  riftInitialCooldownSec: 2.4,
  riftTeleportRadius: 11.2,
  riftVisualDurationSec: 0.78,

  // Yennefer Chaos Lightning (brief ground/line telegraphs -> forked royal-violet strikes)
  lightningCountDuo: 3,
  lightningCountSolo: 5,
  lightningTelegraphSec: 0.65,
  lightningActiveSec: 0.42,
  lightningCascadeStepSec: 0.14,
  lightningRadius: 1.85,
  lightningDamage: 16,
  lightningSpreadRadius: 3.4,
  lightningAttackDurationSec: 1.45,
  lightningCameraShake: 0.14,

  // Yennefer Obsidian Feather Volley (sweeping arc of dark obsidian-violet shards)
  featherCountDuo: 7,
  featherCountSolo: 11,
  featherArcRad: 1.25,
  featherSpeed: 19.5,
  featherDamage: 13,
  featherRadius: 0.64,
  featherLife: 2.6,
  featherTelegraphSec: 0.35,
  featherAttackDurationSec: 0.95,

  // Yennefer Chaos Maelstrom -> Triggers 1.8s 360° Frontal Stolen Kiss Window on Completion
  maelstromChannelSec: 1.35,
  maelstromRecoverySec: 0.25,
  maelstromRadius: 16.5,
  maelstromRingDurationSec: 1.25,
  maelstromRingHitThickness: 1.4,
  maelstromDamage: 18,
  maelstromOrbCountDuo: 8,
  maelstromOrbCountSolo: 12,
  maelstromOrbSpeed: 13.5,
  maelstromOrbDamage: 14,
  maelstromCameraShake: 0.22,

  // Asymmetric Duo Synergy: Geralt Slain First -> Yennefer Solo Enrage (1.3x cadence)
  soloEnrageSpeedMult: 1.3,
  geraltVanquishedBannerText: 'GERALT VANQUISHED',
  geraltVanquishedSubtext: 'YENNEFER ENTERS SOLO CHAOS ENRAGE',
  geraltVanquishedFinisherReadySubtext: 'SOVEREIGN EXPOSED — SIPHON FINISHER UNLOCKED',
  vanquishedBannerMs: 3200,

  // Grounded Two-Stage Fallen-Body Collapse (non-siphonable bosses at 0 HP — remains visible in arena)
  collapseDurationSec: 1.1,
  collapseStage1EndSec: 0.45,
  collapseKneelBodyY: 0.46,
  collapseFloorBodyY: 0.14,
  collapseFallPitchRad: -1.46,
  collapseFallRollRad: 0.34,
  collapseFaceEmissiveDim: 0.04,
  collapseFloorImpactDustCount: 14,

  // Yennefer Finisher Mantle Clearance, Dip Hair Gravity & [F] Taunt Threshold
  yenneferMantleRestPitchRad: -0.82,
  yenneferMantleEmbraceClearanceRad: -1.04,
  yenneferMantleDipClearanceRad: -1.24,
  yenneferMantleUpperRestPitchRad: -0.34,
  yenneferMantleUpperDipPitchRad: -0.52,
  yenneferDipCurlGravityRatio: 0.92,
  yenneferDipCurlMidDroopRad: 0.28,
  yenneferTauntGlareThreshold: 0.55,
} as const);

export const WOLF_AND_RAVEN_AUDIO_CONFIG = Object.freeze({
  // Igni Fire Burst: filtered noise whoosh + warm low-mid crackles
  igniWhooshStartHz: 980,
  igniWhooshEndHz: 230,
  igniWhooshQ: 1.4,
  igniWhooshGain: 0.22,
  igniWhooshDurationSec: 0.52,
  igniCrackleCount: 5,
  igniCrackleBaseHz: 780,
  igniCrackleSpanHz: 920,
  igniCrackleGain: 0.085,
  igniCrackleDurationSec: 0.055,
  igniThumpStartHz: 150,
  igniThumpEndHz: 48,
  igniThumpGain: 0.2,
  igniThumpDurationSec: 0.28,

  // Quen Barrier Hit (metallic-crystalline ping) & Shatter (harmonic glass-chime burst)
  quenHitBaseHz: 880,
  quenHitRatios: Object.freeze([1.0, 2.76, 4.07] as const),
  quenHitGain: 0.14,
  quenHitDurationSec: 0.28,
  quenShatterFreqsHz: Object.freeze([1760, 2349.3, 3136, 3951, 4698.6] as const),
  quenShatterGain: 0.13,
  quenShatterDurationSec: 0.46,
  quenShatterNoiseStartHz: 4600,
  quenShatterNoiseEndHz: 1800,
  quenShatterNoiseGain: 0.16,

  // Yrden Trap Pulse: low eerie violet sub-hum
  yrdenBaseHz: 68,
  yrdenDetuneHz: 71.5,
  yrdenOvertoneHz: 204,
  yrdenGain: 0.17,
  yrdenDurationSec: 0.95,
  yrdenFilterStartHz: 220,
  yrdenFilterPeakHz: 540,

  // Yennefer Chaos Lightning: sharp electric crackle-snap + sub thunder crack
  lightningSnapCount: 4,
  lightningSnapStartHz: 4800,
  lightningSnapEndHz: 1900,
  lightningSnapGain: 0.16,
  lightningSnapDurationSec: 0.055,
  lightningZapStartHz: 1480,
  lightningZapEndHz: 165,
  lightningZapGain: 0.15,
  lightningZapDurationSec: 0.18,
  lightningSubStartHz: 135,
  lightningSubEndHz: 36,
  lightningSubGain: 0.24,
  lightningSubDurationSec: 0.34,

  // Yennefer Spatial Rift Warp: phase-swept sub-drop
  riftSubStartHz: 245,
  riftSubEndHz: 42,
  riftSubGain: 0.23,
  riftSubDurationSec: 0.42,
  riftPhaseSweepStartHz: 1650,
  riftPhaseSweepEndHz: 260,
  riftPhaseSweepQ: 3.4,
  riftPhaseSweepGain: 0.15,
  riftPhaseSweepDurationSec: 0.46,

  // Geralt Ash Dissolution: soft wind-swept noise fade at 0 HP
  ashFadeDurationSec: 1.55,
  ashWindStartHz: 1200,
  ashWindPeakHz: 2400,
  ashWindEndHz: 520,
  ashWindQ: 1.25,
  ashWindGain: 0.13,
  ashEmberCount: 4,
  ashEmberGain: 0.045,
} as const);

export const BALDURS_GATE_PARTY_CONFIG = Object.freeze({
  scenarioId: 'baldurs_gate_party',
  laezelId: 'laezel',
  laezelDisplayName: "LAE'ZEL",
  laezelTitle: 'Githyanki Vanguard',
  laezelMaxHp: 380,
  laezelHitRadius: 1.0,
  laezelSpawnOffsetX: 0,
  laezelSpawnOffsetZ: 11.5, // World (0, 0, +2.5) — front vanguard
  laezelOrbitRadius: 5.4,
  laezelPersonalSpace: 2.2,
  laezelMoveSpeedMult: 1.12,
  laezelAttackCooldownP1: 2.25,
  laezelAttackCooldownP2: 1.75,

  astarionId: 'astarion',
  astarionDisplayName: 'ASTARION',
  astarionTitle: 'Vampire Spawn',
  astarionMaxHp: 310,
  astarionHitRadius: 0.92,
  astarionSpawnOffsetX: -7.5,
  astarionSpawnOffsetZ: 3.5, // World (-7.5, 0, -5.5) — left mid-court flank
  astarionOrbitRadius: 7.4,
  astarionPersonalSpace: 3.2,
  astarionMoveSpeedMult: 1.24,
  astarionAttackCooldownP1: 2.1,
  astarionAttackCooldownP2: 1.65,

  galeId: 'gale',
  galeDisplayName: 'GALE OF WATERDEEP',
  galeTitle: 'Archmage Prodigy',
  galeMaxHp: 300,
  galeHitRadius: 0.94,
  galeSpawnOffsetX: 7.5,
  galeSpawnOffsetZ: 3.5, // World (+7.5, 0, -5.5) — right mid-court flank
  galeOrbitRadius: 13.5,
  galePersonalSpace: 6.4,
  galeMoveSpeedMult: 0.96,
  galeAttackCooldownP1: 2.55,
  galeAttackCooldownP2: 2.0,

  shadowheartId: 'shadowheart',
  shadowheartDisplayName: 'SHADOWHEART',
  shadowheartTitle: 'Dark Justiciar Sovereign',
  shadowheartMaxHp: 560,
  shadowheartHitRadius: 1.02,
  shadowheartSpawnOffsetX: 0,
  shadowheartSpawnOffsetZ: -8.5, // World (0, 0, -17.5) — rear Sharran altar dais
  shadowheartOrbitRadius: 15.0,
  shadowheartPersonalSpace: 7.2,
  shadowheartMoveSpeedMult: 0.92,
  shadowheartAttackCooldownP1: 2.4,
  shadowheartAttackCooldownP2: 1.9,
  shadowheartAttackCooldownP3: 1.5,
  shadowheartPhase1Subtitle: 'PHASE I • VEIL OF LOSS',
  shadowheartPhase2Subtitle: 'PHASE II • SHARRAN ECLIPSE',
  shadowheartPhase3Subtitle: 'PHASE III • DARK JUSTICIAR ASCENSION',
} as const);

export const BG3_PARTY_CONFIG = Object.freeze({
  // Balanced 1v4 Tactical Party HP Pools
  laezelMaxHp: 320,
  astarionMaxHp: 260,
  galeMaxHp: 280,
  shadowheartMaxHp: 460,

  // Shadowheart Casting Speed Boost (+12% per fallen party member -> up to +36% when solo)
  shadowheartFallenCastBoostPerAlly: 0.12,
  allyFallenBannerSubtext: 'SHADOWHEART CHANNELS DARKER SHARRAN HASTE (+12% CAST SPEED)',
  allAlliesFallenBannerSubtext: 'ALL COMPANIONS FALLEN — SHADOWHEART EXPOSED TO SIPHON',

  // Lae'zel — Frontline Vanguard (Psionic Jump Leap Slam + 2-Hit Greatsword Cleave)
  laezelAttackCooldownP1: 2.05,
  laezelAttackCooldownP2: 1.58,
  psionicJumpTelegraphSec: 0.45,
  psionicJumpAirSec: 0.52,
  psionicJumpArcHeight: 4.4,
  psionicJumpSlamRadius: 4.4,
  psionicJumpSlamDurationSec: 0.68,
  psionicJumpSlamHitThickness: 1.45,
  psionicJumpSlamDamage: 16,
  psionicJumpCameraShake: 0.2,
  psionicJumpRecoverySec: 0.32,
  cleaveWindup1Sec: 0.26,
  cleaveDash1Sec: 0.22,
  cleaveWindup2Sec: 0.26,
  cleaveDash2Sec: 0.24,
  cleaveRecoverySec: 0.28,
  cleaveDashSpeed: 18.2,
  cleaveMeleeHitRadius: 2.55,
  cleaveMeleeDamage: 13,
  cleaveWaveSpeed: 17.5,
  cleaveWaveDamage: 11,
  cleaveWaveRadius: 1.28,
  cleaveWaveLife: 1.05,

  // Astarion — Stealth Flanker (Cunning Action: Hide -> Pillar Circle -> Sneak Attack + 3-Dagger Crimson Fan)
  astarionAttackCooldownP1: 2.1,
  astarionAttackCooldownP2: 1.62,
  hideDurationSec: 2.2,
  hideSpeedMult: 1.48,
  hidePillarOrbitRadius: 3.15,
  sneakTelegraphSec: 0.44,
  sneakDashDurationSec: 0.26,
  sneakDashSpeed: 24.5,
  sneakMeleeHitRadius: 2.5,
  sneakMeleeDamage: 16,
  sneakRecoverySec: 0.3,
  daggerTelegraphSec: 0.34,
  daggerAttackDurationSec: 0.88,
  daggerCount: 3,
  daggerFanRad: 0.62,
  daggerSpeed: 21.5,
  daggerDamage: 11,
  daggerRadius: 0.58,
  daggerLife: 2.2,

  // Gale — Backline Artillery (Arcane Ward Bubble, 3-Bolt Homing Magic Missile, Delayed Fireball Rings)
  galeAttackCooldownP1: 2.25,
  galeAttackCooldownP2: 1.75,
  arcaneWardMaxHits: 3,
  arcaneWardDurationSec: 11.5,
  arcaneWardCooldownSec: 11.5,
  arcaneWardInitialCooldownSec: 1.4,
  arcaneWardCastDurationSec: 0.56,
  arcaneWardDeflectSparkCount: 10,
  arcaneWardShatterSparkCount: 22,
  arcaneWardShatterCameraShake: 0.17,
  magicMissileTelegraphSec: 0.42,
  magicMissileIntervalSec: 0.14,
  magicMissileCount: 3,
  magicMissileSpeed: 14.2,
  magicMissileTurnRateRad: 2.35,
  magicMissileDamage: 9,
  magicMissileRadius: 0.54,
  magicMissileLife: 3.4,
  magicMissileAttackDurationSec: 1.08,
  magicMissilePillarPad: 0.28,
  fireballTelegraphSec: 1.05,
  fireballActiveSec: 0.52,
  fireballRadius: 3.6,
  fireballDamage: 20,
  fireballCastDurationSec: 0.72,
  fireballCountP1: 1,
  fireballCountP2: 2,
  fireballCascadeStepSec: 0.24,
  fireballSpreadRadius: 3.4,
  fireballLeadFactor: 0.42,
  fireballCameraShake: 0.22,

  // Shadowheart — Dark Justiciar Sovereign (Guiding Bolt, Spirit Guardians, Sharran Eclipse -> 360° Stolen Kiss)
  shadowheartAttackCooldownP1: 2.25,
  shadowheartAttackCooldownP2: 1.85,
  shadowheartAttackCooldownP3: 1.45,
  guidingBoltTelegraphSec: 0.58,
  guidingBoltActiveSec: 0.48,
  guidingBoltBeamLength: 26.5,
  guidingBoltHitWidth: 0.72,
  guidingBoltDamage: 16,
  guidingBoltDurationSec: 1.18,
  guidingBoltCameraShake: 0.14,
  spiritGuardiansTriggerDist: 6.2,
  spiritGuardiansRadius: 3.0,
  spiritGuardiansDurationSec: 4.5,
  spiritGuardiansTickDamage: 9,
  spiritGuardiansHitCooldownSec: 0.65,
  spiritGuardiansCastDurationSec: 0.72,
  spiritGuardiansCooldownSec: 7.5,
  eclipseChannelSec: 1.28,
  eclipseRecoverySec: 0.26,
  eclipseMaxRadius: 19.5,
  eclipseRingDurationSec: 1.35,
  eclipseRingHitThickness: 1.45,
  eclipseDamage: 18,
  eclipseOrbCount: 8,
  eclipseOrbSpeed: 12.8,
  eclipseOrbDamage: 12,
  eclipseCameraShake: 0.22,
} as const);

export const SPECIAL_SCENARIOS: readonly SpecialScenarioDefinition[] =
  Object.freeze([
    Object.freeze({
      id: 'wolf_and_raven',
      title: 'The Wolf & The Raven',
      subtitle: 'Geralt of Rivia & Yennefer of Vengerberg',
      arenaId: 'skellige_peak',
      unlocked: true,
      guestPedestalIndex: 0,
      bosses: Object.freeze([
        Object.freeze({
          bossId: SPECIAL_SCENARIO_CONFIG.geraltId,
          displayName: SPECIAL_SCENARIO_CONFIG.geraltDisplayName,
          title: SPECIAL_SCENARIO_CONFIG.geraltTitle,
          rigKey: 'geralt' as const,
          maxHp: WOLF_AND_RAVEN_CONFIG.geraltMaxHp,
          hitRadius: SPECIAL_SCENARIO_CONFIG.geraltHitRadius,
          canBeSiphoned: false,
          guestPedestalIndex: null,
          spawnOffsetX: -SPECIAL_SCENARIO_CONFIG.duoSpacingOffsetX,
          spawnOffsetZ: SPECIAL_SCENARIO_CONFIG.duoSpacingOffsetZ,
          barAccentHex: PALETTE.hex.steelSilver,
        }),
        Object.freeze({
          bossId: SPECIAL_SCENARIO_CONFIG.yenneferId,
          displayName: SPECIAL_SCENARIO_CONFIG.yenneferDisplayName,
          title: SPECIAL_SCENARIO_CONFIG.yenneferTitle,
          rigKey: 'yennefer' as const,
          maxHp: WOLF_AND_RAVEN_CONFIG.yenneferMaxHp,
          hitRadius: SPECIAL_SCENARIO_CONFIG.yenneferHitRadius,
          canBeSiphoned: true,
          guestPedestalIndex: 0,
          spawnOffsetX: SPECIAL_SCENARIO_CONFIG.duoSpacingOffsetX,
          spawnOffsetZ: -SPECIAL_SCENARIO_CONFIG.duoSpacingOffsetZ,
          barAccentHex: PALETTE.hex.amethystTrim,
        }),
      ]),
    }),
    Object.freeze({
      id: BALDURS_GATE_PARTY_CONFIG.scenarioId,
      title: 'Shadows of the Sharran Crypt',
      subtitle: "Lae'zel, Astarion, Gale & Shadowheart",
      arenaId: 'sharran_crypt',
      unlocked: true,
      guestPedestalIndex: 1,
      bosses: Object.freeze([
        Object.freeze({
          bossId: BALDURS_GATE_PARTY_CONFIG.laezelId,
          displayName: BALDURS_GATE_PARTY_CONFIG.laezelDisplayName,
          title: BALDURS_GATE_PARTY_CONFIG.laezelTitle,
          rigKey: 'laezel' as const,
          maxHp: BG3_PARTY_CONFIG.laezelMaxHp,
          hitRadius: BALDURS_GATE_PARTY_CONFIG.laezelHitRadius,
          canBeSiphoned: false,
          guestPedestalIndex: null,
          spawnOffsetX: BALDURS_GATE_PARTY_CONFIG.laezelSpawnOffsetX,
          spawnOffsetZ: BALDURS_GATE_PARTY_CONFIG.laezelSpawnOffsetZ,
          barAccentHex: PALETTE.hex.bg3LaezelSteel,
        }),
        Object.freeze({
          bossId: BALDURS_GATE_PARTY_CONFIG.astarionId,
          displayName: BALDURS_GATE_PARTY_CONFIG.astarionDisplayName,
          title: BALDURS_GATE_PARTY_CONFIG.astarionTitle,
          rigKey: 'astarion' as const,
          maxHp: BG3_PARTY_CONFIG.astarionMaxHp,
          hitRadius: BALDURS_GATE_PARTY_CONFIG.astarionHitRadius,
          canBeSiphoned: false,
          guestPedestalIndex: null,
          spawnOffsetX: BALDURS_GATE_PARTY_CONFIG.astarionSpawnOffsetX,
          spawnOffsetZ: BALDURS_GATE_PARTY_CONFIG.astarionSpawnOffsetZ,
          barAccentHex: PALETTE.hex.bg3AstarionCrimson,
        }),
        Object.freeze({
          bossId: BALDURS_GATE_PARTY_CONFIG.galeId,
          displayName: BALDURS_GATE_PARTY_CONFIG.galeDisplayName,
          title: BALDURS_GATE_PARTY_CONFIG.galeTitle,
          rigKey: 'gale' as const,
          maxHp: BG3_PARTY_CONFIG.galeMaxHp,
          hitRadius: BALDURS_GATE_PARTY_CONFIG.galeHitRadius,
          canBeSiphoned: false,
          guestPedestalIndex: null,
          spawnOffsetX: BALDURS_GATE_PARTY_CONFIG.galeSpawnOffsetX,
          spawnOffsetZ: BALDURS_GATE_PARTY_CONFIG.galeSpawnOffsetZ,
          barAccentHex: PALETTE.hex.bg3GaleArcane,
        }),
        Object.freeze({
          bossId: BALDURS_GATE_PARTY_CONFIG.shadowheartId,
          displayName: BALDURS_GATE_PARTY_CONFIG.shadowheartDisplayName,
          title: BALDURS_GATE_PARTY_CONFIG.shadowheartTitle,
          rigKey: 'shadowheart' as const,
          maxHp: BG3_PARTY_CONFIG.shadowheartMaxHp,
          hitRadius: BALDURS_GATE_PARTY_CONFIG.shadowheartHitRadius,
          canBeSiphoned: true,
          guestPedestalIndex: 1,
          spawnOffsetX: BALDURS_GATE_PARTY_CONFIG.shadowheartSpawnOffsetX,
          spawnOffsetZ: BALDURS_GATE_PARTY_CONFIG.shadowheartSpawnOffsetZ,
          barAccentHex: PALETTE.hex.bg3ShadowheartViolet,
        }),
      ]),
    }),
  ]);

// ============================================================================
// SHARRAN CRYPT DUNGEON ARENA (1.5x RADIUS — 1v4 BALDUR'S GATE 3 SCENARIO)
// ============================================================================

export const SHARRAN_CRYPT_CONFIG = Object.freeze({
  arenaRadius: ARENA_CONFIG.radius * 1.5, // 27.0m (exact 1.5x standard arena radius)
  playerClampRadius: 25.2,
  bossClampRadius: 24.4,
  playerSpawnX: 0,
  playerSpawnY: 0,
  playerSpawnZ: 18.5,
  playerSpawnYaw: Math.PI,
  floorTextureSize: 1024,

  // 4 Symmetrical Weathered Obsidian Tactical Cover Pillars (radius = 0.52 * arenaRadius)
  innerPillarCount: 4,
  innerPillarRingRatio: 0.52,
  innerPillarBaseRadius: 1.42,
  innerPillarCollisionRadius: 1.55,
  innerPillarHeight: 13.8,
  innerPillarAngleOffsetRad: Math.PI * 0.25,

  // Vaulted Subterranean Crypt Perimeter & Arches
  archCount: 12,
  wallRadius: 27.4,
  wallHeight: 16.5,
  vaultApexY: 22.0,

  // Rear Sharran Lunar Altar Dais (Shadowheart Anchor)
  altarPosZ: -17.5,
  altarRadius: 4.4,
  altarHeight: 0.34,

  // Flickering Magenta-Violet Brazier Sconces
  brazierCount: 8,
  brazierRingRadius: 24.8,
  brazierSconceY: 2.35,
  brazierLightIntensity: 4.2,
  brazierLightDistance: 17.0,

  // Pooled Drifting Shadow Mist
  shadowMistCount: 280,
  shadowMistAreaRadius: 26.2,
  shadowMistMinY: 0.14,
  shadowMistMaxY: 3.6,
  shadowMistDriftSpeed: 0.95,

  lighting: Object.freeze({
    hemiIntensity: 1.05,
    keyIntensity: 1.65,
    amethystRimIntensity: 2.35,
    lunarRimIntensity: 1.45,
    fogDensity: 0.0118,
    shadowExtent: 34,
  } as const),
} as const);

// ============================================================================
// SKELLIGE OBSIDIAN PEAK ARENA (SPECIAL SCENARIO: THE WOLF & THE RAVEN)
// ============================================================================

export const SKELLIGE_PEAK_CONFIG = Object.freeze({
  arenaRadius: 18,
  playerClampRadius: 16.8,
  floorTextureSize: 1024,
  skyDomeRadius: 135,
  monolithCount: 10,
  monolithRingRadius: 17.5,
  monolithCollisionRadius: 1.05,
  monolithHeight: 7.4,
  distantPeakCount: 16,
  distantPeakMinRadius: 46,
  distantPeakMaxRadius: 86,
  snowCount: 420,
  snowAreaRadius: 28,
  snowMaxHeight: 20,
  snowWindX: 3.6,
  snowWindZ: 1.25,
  lighting: Object.freeze({
    hemiIntensity: 1.18,
    keyIntensity: 1.85,
    amethystRimIntensity: 2.1,
    stormRimIntensity: 1.55,
    fogDensity: 0.0112,
    shadowExtent: 26,
  } as const),
} as const);
