export type VerificationStatus = 'verified_arttrack' | 'candidate_audio' | 'browser_resolve';

export interface CuratedTrack {
  id: string;
  order: number;
  title: string;
  artist: string;
  album: string;
  year: number;
  reason: string;
  artTrackQuery: string;
  videoId: string | null;
  watchUrl: string | null;
  channelName: string | null;
  isTopicChannel: boolean;
  hasProvidedBySnippet: boolean;
  verificationStatus: VerificationStatus;
  verificationNote: string;
  durationText: string;
  artworkUrl: string | null;
  previewUrl: string | null;
}

export interface CuratedPlaylist {
  playlistTitle: string;
  artist: string;
  curationNote: string;
  prompt: string;
  strictTopicOnly: boolean;
  excludeLive: boolean;
  excludeRemixes: boolean;
  tracks: CuratedTrack[];
  youtubeQueueUrl: string | null;
  youtubeMusicUrls?: string[];
  verifiedCount: number;
  generatedAt: string;
  attemptedTitles?: string[];
}

export interface CurateRequestPayload {
  prompt: string;
  artist?: string;
  trackCount: number;
  strictTopicOnly: boolean;
  excludeLive: boolean;
  excludeRemixes: boolean;
  excludeTitles?: string[];
  batchMode?: boolean;
}

export interface ArtistSuggestion {
  id: string;
  name: string;
  genre: string;
  sampleAlbum: string | null;
  artworkUrl: string | null;
}
