// types.ts
export interface User {
  userId: string;
  email: string;
  fullName: string;
  avatar?: string;
  availableForHire: boolean;
  followerCount: number;
  followingCount: number;
  createdAt: string;
  updatedAt: string;
  profile?: {
    profession?: string;
    bio?: string;
    cover?: string;
    website?: string;
  };
  social?: {
    facebook?: string;
    twitter?: string;
    instagram?: string;
    linkedin?: string;
    github?: string;
  };
}

export interface FollowerRelation {
  userId: string; // Who is being followed
  followerId: string; // Who is following
  createdAt: string;
  followerName: string; // Denormalized data
  followerAvatar: string;
}

