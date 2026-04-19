import { UserRole } from "../../types";

export const toUserRole = (
  raw?: string,
  fallback: UserRole = UserRole.CUSTOMER,
): UserRole => {
  if (!raw) return fallback;
  const upper = raw.toUpperCase() as UserRole;
  return Object.values(UserRole).includes(upper) ? upper : fallback;
};