import { useAuth } from "@/context/AuthContext";
import type { Capability } from "@/lib/types";

/**
 * What the signed-in staff account may do.
 *
 * This hides controls the user would only be refused on. It is **not** the
 * authorisation — every endpoint checks the capability server-side regardless
 * of what this returns, so a user who edits the response in devtools gains
 * nothing but a button that 403s.
 */
export function useCapabilities() {
  const { user } = useAuth();
  const granted = new Set<string>(user?.capabilities ?? []);
  const isSuperuser = Boolean(user?.is_superuser);

  const can = (capability: Capability) => isSuperuser || granted.has(capability);

  return {
    can,
    canAny: (...capabilities: Capability[]) => capabilities.some(can),
    roles: user?.roles ?? [],
    isSuperuser,
  };
}
