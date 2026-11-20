import {
  SERVANT_ARCHETYPES,
  type ServantArchetype,
} from '../../config/gameConfig';
import { AbyssalSirenWeaverRig } from './AbyssalSirenWeaverRig';
import { CoralBastionRig } from './CoralBastionRig';
import { CryoAcolyteRig } from './CryoAcolyteRig';
import { FrostbiteWardenRig } from './FrostbiteWardenRig';
import { GlacialVanguardRig } from './GlacialVanguardRig';
import { RazorfinMantaRig } from './RazorfinMantaRig';
import { RimeHoundRig } from './RimeHoundRig';
import type { ServantRigAdapter } from './ServantBase';
import { TideguardHopliteRig } from './TideguardHopliteRig';

export type ServantRigConstructor = () => ServantRigAdapter;

const servantRegistry = new Map<ServantArchetype, ServantRigConstructor>([
  // Realm I — Royal Ice Chambers
  [SERVANT_ARCHETYPES.GLACIAL_VANGUARD, () => new GlacialVanguardRig()],
  [SERVANT_ARCHETYPES.CRYO_ACOLYTE, () => new CryoAcolyteRig()],
  [SERVANT_ARCHETYPES.RIME_HOUND, () => new RimeHoundRig()],
  [SERVANT_ARCHETYPES.FROSTBITE_WARDEN, () => new FrostbiteWardenRig()],

  // Realm II — The Sunken Aqueduct
  [SERVANT_ARCHETYPES.TIDEGUARD_HOPLITE, () => new TideguardHopliteRig()],
  [SERVANT_ARCHETYPES.ABYSSAL_SIREN_WEAVER, () => new AbyssalSirenWeaverRig()],
  [SERVANT_ARCHETYPES.RAZORFIN_MANTA, () => new RazorfinMantaRig()],
  [SERVANT_ARCHETYPES.CORAL_BASTION, () => new CoralBastionRig()],
]);

/**
 * Registers or overrides a servant rig builder for a given archetype (Open/Closed Principle).
 * Future realms (Cyber-Cathedral drones, Abyssal Palace sentinels) plug in here without
 * modifying ChamberSystem or combat code.
 */
export function registerServantRig(
  archetype: ServantArchetype,
  factory: ServantRigConstructor,
): void {
  servantRegistry.set(archetype, factory);
}

/**
 * Polymorphic factory producing a standardized `ServantRigAdapter` for any registered archetype.
 */
export function createServantRig(
  archetype: ServantArchetype,
): ServantRigAdapter {
  const ctor = servantRegistry.get(archetype);
  if (!ctor) {
    throw new Error(
      `[ServantFactory] Unregistered servant archetype: ${archetype}`,
    );
  }
  return ctor();
}
