export interface SteamGame {
  name: string;
  url: string;
}

export interface SteamResponse {
  items: SteamGame[];
}
