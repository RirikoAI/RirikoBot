export type FreeGameProviderType = 'EPIC' | 'STEAM' | 'GOG';

export interface FreeGameItem {
  id: string;
  provider: FreeGameProviderType;
  title: string;
  storeUrl: string;
  thumbnailUrl: string | null;
  startDate: Date;
  endDate: Date;
  originalPrice?: string | undefined;
  isUpcoming?: boolean | undefined;
}

export interface FreeGameProvider {
  readonly id: FreeGameProviderType;
  readonly name: string;
  fetchFreeGames(): Promise<FreeGameItem[]>;
}
