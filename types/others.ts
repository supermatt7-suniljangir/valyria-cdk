export interface Bookmark {
  userId: string; // The ID of the user who owns the bookmark
  projectId: string; // The URL of the bookmark
  bookmarkId: string;
  createdAt: number; // Timestamp of when the bookmark was created
}

export interface Comment {
  userId: string; // The ID of the user who owns the bookmark
  projectId: string; // The URL of the bookmark
  commentId: string;
  createdAt: number; // Timestamp of when the bookmark was created
}
