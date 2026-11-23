export type Role = 'owner' | 'editor' | 'viewer';

export const ROLE_HIERARCHY: Record<Role, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function isRoleSufficient(currentRole: Role, minRole: Role): boolean {
  return (ROLE_HIERARCHY[currentRole] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

export function isHigherRole(roleA: Role, roleB: Role): boolean {
  return (ROLE_HIERARCHY[roleA] ?? 0) > (ROLE_HIERARCHY[roleB] ?? 0);
}
