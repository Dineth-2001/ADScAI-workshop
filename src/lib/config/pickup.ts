export const PICKUP_CONFIG = {
  windowMinutes: 15,
  horizonMinutes: 120,
  leadMinutes: 30,
  defaultCapacity: 15,
  cancelCutoffMinutes: 10,
  graceMinutes: 10,
  operatingHours: {
    openHour: 11,
    openMinute: 0,
    closeHour: 14,
    closeMinute: 0,
  },
} as const;

export type PickupConfig = typeof PICKUP_CONFIG;
