import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface GeminiTrackItem {
  title: string;
  artist: string;
  album: string;
  year: number;
  reason: string;
  artTrackQuery: string;
}

interface GeminiPlaylistResponse {
  playlistTitle: string;
  artist: string;
  curationNote: string;
  tracks: GeminiTrackItem[];
}

interface YouTubeResolution {
  videoId: string | null;
  channelName: string | null;
  isTopicChannel: boolean;
  hasProvidedBySnippet: boolean;
  durationText: string | null;
  thumbnailUrl: string | null;
  verificationStatus: 'verified_arttrack' | 'candidate_audio' | 'browser_resolve';
  verificationNote: string;
}

interface ItunesMetadata {
  artworkUrl: string | null;
  previewUrl: string | null;
  albumName: string | null;
  durationText: string | null;
  releaseYear: number | null;
}

interface ResolvedCuratedTrack {
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
  verificationStatus: 'verified_arttrack' | 'candidate_audio' | 'browser_resolve';
  verificationNote: string;
  durationText: string;
  artworkUrl: string | null;
  previewUrl: string | null;
}

const COVER_TRIBUTE_KEYWORDS = [
  'tribute',
  'tributo',
  'cover',
  'karaoke',
  'instrumental',
  'lullaby',
  'nanas',
  'reimagined',
  'made famous',
  'originally performed',
  'in the style of',
  'al estilo de',
  'piano version',
  'acoustic cover',
  'guitar cover',
  'drum cover',
  'bass cover',
  'vocal cover',
  'parody',
  'parodia',
  '8-bit',
  '8 bit',
  'music box',
  'string quartet',
  'orchestral version',
  'vitamin string',
  'hit crew',
  'rockabye',
  'nightcore',
  'slowed',
  'sped up',
];

const VIDEO_KEYWORDS = [
  'official video',
  'official music video',
  'video oficial',
  'videoclip',
  'music video',
  'lyric video',
  'lyrics video',
  'con letra',
  'mv)',
  '[mv]',
  'visualizer',
  'official visual',
];

const LIVE_KEYWORDS = [
  '(live',
  '[live',
  'live at',
  'live in',
  'live from',
  'en vivo',
  'directo',
  'concierto',
  'concert',
  'unplugged',
  'mtv unplugged',
  'rock in rio',
  'wembley',
  'budokan',
  'sun city',
];

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSongKey(title: string): string {
  return normalizeText(
    title
      .replace(/\([^)]*(remaster|version|edit|mono|stereo|deluxe|anniversary|mix)[^)]*\)/gi, '')
      .replace(/\[[^\]]*(remaster|version|edit|mono|stereo|deluxe|anniversary|mix)[^\]]*\]/gi, '')
      .replace(/\s+-\s+(remaster|single|album|radio|20\d{2}|19\d{2}).*$/i, '')
  );
}

function extractArtistFromPrompt(prompt: string, explicitArtist?: string): string {
  if (explicitArtist && explicitArtist.trim().length > 0) {
    return explicitArtist.trim();
  }
  const cleaned = prompt
    .trim()
    .replace(/^haz\s+una\s+playlist\s+con\s+los\s+mejores\s+[eé]xitos\s+de\s+/i, '')
    .replace(/^los\s+mejores\s+[eé]xitos\s+de\s+/i, '')
    .replace(/^best\s+studio\s+hits\s+by\s+/i, '')
    .replace(/\s+sin\s+videoclips.*$/i, '')
    .replace(/,\s*arttracks?\s+only.*$/i, '')
    .trim();
  return cleaned || prompt.trim();
}

function extractChannelBase(channelName: string): string {
  return normalizeText(
    channelName
      .replace(/\s*-\s*topic$/i, '')
      .replace(/\s+topic$/i, '')
      .replace(/\s+official$/i, '')
      .replace(/\s+oficial$/i, '')
      .replace(/vevo$/i, '')
  );
}

function isMixedArtistTarget(targetArtist: string): boolean {
  const n = normalizeText(targetArtist);
  return !n || n === 'varios artistas' || n === 'various artists' || n === 'varios';
}

function isSingleArtistMatch(candidateName: string, referenceArtist: string): boolean {
  const normCandidate = normalizeText(candidateName);
  const normRef = normalizeText(referenceArtist);
  if (!normCandidate || !normRef) return false;
  if (normCandidate === normRef) return true;

  // Reject cover/tribute channels unless the reference artist itself uses that word
  for (const kw of COVER_TRIBUTE_KEYWORDS) {
    if (normCandidate.includes(kw) && !normRef.includes(kw)) {
      return false;
    }
  }

  // Exact collaboration match only (e.g. "Queen & David Bowie" -> "queen and david bowie"),
  // never bare prefix match (which would wrongly match "Queen Naija" or "Queen Tee" to "Queen")
  if (normRef.length >= 3) {
    if (
      normCandidate.startsWith(`${normRef} and `) ||
      normCandidate.startsWith(`${normRef} feat`) ||
      normCandidate.startsWith(`${normRef} ft `) ||
      normCandidate.startsWith(`${normRef} with `) ||
      normCandidate.startsWith(`${normRef} x `) ||
      normRef.startsWith(`${normCandidate} and `) ||
      normRef.startsWith(`${normCandidate} feat`) ||
      normRef.startsWith(`${normCandidate} ft `) ||
      normRef.startsWith(`${normCandidate} with `)
    ) {
      return true;
    }
  }

  const stripThe = (s: string) => s.replace(/^the\s+/, '');
  if (stripThe(normCandidate) === stripThe(normRef)) return true;

  if (normCandidate.replace(/\s+/g, '') === normRef.replace(/\s+/g, '')) return true;

  return false;
}

function isOfficialArtistChannel(
  channelName: string,
  targetArtist: string,
  trackArtist: string
): boolean {
  if (!channelName) return false;
  const channelBase = extractChannelBase(channelName);
  if (!channelBase) return false;

  const mixed = isMixedArtistTarget(targetArtist);
  const primaryRef = mixed ? trackArtist : targetArtist;

  if (isSingleArtistMatch(channelBase, primaryRef)) {
    return true;
  }

  // If track artist is e.g. "Queen & David Bowie" and targetArtist is "Queen",
  // also check the first listed artist on the track if it matches targetArtist.
  if (!mixed && trackArtist && isSingleArtistMatch(trackArtist, targetArtist)) {
    return isSingleArtistMatch(channelBase, trackArtist);
  }

  return false;
}

function titleMatchesTrack(videoTitle: string, trackTitle: string): boolean {
  const normVideo = normalizeSongKey(videoTitle) || normalizeText(videoTitle);
  const normTrack = normalizeSongKey(trackTitle) || normalizeText(trackTitle);
  if (!normVideo || !normTrack) return false;

  if (normVideo.includes(normTrack) || normTrack.includes(normVideo)) {
    return true;
  }

  const trackWords = normTrack.split(' ').filter((w) => w.length >= 2);
  if (trackWords.length === 0) return false;
  const matched = trackWords.filter((w) => normVideo.includes(w)).length;
  return matched / trackWords.length >= 0.7;
}

function hasCoverOrInvalidMarker(
  videoTitle: string,
  snippet: string,
  channelName: string,
  trackTitle: string,
  targetArtist: string,
  excludeLive: boolean,
  excludeRemixes: boolean
): { rejected: boolean; isVideoClip: boolean } {
  const vLower = videoTitle.toLowerCase();
  const sLower = snippet.toLowerCase();
  const cLower = channelName.toLowerCase();
  const tLower = trackTitle.toLowerCase();
  const aLower = targetArtist.toLowerCase();
  const combinedText = `${vLower} ${sLower} ${cLower}`;

  for (const kw of COVER_TRIBUTE_KEYWORDS) {
    if (combinedText.includes(kw) && !tLower.includes(kw) && !aLower.includes(kw)) {
      return { rejected: true, isVideoClip: false };
    }
  }

  for (const kw of VIDEO_KEYWORDS) {
    if (vLower.includes(kw) && !tLower.includes(kw)) {
      return { rejected: true, isVideoClip: true };
    }
  }

  if (excludeLive) {
    for (const kw of LIVE_KEYWORDS) {
      if ((vLower.includes(kw) || sLower.includes(kw)) && !tLower.includes(kw)) {
        return { rejected: true, isVideoClip: false };
      }
    }
    if (/\blive\b/i.test(vLower) && !/\blive\b/i.test(tLower)) {
      return { rejected: true, isVideoClip: false };
    }
  }

  if (excludeRemixes) {
    if (
      (vLower.includes('remix') || vLower.includes('club mix')) &&
      !tLower.includes('remix')
    ) {
      return { rejected: true, isVideoClip: false };
    }
  }

  return { rejected: false, isVideoClip: false };
}

function formatMillis(ms: number | undefined): string | null {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

async function fetchItunesMetadata(
  artist: string,
  title: string,
  targetArtist: string
): Promise<ItunesMetadata> {
  const fallback: ItunesMetadata = {
    artworkUrl: null,
    previewUrl: null,
    albumName: null,
    durationText: null,
    releaseYear: null,
  };

  try {
    const term = encodeURIComponent(`${artist} ${title}`);
    const res = await fetch(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=6`,
      { signal: AbortSignal.timeout(2500) }
    );

    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      results?: Array<{
        trackName?: string;
        artistName?: string;
        collectionName?: string;
        artworkUrl100?: string;
        previewUrl?: string;
        trackTimeMillis?: number;
        releaseDate?: string;
      }>;
    };

    const results = data.results ?? [];
    if (results.length === 0) return fallback;

    const refArtist = isMixedArtistTarget(targetArtist) ? artist : targetArtist;
    const matchingArtistResults = results.filter(
      (item) => item.artistName && isSingleArtistMatch(item.artistName, refArtist)
    );
    if (matchingArtistResults.length === 0) return fallback;

    const normTitle = normalizeSongKey(title);
    const best =
      matchingArtistResults.find(
        (item) => item.trackName && normalizeSongKey(item.trackName).includes(normTitle)
      ) ?? matchingArtistResults[0];

    const artworkUrl = best.artworkUrl100
      ? best.artworkUrl100.replace('100x100bb', '600x600bb')
      : null;

    const releaseYear = best.releaseDate ? new Date(best.releaseDate).getUTCFullYear() : null;

    return {
      artworkUrl,
      previewUrl: best.previewUrl ?? null,
      albumName: best.collectionName ?? null,
      durationText: formatMillis(best.trackTimeMillis),
      releaseYear: releaseYear && Number.isFinite(releaseYear) ? releaseYear : null,
    };
  } catch {
    return fallback;
  }
}

const catalogCache = new Map<string, { items: GeminiTrackItem[]; expiresAt: number }>();

async function fetchItunesArtistCatalog(
  artist: string,
  excludeLive: boolean,
  excludeRemixes: boolean
): Promise<GeminiTrackItem[]> {
  if (!artist || isMixedArtistTarget(artist)) return [];
  const cacheKey = `${normalizeText(artist)}|${excludeLive}|${excludeRemixes}`;
  const cached = catalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  try {
    const encoded = encodeURIComponent(artist);
    const [songRes, artistRes] = await Promise.all([
      fetch(
        `https://itunes.apple.com/search?term=${encoded}&entity=song&attribute=artistTerm&limit=200`,
        { signal: AbortSignal.timeout(4000) }
      ),
      fetch(`https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&limit=5`, {
        signal: AbortSignal.timeout(3000),
      }),
    ]);

    type RawItunesSong = {
      wrapperType?: string;
      trackName?: string;
      artistName?: string;
      collectionName?: string;
      releaseDate?: string;
    };

    const allRawSongs: RawItunesSong[] = [];
    if (songRes.ok) {
      const songData = (await songRes.json()) as { results?: RawItunesSong[] };
      allRawSongs.push(...(songData.results ?? []));
    }

    // Also pull full studio album tracklists so 100+ songs are available even for artists with compilation overlap
    if (artistRes.ok) {
      const artistData = (await artistRes.json()) as {
        results?: Array<{ artistId?: number; artistName?: string }>;
      };
      const matchedArtist = (artistData.results ?? []).find(
        (a) => a.artistName && isSingleArtistMatch(a.artistName, artist)
      );
      if (matchedArtist?.artistId) {
        const albRes = await fetch(
          `https://itunes.apple.com/lookup?id=${matchedArtist.artistId}&entity=album&limit=45`,
          { signal: AbortSignal.timeout(3500) }
        );
        if (albRes.ok) {
          const albData = (await albRes.json()) as {
            results?: Array<{
              wrapperType?: string;
              collectionId?: number;
              collectionName?: string;
            }>;
          };
          const studioAlbumIds = (albData.results ?? [])
            .filter(
              (r) =>
                r.wrapperType === 'collection' &&
                r.collectionId &&
                !/\b(live|en vivo|concert|concierto|unplugged|greatest|platinum|essential|collection|hits|remixes|anthology|box set)\b/i.test(
                  r.collectionName ?? ''
                )
            )
            .slice(0, 36)
            .map((r) => r.collectionId as number);

          if (studioAlbumIds.length > 0) {
            const albumBatches: number[][] = [];
            for (let i = 0; i < studioAlbumIds.length; i += 18) {
              albumBatches.push(studioAlbumIds.slice(i, i + 18));
            }
            const discResponses = await Promise.all(
              albumBatches.map((batch) =>
                fetch(`https://itunes.apple.com/lookup?id=${batch.join(',')}&entity=song`, {
                  signal: AbortSignal.timeout(4500),
                }).catch(() => null)
              )
            );
            for (const discRes of discResponses) {
              if (discRes && discRes.ok) {
                const discData = (await discRes.json()) as { results?: RawItunesSong[] };
                for (const row of discData.results ?? []) {
                  if (row.wrapperType === 'track') {
                    allRawSongs.push(row);
                  }
                }
              }
            }
          }
        }
      }
    }

    const items: GeminiTrackItem[] = [];
    const seen = new Set<string>();

    for (const item of allRawSongs) {
      if (!item.trackName || !item.artistName) continue;
      if (!isSingleArtistMatch(item.artistName, artist)) continue;

      const tLower = item.trackName.toLowerCase();
      const cLower = (item.collectionName ?? '').toLowerCase();
      if (
        COVER_TRIBUTE_KEYWORDS.some(
          (kw) => (tLower.includes(kw) || cLower.includes(kw)) && !artist.toLowerCase().includes(kw)
        )
      ) {
        continue;
      }
      if (
        excludeLive &&
        (LIVE_KEYWORDS.some((kw) => tLower.includes(kw) || cLower.includes(kw)) ||
          /\blive\b/i.test(tLower))
      ) {
        continue;
      }
      if (excludeRemixes && (tLower.includes('remix') || cLower.includes('remix'))) {
        continue;
      }

      const key = normalizeSongKey(item.trackName);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const year = item.releaseDate ? new Date(item.releaseDate).getUTCFullYear() : 2000;
      items.push({
        title: item.trackName.trim(),
        artist,
        album: item.collectionName?.trim() || 'Álbum oficial',
        year: Number.isFinite(year) ? year : 2000,
        reason: 'Pista oficial del catálogo de estudio del artista',
        artTrackQuery: `${artist} ${item.trackName.trim()} "Provided to YouTube by"`,
      });
    }

    if (items.length > 0) {
      catalogCache.set(cacheKey, { items, expiresAt: Date.now() + 10 * 60 * 1000 });
    }
    return items;
  } catch {
    return [];
  }
}

function extractYtInitialData(html: string): Record<string, unknown> | null {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = '];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = idx + marker.length;
    const endScript = html.indexOf(';</script>', start);
    if (endScript !== -1) {
      try {
        return JSON.parse(html.slice(start, endScript)) as Record<string, unknown>;
      } catch {
        // Fallback to balanced brace scan if needed
      }
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    const maxScan = Math.min(html.length, start + 600000);
    for (let i = start; i < maxScan; i++) {
      const ch = html[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(html.slice(start, i + 1)) as Record<string, unknown>;
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}

interface RawVideoRenderer {
  videoId?: string;
  title?: { runs?: Array<{ text?: string }> };
  ownerText?: { runs?: Array<{ text?: string }> };
  longBylineText?: { runs?: Array<{ text?: string }> };
  lengthText?: { simpleText?: string };
  ownerBadges?: Array<{ metadataBadgeRenderer?: { style?: string; tooltip?: string } }>;
  detailedMetadataSnippets?: Array<{ snippetText?: { runs?: Array<{ text?: string }> } }>;
  thumbnail?: { thumbnails?: Array<{ url?: string; width?: number; height?: number }> };
}

function extractSearchVideoRenderers(ytData: Record<string, unknown>): RawVideoRenderer[] {
  const out: RawVideoRenderer[] = [];
  const contents = (
    ytData as {
      contents?: {
        twoColumnSearchResultsRenderer?: {
          primaryContents?: {
            sectionListRenderer?: {
              contents?: Array<{
                itemSectionRenderer?: {
                  contents?: Array<{ videoRenderer?: RawVideoRenderer }>;
                };
              }>;
            };
          };
        };
      };
    }
  )?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;

  if (!Array.isArray(contents)) return out;
  for (const section of contents) {
    const items = section?.itemSectionRenderer?.contents;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (item?.videoRenderer) out.push(item.videoRenderer);
    }
  }
  return out;
}

async function queryYouTubeSearch(searchQuery: string): Promise<RawVideoRenderer[]> {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}&hl=en&gl=US`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const ytData = extractYtInitialData(html);
    if (!ytData) return [];
    return extractSearchVideoRenderers(ytData);
  } catch {
    return [];
  }
}

function pickBestArtTrackCandidate(
  renderers: RawVideoRenderer[],
  trackArtist: string,
  title: string,
  album: string,
  targetArtist: string,
  excludeLive: boolean,
  excludeRemixes: boolean,
  strictTopicOnly: boolean
): YouTubeResolution | null {
  let bestScore = -999;
  let bestCandidate: {
    renderer: RawVideoRenderer;
    isTopicChannel: boolean;
    hasProvidedBy: boolean;
    channelName: string;
  } | null = null;

  const normAlbum = normalizeText(album);
  const normTrackTitle = normalizeSongKey(title);

  for (const r of renderers.slice(0, 15)) {
    if (!r.videoId) continue;

    const videoTitle = r.title?.runs?.map((x) => x.text ?? '').join('') ?? '';
    const channelName =
      r.ownerText?.runs?.map((x) => x.text ?? '').join('') ||
      r.longBylineText?.runs?.map((x) => x.text ?? '').join('') ||
      '';
    const snippet =
      r.detailedMetadataSnippets
        ?.flatMap((s) => s.snippetText?.runs?.map((x) => x.text ?? '') ?? [])
        .join(' ') ?? '';

    // GUARDRAIL 1: Strict official artist channel check (never accept covers by other artists)
    if (!isOfficialArtistChannel(channelName, targetArtist, trackArtist)) {
      continue;
    }

    // GUARDRAIL 2: Hard-reject covers, tributes, karaoke, lyric videos, official music videos, live/remixes
    const marker = hasCoverOrInvalidMarker(
      videoTitle,
      snippet,
      channelName,
      title,
      targetArtist,
      excludeLive,
      excludeRemixes
    );
    if (marker.rejected) {
      continue;
    }

    // GUARDRAIL 3: Verify track title actually matches
    if (!titleMatchesTrack(videoTitle, title)) {
      continue;
    }

    const cLower = channelName.toLowerCase();
    const sLower = snippet.toLowerCase();
    const isTopicChannel = cLower.endsWith(' - topic') || cLower.endsWith(' topic');
    const hasProvidedBy =
      sLower.includes('provided to youtube') || sLower.includes('auto-generated by youtube');
    const hasMusicBadge = (r.ownerBadges ?? []).some(
      (b) =>
        b.metadataBadgeRenderer?.style?.includes('MUSIC') ||
        b.metadataBadgeRenderer?.style?.includes('VERIFIED_ARTIST') ||
        b.metadataBadgeRenderer?.tooltip?.toLowerCase().includes('official artist')
    );

    if (strictTopicOnly && !isTopicChannel && !hasProvidedBy) {
      continue;
    }

    let score = 0;
    if (isTopicChannel) score += 75;
    if (hasProvidedBy) score += 55;
    if (hasMusicBadge) score += 20;
    if (normalizeSongKey(videoTitle) === normTrackTitle) score += 25;
    if (normAlbum && normAlbum.length >= 3 && normalizeText(snippet).includes(normAlbum)) {
      score += 30;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        renderer: r,
        isTopicChannel,
        hasProvidedBy,
        channelName,
      };
    }
  }

  if (!bestCandidate || !bestCandidate.renderer.videoId || bestScore < 20) {
    return null;
  }

  const { renderer, isTopicChannel, hasProvidedBy, channelName } = bestCandidate;
  const isVerified = isTopicChannel || hasProvidedBy;
  const thumbnails = renderer.thumbnail?.thumbnails ?? [];
  const lastThumb = thumbnails[thumbnails.length - 1]?.url ?? null;

  return {
    videoId: renderer.videoId ?? null,
    channelName: channelName || `${trackArtist} - Topic`,
    isTopicChannel,
    hasProvidedBySnippet: hasProvidedBy,
    durationText: renderer.lengthText?.simpleText ?? null,
    thumbnailUrl: lastThumb,
    verificationStatus: isVerified ? 'verified_arttrack' : 'candidate_audio',
    verificationNote: isVerified
      ? 'ArtTrack oficial verificado del artista (portada estática)'
      : 'Audio del canal oficial encontrado',
  };
}

async function resolveYouTubeArtTrack(
  trackArtist: string,
  title: string,
  album: string,
  targetArtist: string,
  excludeLive: boolean,
  excludeRemixes: boolean,
  strictTopicOnly: boolean
): Promise<YouTubeResolution> {
  const unresolved: YouTubeResolution = {
    videoId: null,
    channelName: null,
    isTopicChannel: false,
    hasProvidedBySnippet: false,
    durationText: null,
    thumbnailUrl: null,
    verificationStatus: 'browser_resolve',
    verificationNote: 'No se encontró ArtTrack oficial verificado para esta pista.',
  };

  const queryArtist = isMixedArtistTarget(targetArtist) ? trackArtist : targetArtist;
  const primaryQuery = `${queryArtist} ${title} "Provided to YouTube by"`;
  const primaryRenderers = await queryYouTubeSearch(primaryQuery);
  const primaryMatch = pickBestArtTrackCandidate(
    primaryRenderers,
    trackArtist,
    title,
    album,
    targetArtist,
    excludeLive,
    excludeRemixes,
    strictTopicOnly
  );
  if (primaryMatch) {
    return primaryMatch;
  }

  // Fallback query: "<Artist> <Title> "<Artist> - Topic"" handles OAC channels & accented titles cleanly
  const fallbackQuery = `${queryArtist} ${title} "${queryArtist} - Topic"`;
  const fallbackRenderers = await queryYouTubeSearch(fallbackQuery);
  const fallbackMatch = pickBestArtTrackCandidate(
    fallbackRenderers,
    trackArtist,
    title,
    album,
    targetArtist,
    excludeLive,
    excludeRemixes,
    strictTopicOnly
  );
  return fallbackMatch ?? unresolved;
}

async function generateCandidateBatchWithGemini(
  ai: GoogleGenAI,
  prompt: string,
  targetArtist: string,
  batchTarget: number,
  excludeTitles: string[],
  excludeLive: boolean,
  excludeRemixes: boolean
): Promise<GeminiPlaylistResponse> {
  const isSubsequentRound = excludeTitles.length > 0;
  const exclusionSnippet = isSubsequentRound
    ? `\nCANCIONES QUE YA FUERON INCLUIDAS O DESCARTADAS (PROHIBIDO REPETIRLAS):\n${excludeTitles
        .slice(-140)
        .map((t) => `- ${t}`)
        .join('\n')}`
    : '';

  const systemInstruction = `Eres un curador musical experto especializado en YouTube ArtTracks (pistas de audio oficiales bajo el canal oficial del artista o "<Artista> - Topic" con descripción "Provided to YouTube by ...").
Tu tarea es responder a la petición del usuario entregando un lote de exactamente ${batchTarget} canciones ÚNICAS de estudio oficiales del artista solicitado (${targetArtist}).
Reglas estrictas:
1. NUNCA incluyas covers interpretados por otros artistas, versiones tributo, karaoke, ni canciones de otros intérpretes.
2. Prioriza grabaciones de estudio originales de álbumes oficiales${excludeLive ? ' (NUNCA versiones en vivo o conciertos)' : ''}${excludeRemixes ? ' (NUNCA remixes ni club mixes)' : ''}.
3. ${
    isSubsequentRound
      ? 'Como ya se seleccionaron los éxitos más obvios, profundiza en TODOS los álbumes de estudio, sencillos oficiales y temas clásicos del catálogo del artista hasta completar el cupo sin repetir ninguno.'
      : 'Ordena primero los mayores éxitos y continúa con los clásicos imprescindibles de su discografía de estudio.'
  }
4. En "artTrackQuery", escribe: "<Artista> <Título> Provided to YouTube by".
5. Escribe "playlistTitle" y "curationNote" en español.
6. Responde exclusivamente en JSON válido siguiendo el esquema.`;

  const userContent = `${prompt}${exclusionSnippet}\n\nDevuelve exactamente ${batchTarget} canciones nuevas y diferentes que no estén en la lista anterior.`;

  const callCuratorModel = async (modelName: string) => {
    return ai.models.generateContent({
      model: modelName,
      contents: userContent,
      config: {
        systemInstruction,
        ...(modelName === 'gemini-4-hydrogen'
          ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
          : {}),
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            playlistTitle: {
              type: Type.STRING,
              description: 'Título editorial de la playlist generada',
            },
            artist: {
              type: Type.STRING,
              description: 'Banda o artista principal',
            },
            curationNote: {
              type: Type.STRING,
              description: 'Breve nota de 1 o 2 frases explicando el criterio de selección',
            },
            tracks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  artist: { type: Type.STRING },
                  album: { type: Type.STRING },
                  year: { type: Type.INTEGER },
                  reason: {
                    type: Type.STRING,
                    description: 'Por qué entra en los mejores éxitos (máximo 10 palabras)',
                  },
                  artTrackQuery: {
                    type: Type.STRING,
                    description: 'Consulta exacta para localizar el ArtTrack oficial en YouTube',
                  },
                },
                required: ['title', 'artist', 'album', 'year', 'reason', 'artTrackQuery'],
              },
            },
          },
          required: ['playlistTitle', 'artist', 'curationNote', 'tracks'],
        },
      },
    });
  };

  const callWithTimeout = async (modelName: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        callCuratorModel(modelName),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('503 Gemini timeout (>8.5s)')), 8500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const attemptDelaysMs = [0, 350];
  const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let response: Awaited<ReturnType<typeof callCuratorModel>> | null = null;
  let lastError: unknown = null;

  for (let i = 0; i < attemptDelaysMs.length; i++) {
    if (attemptDelaysMs[i] > 0) {
      await new Promise((r) => setTimeout(r, attemptDelaysMs[i]));
    }
    try {
      response = await callWithTimeout(modelsToTry[i]);
      break;
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.includes('timeout');
      if (!isTransient) {
        throw err;
      }
    }
  }

  if (!response || !response.text) {
    throw (
      lastError ??
      new Error('El servicio de IA está saturado temporalmente. Inténtalo en unos segundos.')
    );
  }

  return JSON.parse(response.text) as GeminiPlaylistResponse;
}

async function resolveYouTubeMusicQueueUrl(videoIds: string[]): Promise<string> {
  const cleanIds = videoIds.filter(Boolean).slice(0, 50);
  if (cleanIds.length === 0) return 'https://music.youtube.com';
  const fallbackUrl = `https://www.youtube.com/watch_videos?video_ids=${cleanIds.join(',')}`;

  try {
    const res = await fetch(fallbackUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Cookie: 'SOCS=CAI',
      },
    });
    const location = res.headers.get('location');
    if (location) {
      const parsed = new URL(location, 'https://www.youtube.com');
      const v = parsed.searchParams.get('v') || cleanIds[0];
      const list = parsed.searchParams.get('list');
      if (list) {
        return `https://music.youtube.com/watch?v=${encodeURIComponent(v)}&list=${encodeURIComponent(list)}`;
      }
    }
  } catch {
    // Fallback below
  }
  return fallbackUrl;
}

async function startServer() {
  const app = express();

  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    res.header('Access-Control-Allow-Origin', origin || '*');
    if (origin) {
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'arttrack-studio-api' });
  });

  app.get('/api/artists', async (req: Request, res: Response) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2) {
      res.json({ artists: [] });
      return;
    }

    try {
      const encoded = encodeURIComponent(query);
      const [artistRes, songRes] = await Promise.all([
        fetch(`https://itunes.apple.com/search?term=${encoded}&entity=musicArtist&limit=6`, {
          signal: AbortSignal.timeout(2500),
        }),
        fetch(`https://itunes.apple.com/search?term=${encoded}&entity=song&limit=12`, {
          signal: AbortSignal.timeout(2500),
        }),
      ]);

      const artistJson = artistRes.ok
        ? ((await artistRes.json()) as {
            results?: Array<{
              artistId?: number;
              artistName?: string;
              primaryGenreName?: string;
            }>;
          })
        : { results: [] };

      const songJson = songRes.ok
        ? ((await songRes.json()) as {
            results?: Array<{
              artistId?: number;
              artistName?: string;
              collectionName?: string;
              primaryGenreName?: string;
              artworkUrl100?: string;
            }>;
          })
        : { results: [] };

      const byNormalizedName = new Map<
        string,
        {
          id: string;
          name: string;
          genre: string;
          sampleAlbum: string | null;
          artworkUrl: string | null;
          score: number;
        }
      >();

      const qLower = query.toLowerCase();
      const scoreName = (name: string, base: number) => {
        const lower = name.toLowerCase();
        if (lower === qLower) return base + 40;
        if (lower.startsWith(qLower)) return base + 25;
        if (lower.includes(qLower)) return base + 10;
        return base;
      };

      for (const a of artistJson.results ?? []) {
        if (!a.artistName) continue;
        const key = a.artistName.trim().toLowerCase();
        if (!byNormalizedName.has(key)) {
          byNormalizedName.set(key, {
            id: String(a.artistId ?? key),
            name: a.artistName.trim(),
            genre: a.primaryGenreName || 'Artista',
            sampleAlbum: null,
            artworkUrl: null,
            score: scoreName(a.artistName, 50),
          });
        }
      }

      for (const s of songJson.results ?? []) {
        if (!s.artistName) continue;
        const key = s.artistName.trim().toLowerCase();
        const artwork = s.artworkUrl100
          ? s.artworkUrl100.replace('100x100bb', '200x200bb')
          : null;
        const existing = byNormalizedName.get(key);
        if (existing) {
          if (!existing.artworkUrl && artwork) existing.artworkUrl = artwork;
          if (!existing.sampleAlbum && s.collectionName) existing.sampleAlbum = s.collectionName;
          if (existing.genre === 'Artista' && s.primaryGenreName) {
            existing.genre = s.primaryGenreName;
          }
          existing.score += 5;
        } else {
          byNormalizedName.set(key, {
            id: String(s.artistId ?? key),
            name: s.artistName.trim(),
            genre: s.primaryGenreName || 'Artista',
            sampleAlbum: s.collectionName ?? null,
            artworkUrl: artwork,
            score: scoreName(s.artistName, 20),
          });
        }
      }

      const artists = Array.from(byNormalizedName.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(({ id, name, genre, sampleAlbum, artworkUrl }) => ({
          id,
          name,
          genre,
          sampleAlbum,
          artworkUrl,
        }));

      res.json({ artists });
    } catch {
      res.json({ artists: [] });
    }
  });

  app.post('/api/curate', async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        artist: explicitArtist,
        trackCount = 12,
        strictTopicOnly = true,
        excludeLive = true,
        excludeRemixes = true,
        excludeTitles = [],
        batchMode = false,
      } = req.body as {
        prompt?: string;
        artist?: string;
        trackCount?: number;
        strictTopicOnly?: boolean;
        excludeLive?: boolean;
        excludeRemixes?: boolean;
        excludeTitles?: string[];
        batchMode?: boolean;
      };

      if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 2) {
        res.status(400).json({ error: 'Escribe una petición musical válida para la IA.' });
        return;
      }

      const requestedTarget = Math.min(Math.max(Number(trackCount) || 12, 3), 100);
      const targetArtist = extractArtistFromPrompt(prompt, explicitArtist);
      const ai = getGeminiClient();

      const seenSongKeys = new Set<string>(
        (Array.isArray(excludeTitles) ? excludeTitles : [])
          .map((t) => normalizeSongKey(String(t)))
          .filter(Boolean)
      );
      const excludedOriginalTitles: string[] = Array.isArray(excludeTitles)
        ? excludeTitles.map((t) => String(t))
        : [];
      const seenVideoIds = new Set<string>();
      const acceptedTracks: ResolvedCuratedTrack[] = [];
      const attemptedTitles: string[] = [];

      let playlistTitle = `Mejores éxitos de ${targetArtist} · Solo ArtTracks`;
      let resolvedArtistName = targetArtist;
      let curationNote = `Selección de estudio verificada en el canal oficial de ${targetArtist} con portada estática.`;

      let itunesCatalogPromise: Promise<GeminiTrackItem[]> | null = null;
      const getItunesCatalog = () => {
        if (!itunesCatalogPromise) {
          itunesCatalogPromise = fetchItunesArtistCatalog(targetArtist, excludeLive, excludeRemixes);
        }
        return itunesCatalogPromise;
      };

      const startTime = Date.now();
      const maxRounds = batchMode ? 1 : 5;
      const timeBudgetMs = batchMode ? 24000 : 45000;
      let emptyRounds = 0;

      for (let round = 1; round <= maxRounds; round++) {
        if (acceptedTracks.length >= requestedTarget) break;
        if (round > 1 && Date.now() - startTime > timeBudgetMs) break;

        const remaining = requestedTarget - acceptedTracks.length;
        const geminiAskCount = Math.min(Math.max(remaining + 6, 16), 30);

        // On follow-up guardrail rounds for a specific artist, pull from the pre-fetched studio catalog
        // first to avoid 10s+ Gemini latencies and upstream Cloud Run proxy timeouts.
        const isFollowUpBatch = excludedOriginalTitles.length > 0 && !isMixedArtistTarget(targetArtist);
        let skipGeminiThisRound = false;
        if (isFollowUpBatch) {
          const preCatalog = await getItunesCatalog();
          const unusedCount = preCatalog.filter((c) => {
            const k = normalizeSongKey(c.title);
            return k && !seenSongKeys.has(k);
          }).length;
          if (unusedCount >= remaining) {
            skipGeminiThisRound = true;
          }
        }

        let geminiBatch: GeminiPlaylistResponse | null = null;
        if (!skipGeminiThisRound) {
          try {
            geminiBatch = await generateCandidateBatchWithGemini(
              ai,
              prompt.trim(),
              targetArtist,
              geminiAskCount,
              excludedOriginalTitles,
              excludeLive,
              excludeRemixes
            );
          } catch (geminiErr: unknown) {
            if (!isMixedArtistTarget(targetArtist)) {
              console.warn('Gemini 503/timeout, using official studio discography fallback for:', targetArtist);
              if (round === 1) {
                curationNote = `Mejores éxitos de ${targetArtist} ordenados por popularidad oficial y verificados en su canal de ArtTracks (sin videoclips ni covers).`;
              }
            } else {
              throw geminiErr;
            }
          }
        }

        if (round === 1 && geminiBatch) {
          if (geminiBatch.playlistTitle) playlistTitle = geminiBatch.playlistTitle;
          if (geminiBatch.artist) resolvedArtistName = geminiBatch.artist;
          if (geminiBatch.curationNote) curationNote = geminiBatch.curationNote;
        }

        const effectiveTargetArtist = isMixedArtistTarget(targetArtist)
          ? resolvedArtistName
          : targetArtist;

        const roundCandidates: GeminiTrackItem[] = [];
        for (const t of geminiBatch?.tracks ?? []) {
          if (!t?.title) continue;
          const key = normalizeSongKey(t.title);
          if (!key || seenSongKeys.has(key)) continue;

          if (
            !isMixedArtistTarget(effectiveTargetArtist) &&
            t.artist &&
            !isSingleArtistMatch(t.artist, effectiveTargetArtist)
          ) {
            continue;
          }

          seenSongKeys.add(key);
          excludedOriginalTitles.push(t.title);
          attemptedTitles.push(t.title);
          roundCandidates.push({
            ...t,
            artist: isMixedArtistTarget(effectiveTargetArtist)
              ? t.artist
              : effectiveTargetArtist,
          });
        }

        // Supplement (or fulfill follow-up batches / Gemini 503s) from real popularity-ranked studio catalog
        if (roundCandidates.length < remaining && !isMixedArtistTarget(effectiveTargetArtist)) {
          const catalog = await getItunesCatalog();
          for (const catTrack of catalog) {
            if (roundCandidates.length >= remaining + 6) break;
            const key = normalizeSongKey(catTrack.title);
            if (!key || seenSongKeys.has(key)) continue;
            seenSongKeys.add(key);
            excludedOriginalTitles.push(catTrack.title);
            attemptedTitles.push(catTrack.title);
            roundCandidates.push(catTrack);
          }
        }

        if (roundCandidates.length === 0) {
          emptyRounds++;
          if (emptyRounds >= 2) break;
          continue;
        }

        const resolvedBatch = new Array<ResolvedCuratedTrack | null>(roundCandidates.length).fill(
          null
        );
        const concurrency = 15;
        let cursor = 0;

        const worker = async () => {
          while (cursor < roundCandidates.length) {
            const idx = cursor++;
            const track = roundCandidates[idx];
            const [ytResult, itunesResult] = await Promise.all([
              resolveYouTubeArtTrack(
                track.artist,
                track.title,
                track.album,
                effectiveTargetArtist,
                excludeLive,
                excludeRemixes,
                strictTopicOnly
              ),
              fetchItunesMetadata(track.artist, track.title, effectiveTargetArtist),
            ]);

            if (!ytResult.videoId) {
              continue;
            }
            if (strictTopicOnly && ytResult.verificationStatus !== 'verified_arttrack') {
              continue;
            }

            resolvedBatch[idx] = {
              id: `${Date.now()}-${round}-${idx}-${normalizeSongKey(track.title).replace(/\s+/g, '-')}`,
              order: 0,
              title: track.title,
              artist: track.artist,
              album: itunesResult.albumName || track.album,
              year: itunesResult.releaseYear || track.year,
              reason: track.reason,
              artTrackQuery: track.artTrackQuery,
              videoId: ytResult.videoId,
              watchUrl: `https://www.youtube.com/watch?v=${ytResult.videoId}`,
              channelName: ytResult.channelName,
              isTopicChannel: ytResult.isTopicChannel,
              hasProvidedBySnippet: ytResult.hasProvidedBySnippet,
              verificationStatus: ytResult.verificationStatus,
              verificationNote: ytResult.verificationNote,
              durationText: itunesResult.durationText || ytResult.durationText || '03:45',
              artworkUrl: itunesResult.artworkUrl || ytResult.thumbnailUrl || null,
              previewUrl: itunesResult.previewUrl,
            };
          }
        };

        await Promise.all(
          Array.from({ length: Math.min(concurrency, roundCandidates.length) }, () => worker())
        );

        let addedThisRound = 0;
        for (const item of resolvedBatch) {
          if (!item || !item.videoId) continue;
          if (seenVideoIds.has(item.videoId)) continue;
          if (acceptedTracks.length >= requestedTarget) break;

          seenVideoIds.add(item.videoId);
          item.order = acceptedTracks.length + 1;
          acceptedTracks.push(item);
          addedThisRound++;
        }

        if (addedThisRound === 0) {
          emptyRounds++;
          if (emptyRounds >= 2) break;
        } else {
          emptyRounds = 0;
        }
      }

      const resolvedIds = acceptedTracks
        .map((t) => t.videoId)
        .filter((id): id is string => Boolean(id));

      const verifiedCount = acceptedTracks.filter(
        (t) => t.verificationStatus === 'verified_arttrack'
      ).length;

      const youtubeMusicUrls =
        !batchMode && resolvedIds.length > 0
          ? await Promise.all(
              Array.from({ length: Math.ceil(resolvedIds.length / 50) }, (_, i) =>
                resolveYouTubeMusicQueueUrl(resolvedIds.slice(i * 50, (i + 1) * 50))
              )
            )
          : undefined;

      res.json({
        playlistTitle,
        artist: resolvedArtistName,
        curationNote,
        prompt: prompt.trim(),
        strictTopicOnly,
        excludeLive,
        excludeRemixes,
        tracks: acceptedTracks,
        youtubeQueueUrl:
          youtubeMusicUrls?.[0] ??
          (resolvedIds.length > 0
            ? `https://www.youtube.com/watch_videos?video_ids=${resolvedIds.slice(0, 50).join(',')}`
            : null),
        youtubeMusicUrls,
        verifiedCount,
        attemptedTitles,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Error inesperado al curar la playlist.';
      console.error('Error in /api/curate:', err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ytm-queue', async (req: Request, res: Response) => {
    try {
      const { videoIds = [] } = req.body as { videoIds?: string[] };
      const clean = (Array.isArray(videoIds) ? videoIds : []).filter(
        (id): id is string => typeof id === 'string' && id.trim().length > 0
      );
      if (clean.length === 0) {
        res.json({ urls: [] });
        return;
      }
      const chunks: string[][] = [];
      for (let i = 0; i < clean.length; i += 50) {
        chunks.push(clean.slice(i, i + 50));
      }
      const urls = await Promise.all(chunks.map((chunk) => resolveYouTubeMusicQueueUrl(chunk)));
      res.json({ urls });
    } catch {
      res.json({ urls: [] });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ArtTrack Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
