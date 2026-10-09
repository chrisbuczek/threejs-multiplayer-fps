export type GraphicsQuality = "low" | "medium" | "high" | "ultra";

export interface UserSettings {
  sensitivity: number;
  fov: number;
  volume: number;
  quality: GraphicsQuality;
  motionBlur: boolean;
}

const STORAGE_KEY = "mp-fps-settings";
const DEFAULTS: UserSettings = {
  sensitivity: 1,
  fov: 80,
  volume: 0.7,
  quality: "low",
  motionBlur: true,
};

/** Settings live in localStorage, which may be unavailable (private mode) — so always fall back. */
export function loadSettings(): UserSettings {
  try {
    const stored = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<UserSettings>;
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore: settings just won't persist.
  }
}

export function loadPlayerName(): string {
  try {
    return localStorage.getItem("mp-fps-name") ?? "";
  } catch {
    return "";
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem("mp-fps-name", name);
  } catch {
    // Ignore.
  }
}
