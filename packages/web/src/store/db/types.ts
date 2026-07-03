export type ToggleTable = "follows" | "blocks";

export const REACTION = { like: 1, dislike: -1, none: 0 } as const;

export interface PostSnap {
  uri: string;
  author_uri?: string | null;
  title?: string | null;
  body?: string | null;
  published_at?: string | null;
  url?: string | null;
}

export interface AuthorSnap {
  uri: string;
  name?: string | null;
  image?: string | null;
}

export interface LikedPost {
  uri: string;
  title: string | null;
  body: string | null;
  published_at: string | null;
  url: string | null;
  author_name: string | null;
  author_image: string | null;
}
