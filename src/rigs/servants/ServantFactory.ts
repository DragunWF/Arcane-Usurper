import {
  SERVANT_ARCHETYPES,
  type ServantArchetype,
} from '../../config/gameConfig';
import { CryoAcolyteRig } from './CryoAcolyteRig';
import { FrostbiteWardenRig } from './FrostbiteWardenRig';
import { GlacialVanguardRig } from './GlacialVanguardRig';
import { RimeHoundRig } from './RimeHoundRig';
import type { ServantRigAdapter } from './ServantBase';

export type ServantRigConstructor = () => ServantRigAdapter;

const servantRegistry = new Map<ServantArchetype, ServantRigConstructor>([
  [SERVANT_ARCHETYPES.GLACIAL_VANGUARD, () => new GlacialVanguardRig()],
  [SERVANT_ARCHETYPES.CRYO_ACOLYTE, () => new CryoAcolyteRig()],
  [SERVANT_ARCHETYPES.RIME_HOUND, () => new RimeHoundRig()],
  [SERVANT_ARCHETYPES.FROSTBITE_WARDEN, () => new FrostbiteWardenRig()],
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
