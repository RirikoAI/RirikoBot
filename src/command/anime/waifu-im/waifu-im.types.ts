export type WaifuImResults = {
  images: WaifuImImages[];
};

export type WaifuImImages = {
  signature: string;
  extension: string;
  image_id: number;
  favorites: number;
  dominant_color: string;
  source: string;
  uploaded_at: string;
  liked_at: any;
  is_nsfw: boolean;
  width: number;
  height: number;
  byte_size: number;
  url: string;
  preview_url: string;
  tags: {
    tag_id: number;
    name: string;
    description: string;
    is_nsfw: boolean;
  }[];
  artist: {
    artist_id: number;
    name: string;
    patreon: any;
    pixiv: string;
    twitter: string;
    deviant_art: any;
  };
};
