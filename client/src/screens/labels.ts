import {
  WEAPONS,
  type GameMode,
  type MapId,
  type RoomStatus,
  type Team,
  type WeaponId,
} from "@mp-fps/shared";

export const MAP_LABELS: Record<MapId, string> = {
  medycynaSunny: "MPSunny",
  medycyna: "MPKrakoskieCzystePowietrze",
  medycynaNight: "MPNight",
  shipment: "Shipment",
};
export const MODE_LABELS: Record<GameMode, string> = {
  tdm: "Team Deathmatch",
  dm: "Deathmatch",
};
export const STATUS_LABELS: Record<RoomStatus, string> = {
  lobby: "In lobby",
  playing: "In game",
  ended: "Finishing",
};
export const TEAM_LABELS: Record<Team, string> = {
  red: "Red team",
  blue: "Blue team",
  none: "",
};

export function weaponName(id: WeaponId): string {
  return WEAPONS[id].name;
}
