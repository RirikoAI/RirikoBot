export interface GuildDto {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  owner: boolean;
  permissions: number; // Numeric bitmask
  permissions_new: string; // String-based bitmask (useful for BigInt)
  features: string[];
  approximate_member_count: number;
  approximate_presence_count: number;
  can_manage_server?: boolean; // New field to indicate permission
}

export type GuildsResponseDto = GuildDto[];
