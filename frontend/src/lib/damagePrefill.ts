export const DAMAGE_PREFILL_KEY = "servicehub-damage-prefill";

export type DamagePrefillPayload = {
  job_description: string;
  service_id?: string;
};

export function saveDamagePrefill(payload: DamagePrefillPayload) {
  try {
    sessionStorage.setItem(DAMAGE_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function readDamagePrefill(): DamagePrefillPayload | null {
  try {
    const raw = sessionStorage.getItem(DAMAGE_PREFILL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DamagePrefillPayload;
    if (parsed?.job_description && typeof parsed.job_description === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearDamagePrefill() {
  try {
    sessionStorage.removeItem(DAMAGE_PREFILL_KEY);
  } catch {
    /* ignore */
  }
}
