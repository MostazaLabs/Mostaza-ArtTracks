import JSZip from 'jszip';

function buildArtTrackIco(): Uint8Array {
  const size = 32;
  const headerSize = 6;
  const entrySize = 16;
  const bmpHeaderSize = 40;
  const xorSize = size * size * 4;
  const andRowBytes = 4; // 32 pixels = 4 bytes per row (already 32-bit aligned)
  const andSize = size * andRowBytes;
  const totalSize = headerSize + entrySize + bmpHeaderSize + xorSize + andSize;

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type 1 = ICO
  view.setUint16(4, 1, true); // 1 image

  // ICONDIRENTRY
  buf[6] = size; // width
  buf[7] = size; // height
  buf[8] = 0; // palette colors
  buf[9] = 0; // reserved
  view.setUint16(10, 1, true); // planes
  view.setUint16(12, 32, true); // bpp
  view.setUint32(14, bmpHeaderSize + xorSize + andSize, true); // bytesInRes
  view.setUint32(18, headerSize + entrySize, true); // imageOffset

  // BITMAPINFOHEADER
  const hOff = headerSize + entrySize;
  view.setUint32(hOff + 0, bmpHeaderSize, true);
  view.setInt32(hOff + 4, size, true);
  view.setInt32(hOff + 8, size * 2, true); // height * 2 (XOR + AND)
  view.setUint16(hOff + 12, 1, true); // planes
  view.setUint16(hOff + 14, 32, true); // bpp
  view.setUint32(hOff + 16, 0, true); // BI_RGB
  view.setUint32(hOff + 20, xorSize + andSize, true);

  // Draw 32x32 rounded dark vinyl emblem with #E5482B terracotta label
  const xorOff = hOff + bmpHeaderSize;
  const andOff = xorOff + xorSize;
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;

  for (let y = 0; y < size; y++) {
    const bmpY = size - 1 - y; // BMP pixels are bottom-up
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded square outer boundary
      const ax = Math.max(Math.abs(dx) - 10.5, 0);
      const ay = Math.max(Math.abs(dy) - 10.5, 0);
      const cornerDist = Math.sqrt(ax * ax + ay * ay);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      if (cornerDist <= 4.5) {
        a = cornerDist > 3.6 ? Math.round(255 * Math.max(0, (4.5 - cornerDist) / 0.9)) : 255;
        // Dark slate background #0B0D10
        r = 11;
        g = 13;
        b = 16;

        if (dist <= 11.8) {
          // Vinyl body #1B2028 with subtle groove rings
          const groove = Math.sin(dist * 2.4) > 0.35 ? 6 : 0;
          r = 24 + groove;
          g = 28 + groove;
          b = 36 + groove;
        }
        if (dist <= 5.4 && dist > 1.7) {
          // Terracotta label #E5482B
          r = 229;
          g = 72;
          b = 43;
        }
        if (dist <= 1.7) {
          // Center spindle hole #F3F4F6
          r = 243;
          g = 244;
          b = 246;
        }
      }

      const pOff = xorOff + (bmpY * size + x) * 4;
      buf[pOff + 0] = b;
      buf[pOff + 1] = g;
      buf[pOff + 2] = r;
      buf[pOff + 3] = a;

      if (a === 0) {
        const maskByte = andOff + bmpY * andRowBytes + (x >> 3);
        buf[maskByte] |= 1 << (7 - (x & 7));
      }
    }
  }

  return buf;
}

function buildLocalServerMjs(): string {
  return `import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\\r?\\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore .env read errors
  }
}

loadEnvFile();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const TAILSCALE_ALIAS = (process.env.TAILSCALE_HOSTNAME || 'MostazaArtTracks').trim() || 'MostazaArtTracks';
const HEADLESS = process.argv.includes('--headless');

// Techo recomendado para equipo doméstico (Core 5 210H, 16 GB RAM, IP residencial):
// 6 usuarios activos simultáneos y máximo 3 búsquedas pesadas en paralelo (con cola automática).
const MAX_ACTIVE_USERS = Math.min(Math.max(Number(process.env.MAX_ACTIVE_USERS) || 6, 1), 20);
const MAX_PARALLEL_CURATIONS = Math.min(Math.max(Number(process.env.MAX_PARALLEL_CURATIONS) || 3, 1), 10);
const MAX_CURATION_QUEUE = 8;
const SESSION_TTL_MS = 3 * 60 * 1000;

const COVER_TRIBUTE_KEYWORDS = [
  'tribute', 'tributo', 'cover', 'karaoke', 'instrumental', 'lullaby', 'nanas',
  'reimagined', 'made famous', 'originally performed', 'in the style of',
  'al estilo de', 'piano version', 'acoustic cover', 'guitar cover', 'drum cover',
  'bass cover', 'vocal cover', 'parody', 'parodia', '8-bit', '8 bit',
  'music box', 'string quartet', 'orchestral version', 'vitamin string',
  'hit crew', 'rockabye', 'nightcore', 'slowed', 'sped up'
];

const VIDEO_KEYWORDS = [
  'official video', 'official music video', 'video oficial', 'videoclip',
  'music video', 'lyric video', 'lyrics video', 'con letra', 'mv)', '[mv]',
  'visualizer', 'official visual'
];

const LIVE_KEYWORDS = [
  '(live', '[live', 'live at', 'live in', 'live from', 'en vivo', 'directo',
  'concierto', 'concert', 'unplugged', 'mtv unplugged', 'rock in rio',
  'wembley', 'budokan', 'sun city'
];

// --- Concurrency & Session Guards ---
const activeSessions = new Map();

function isLoopbackAddr(addr) {
  const ip = String(addr || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function parseCookies(cookieHeader) {
  const out = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function pruneSessions(now) {
  for (const [sid, ts] of activeSessions.entries()) {
    if (now - ts > SESSION_TTL_MS) {
      activeSessions.delete(sid);
    }
  }
}

function checkVisitorAdmission(req, res) {
  const now = Date.now();
  pruneSessions(now);

  const cookies = parseCookies(req.headers.cookie);
  const headerSid = String(req.headers['x-arttrack-session'] || '').trim();
  const existingSid = headerSid || cookies.arttrack_sid || '';
  const isOwnerLocalhost = isLoopbackAddr(req.socket?.remoteAddress);

  if (existingSid && activeSessions.has(existingSid)) {
    activeSessions.set(existingSid, now);
    return { allowed: true, sid: existingSid, isNewCookie: false };
  }

  // Reserve owner access on localhost; enforce MAX_ACTIVE_USERS for remote/Tailscale visitors
  if (!isOwnerLocalhost && activeSessions.size >= MAX_ACTIVE_USERS) {
    return { allowed: false, sid: null, isNewCookie: false };
  }

  const sid = existingSid || crypto.randomUUID();
  activeSessions.set(sid, now);
  return { allowed: true, sid, isNewCookie: !cookies.arttrack_sid };
}

let runningCurations = 0;
const curationWaiters = [];

async function runWithCurationSlot(taskFn) {
  if (runningCurations >= MAX_PARALLEL_CURATIONS) {
    if (curationWaiters.length >= MAX_CURATION_QUEUE) {
      const err = new Error('El servidor está procesando varias playlists a la vez. Espera unos segundos e inténtalo de nuevo.');
      err.statusCode = 503;
      throw err;
    }
    await new Promise((resolve) => curationWaiters.push(resolve));
  }
  runningCurations++;
  try {
    return await taskFn();
  } finally {
    runningCurations--;
    const next = curationWaiters.shift();
    if (next) next();
  }
}

function isTailscaleIpv4(ip) {
  const parts = String(ip || '').split('.').map(Number);
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const tailscaleUrls = [];
  const lanUrls = [];

  for (const entries of Object.values(interfaces)) {
    for (const info of entries || []) {
      if (info.family !== 'IPv4' || info.internal) continue;
      const url = 'http://' + info.address + ':' + PORT;
      if (isTailscaleIpv4(info.address)) {
        tailscaleUrls.push(url);
      } else {
        lanUrls.push(url);
      }
    }
  }

  return {
    port: PORT,
    hostname: TAILSCALE_ALIAS,
    tailscaleHostnameUrl: tailscaleUrls.length > 0 ? 'http://' + TAILSCALE_ALIAS + ':' + PORT : null,
    tailscaleUrls,
    lanUrls,
    localUrl: 'http://localhost:' + PORT,
    activeUsers: activeSessions.size,
    maxActiveUsers: MAX_ACTIVE_USERS,
    maxParallelCurations: MAX_PARALLEL_CURATIONS,
  };
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\\s]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}

function normalizeSongKey(title) {
  return normalizeText(
    String(title || '')
      .replace(/\\([^)]*(remaster|version|edit|mono|stereo|deluxe|anniversary|mix)[^)]*\\)/gi, '')
      .replace(/\\[[^\\]]*(remaster|version|edit|mono|stereo|deluxe|anniversary|mix)[^\\]]*\\]/gi, '')
      .replace(/\\s+-\\s+(remaster|single|album|radio|20\\d{2}|19\\d{2}).*$/i, '')
  );
}

function isMixedArtistTarget(targetArtist) {
  const n = normalizeText(targetArtist);
  return !n || n === 'varios artistas' || n === 'various artists' || n === 'varios';
}

function extractArtistFromPrompt(prompt, explicitArtist) {
  if (explicitArtist && explicitArtist.trim()) return explicitArtist.trim();
  return String(prompt || '')
    .trim()
    .replace(/^haz\\s+una\\s+playlist\\s+con\\s+los\\s+mejores\\s+[eé]xitos\\s+de\\s+/i, '')
    .replace(/^los\\s+mejores\\s+[eé]xitos\\s+de\\s+/i, '')
    .trim();
}

function isSingleArtistMatch(candidateName, referenceArtist) {
  const normCandidate = normalizeText(candidateName);
  const normRef = normalizeText(referenceArtist);
  if (!normCandidate || !normRef) return false;
  if (normCandidate === normRef) return true;

  for (const kw of COVER_TRIBUTE_KEYWORDS) {
    if (normCandidate.includes(kw) && !normRef.includes(kw)) return false;
  }

  if (normRef.length >= 3) {
    if (
      normCandidate.startsWith(normRef + ' and ') ||
      normCandidate.startsWith(normRef + ' feat') ||
      normCandidate.startsWith(normRef + ' ft ') ||
      normCandidate.startsWith(normRef + ' with ') ||
      normCandidate.startsWith(normRef + ' x ') ||
      normRef.startsWith(normCandidate + ' and ') ||
      normRef.startsWith(normCandidate + ' feat') ||
      normRef.startsWith(normCandidate + ' ft ') ||
      normRef.startsWith(normCandidate + ' with ')
    ) {
      return true;
    }
  }

  const stripThe = (s) => s.replace(/^the\\s+/, '');
  if (stripThe(normCandidate) === stripThe(normRef)) return true;
  return normCandidate.replace(/\\s+/g, '') === normRef.replace(/\\s+/g, '');
}

function extractChannelBase(channelName) {
  return normalizeText(
    String(channelName || '')
      .replace(/\\s*-\\s*topic$/i, '')
      .replace(/\\s+topic$/i, '')
      .replace(/\\s+official$/i, '')
      .replace(/\\s+oficial$/i, '')
      .replace(/vevo$/i, '')
  );
}

function isOfficialArtistChannel(channelName, targetArtist, trackArtist) {
  if (!channelName) return false;
  const channelBase = extractChannelBase(channelName);
  if (!channelBase) return false;

  const mixed = isMixedArtistTarget(targetArtist);
  const primaryRef = mixed ? trackArtist : targetArtist;
  if (isSingleArtistMatch(channelBase, primaryRef)) return true;

  if (!mixed && trackArtist && isSingleArtistMatch(trackArtist, targetArtist)) {
    return isSingleArtistMatch(channelBase, trackArtist);
  }
  return false;
}

function titleMatchesTrack(videoTitle, trackTitle) {
  const normVideo = normalizeSongKey(videoTitle) || normalizeText(videoTitle);
  const normTrack = normalizeSongKey(trackTitle) || normalizeText(trackTitle);
  if (!normVideo || !normTrack) return false;
  if (normVideo.includes(normTrack) || normTrack.includes(normVideo)) return true;
  const words = normTrack.split(' ').filter((w) => w.length >= 2);
  if (words.length === 0) return false;
  const matched = words.filter((w) => normVideo.includes(w)).length;
  return matched / words.length >= 0.7;
}

function formatMillis(ms) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function extractYtInitialData(html) {
  const markers = ['var ytInitialData = ', 'window["ytInitialData"] = '];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = idx + marker.length;
    const endScript = html.indexOf(';</script>', start);
    if (endScript !== -1) {
      try {
        return JSON.parse(html.slice(start, endScript));
      } catch {
        // Fallback below
      }
    }
  }
  return null;
}

function extractSearchVideoRenderers(ytData) {
  const out = [];
  const contents =
    ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
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

async function queryYouTubeSearch(searchQuery) {
  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(searchQuery) + '&hl=en&gl=US';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
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

function pickBestCandidate(renderers, track, targetArtist, opts) {
  let best = null;
  let bestScore = -999;
  const tLower = (track.title || '').toLowerCase();
  const aLower = (targetArtist || '').toLowerCase();
  const normAlbum = normalizeText(track.album || '');
  const normTrackTitle = normalizeSongKey(track.title || '');

  for (const r of renderers.slice(0, 15)) {
    if (!r.videoId) continue;
    const videoTitle = (r.title?.runs || []).map((x) => x.text || '').join('');
    const vLower = videoTitle.toLowerCase();
    const channel = (r.ownerText?.runs || r.longBylineText?.runs || []).map((x) => x.text || '').join('');
    const cLower = channel.toLowerCase();
    const snippet = (r.detailedMetadataSnippets || [])
      .flatMap((s) => (s.snippetText?.runs || []).map((x) => x.text || ''))
      .join(' ');
    const sLower = snippet.toLowerCase();
    const combined = vLower + ' ' + sLower + ' ' + cLower;

    if (!isOfficialArtistChannel(channel, targetArtist, track.artist)) continue;
    if (COVER_TRIBUTE_KEYWORDS.some((kw) => combined.includes(kw) && !tLower.includes(kw) && !aLower.includes(kw))) continue;
    if (VIDEO_KEYWORDS.some((kw) => vLower.includes(kw) && !tLower.includes(kw))) continue;
    if (opts.excludeLive && (LIVE_KEYWORDS.some((kw) => (vLower.includes(kw) || sLower.includes(kw)) && !tLower.includes(kw)) || (/\\blive\\b/i.test(vLower) && !/\\blive\\b/i.test(tLower)))) continue;
    if (opts.excludeRemixes && (vLower.includes('remix') || vLower.includes('club mix')) && !tLower.includes('remix')) continue;
    if (!titleMatchesTrack(videoTitle, track.title)) continue;

    const isTopic = cLower.endsWith(' - topic') || cLower.endsWith(' topic');
    const hasProvidedBy = sLower.includes('provided to youtube') || sLower.includes('auto-generated by youtube');
    if (opts.strictTopicOnly && !isTopic && !hasProvidedBy) continue;

    let score = 0;
    if (isTopic) score += 75;
    if (hasProvidedBy) score += 55;
    if (normalizeSongKey(videoTitle) === normTrackTitle) score += 25;
    if (normAlbum && normAlbum.length >= 3 && normalizeText(snippet).includes(normAlbum)) score += 30;

    if (score > bestScore) {
      bestScore = score;
      const thumbs = r.thumbnail?.thumbnails || [];
      best = {
        videoId: r.videoId,
        channelName: channel || track.artist + ' - Topic',
        isTopicChannel: isTopic,
        hasProvidedBySnippet: hasProvidedBy,
        durationText: r.lengthText?.simpleText || null,
        thumbnailUrl: thumbs[thumbs.length - 1]?.url || null,
      };
    }
  }

  if (!best || bestScore < 20) return null;
  return best;
}

const ytTrackCache = new Map();

async function resolveYouTubeArtTrack(track, targetArtist, opts) {
  const ytKey = normalizeText(targetArtist) + '|' + normalizeSongKey(track.title) + '|' + opts.strictTopicOnly + '|' + opts.excludeLive + '|' + opts.excludeRemixes;
  const cached = ytTrackCache.get(ytKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const queryArtist = isMixedArtistTarget(targetArtist) ? track.artist : targetArtist;
  const r1 = await queryYouTubeSearch(queryArtist + ' ' + track.title + ' "Provided to YouTube by"');
  let best = pickBestCandidate(r1, track, targetArtist, opts);

  if (!best) {
    const r2 = await queryYouTubeSearch(queryArtist + ' ' + track.title + ' "' + queryArtist + ' - Topic"');
    best = pickBestCandidate(r2, track, targetArtist, opts);
  }

  if (best) {
    if (ytTrackCache.size > 1500) ytTrackCache.clear();
    ytTrackCache.set(ytKey, { value: best, expiresAt: Date.now() + 30 * 60 * 1000 });
  }
  return best;
}

async function fetchItunesCatalog(artist, excludeLive, excludeRemixes) {
  const encoded = encodeURIComponent(artist);
  const [songRes, artistRes] = await Promise.all([
    fetch('https://itunes.apple.com/search?term=' + encoded + '&entity=song&attribute=artistTerm&limit=200', {
      signal: AbortSignal.timeout(4500),
    }),
    fetch('https://itunes.apple.com/search?term=' + encoded + '&entity=musicArtist&limit=5', {
      signal: AbortSignal.timeout(3500),
    }),
  ]);

  const raw = [];
  if (songRes.ok) {
    const sd = await songRes.json();
    raw.push(...(sd.results || []));
  }

  if (artistRes.ok) {
    const ad = await artistRes.json();
    const match = (ad.results || []).find((a) => a.artistName && isSingleArtistMatch(a.artistName, artist));
    if (match?.artistId) {
      const albRes = await fetch('https://itunes.apple.com/lookup?id=' + match.artistId + '&entity=album&limit=45', {
        signal: AbortSignal.timeout(4000),
      });
      if (albRes.ok) {
        const albData = await albRes.json();
        const albumIds = (albData.results || [])
          .filter(
            (r) =>
              r.wrapperType === 'collection' &&
              r.collectionId &&
              !/\\b(live|en vivo|concert|concierto|unplugged|greatest|platinum|essential|collection|hits|remixes|anthology|box set)\\b/i.test(
                r.collectionName || ''
              )
          )
          .slice(0, 36)
          .map((r) => r.collectionId);

        const batches = [];
        if (albumIds.slice(0, 18).length > 0) batches.push(albumIds.slice(0, 18));
        if (albumIds.slice(18, 36).length > 0) batches.push(albumIds.slice(18, 36));

        const discResponses = await Promise.all(
          batches.map((b) =>
            fetch('https://itunes.apple.com/lookup?id=' + b.join(',') + '&entity=song', {
              signal: AbortSignal.timeout(4500),
            }).catch(() => null)
          )
        );
        for (const discRes of discResponses) {
          if (discRes && discRes.ok) {
            const discData = await discRes.json();
            for (const row of discData.results || []) {
              if (row.wrapperType === 'track') raw.push(row);
            }
          }
        }
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item.trackName || !item.artistName) continue;
    if (!isSingleArtistMatch(item.artistName, artist)) continue;
    const tLower = item.trackName.toLowerCase();
    const cLower = (item.collectionName || '').toLowerCase();
    if (COVER_TRIBUTE_KEYWORDS.some((kw) => (tLower.includes(kw) || cLower.includes(kw)) && !artist.toLowerCase().includes(kw))) continue;
    if (excludeLive && (LIVE_KEYWORDS.some((kw) => tLower.includes(kw) || cLower.includes(kw)) || /\\blive\\b/i.test(tLower))) continue;
    if (excludeRemixes && (tLower.includes('remix') || cLower.includes('remix'))) continue;

    const key = normalizeSongKey(item.trackName);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    out.push({
      title: item.trackName.trim(),
      artist,
      album: item.collectionName || 'Álbum oficial',
      year: item.releaseDate ? new Date(item.releaseDate).getUTCFullYear() : 2000,
      durationText: formatMillis(item.trackTimeMillis) || '03:45',
      artworkUrl: item.artworkUrl100 ? item.artworkUrl100.replace('100x100bb', '600x600bb') : null,
      previewUrl: item.previewUrl || null,
    });
  }
  return out;
}

async function fetchGeminiTopHits(artist, prompt, count) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
    try {
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(apiKey),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(8500),
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt + '. Devuelve ' + count + ' canciones originales de estudio de ' + artist + ' en JSON { "tracks": [{"title": "...", "album": "..."}] }' }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) continue;
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed.tracks) && parsed.tracks.length > 0) return parsed.tracks;
    } catch {
      // Fall back to next model or official catalog
    }
  }
  return null;
}

const catalogCache = new Map();

async function handleCurate(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

  const prompt = body.prompt || '';
  const targetArtist = extractArtistFromPrompt(prompt, body.artist);
  const requestedTarget = Math.min(Math.max(Number(body.trackCount) || 12, 3), 100);
  const strictTopicOnly = body.strictTopicOnly !== false;
  const excludeLive = body.excludeLive !== false;
  const excludeRemixes = body.excludeRemixes !== false;
  const excludeTitles = Array.isArray(body.excludeTitles) ? body.excludeTitles : [];

  const result = await runWithCurationSlot(async () => {
    const seenKeys = new Set(excludeTitles.map((t) => normalizeSongKey(t)).filter(Boolean));
    const cacheKey = normalizeText(targetArtist) + '|' + excludeLive + '|' + excludeRemixes;
    const cachedEntry = catalogCache.get(cacheKey);
    let catalog = cachedEntry && cachedEntry.expiresAt > Date.now() ? cachedEntry.items : null;
    if (!catalog) {
      catalog = await fetchItunesCatalog(targetArtist, excludeLive, excludeRemixes);
      if (catalog.length > 0) {
        catalogCache.set(cacheKey, { items: catalog, expiresAt: Date.now() + 10 * 60 * 1000 });
      }
    }

    const candidates = [];
    const attemptedTitles = [];

    if (excludeTitles.length === 0) {
      const aiTracks = await fetchGeminiTopHits(targetArtist, prompt, Math.min(requestedTarget + 8, 40));
      if (aiTracks) {
        for (const t of aiTracks) {
          if (!t?.title) continue;
          const k = normalizeSongKey(t.title);
          if (!k || seenKeys.has(k)) continue;
          seenKeys.add(k);
          attemptedTitles.push(t.title);
          const catMatch = catalog.find((c) => normalizeSongKey(c.title) === k);
          candidates.push({
            title: t.title,
            artist: targetArtist,
            album: catMatch?.album || t.album || 'Álbum oficial',
            year: catMatch?.year || 2000,
            durationText: catMatch?.durationText || '03:45',
            artworkUrl: catMatch?.artworkUrl || null,
            previewUrl: catMatch?.previewUrl || null,
          });
        }
      }
    }

    for (const cat of catalog) {
      if (candidates.length >= requestedTarget + 10) break;
      const k = normalizeSongKey(cat.title);
      if (!k || seenKeys.has(k)) continue;
      seenKeys.add(k);
      attemptedTitles.push(cat.title);
      candidates.push(cat);
    }

    const resolved = new Array(candidates.length).fill(null);
    let cursor = 0;

    async function worker() {
      while (cursor < candidates.length) {
        const idx = cursor++;
        const c = candidates[idx];
        const yt = await resolveYouTubeArtTrack(c, targetArtist, { strictTopicOnly, excludeLive, excludeRemixes });
        if (!yt) continue;
        resolved[idx] = {
          id: Date.now() + '-' + idx + '-' + normalizeSongKey(c.title).replace(/\\s+/g, '-'),
          title: c.title,
          artist: c.artist,
          album: c.album,
          year: c.year,
          videoId: yt.videoId,
          watchUrl: 'https://music.youtube.com/watch?v=' + yt.videoId,
          channelName: yt.channelName,
          durationText: c.durationText || yt.durationText || '03:45',
          artworkUrl: c.artworkUrl || yt.thumbnailUrl || null,
          previewUrl: c.previewUrl || null,
        };
      }
    }

    await Promise.all(Array.from({ length: Math.min(12, candidates.length) }, () => worker()));

    const tracks = resolved.filter(Boolean).slice(0, requestedTarget);
    return {
      playlistTitle: 'Mejores éxitos de ' + targetArtist + ' · Solo ArtTracks',
      artist: targetArtist,
      curationNote: 'ArtTracks oficiales verificados en el canal de ' + targetArtist + ' (portada estática 1:1).',
      tracks,
      attemptedTitles,
    };
  });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result));
}

async function resolveYtmQueueUrl(ids) {
  const clean = ids.filter(Boolean).slice(0, 50);
  const fallback = 'https://www.youtube.com/watch_videos?video_ids=' + clean.join(',');
  try {
    const res = await fetch(fallback, {
      redirect: 'manual',
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0.0.0 Safari/537.36',
        Cookie: 'SOCS=CAI',
      },
    });
    const loc = res.headers.get('location');
    if (loc) {
      const u = new URL(loc, 'https://www.youtube.com');
      const v = u.searchParams.get('v') || clean[0];
      const list = u.searchParams.get('list');
      if (list) return 'https://music.youtube.com/watch?v=' + encodeURIComponent(v) + '&list=' + encodeURIComponent(list);
    }
  } catch {
    // fallback
  }
  return fallback;
}

async function handleYtmQueue(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  const ids = Array.isArray(body.videoIds) ? body.videoIds.filter(Boolean) : [];
  const groups = [];
  for (let i = 0; i < ids.length; i += 50) groups.push(ids.slice(i, i + 50));
  const urls = await Promise.all(groups.map((g) => resolveYtmQueueUrl(g)));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ urls }));
}

async function handleArtists(urlObj, res) {
  const query = (urlObj.searchParams.get('q') || '').trim();
  if (query.length < 2) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ artists: [] }));
    return;
  }

  try {
    const encoded = encodeURIComponent(query);
    const [artistRes, songRes] = await Promise.all([
      fetch('https://itunes.apple.com/search?term=' + encoded + '&entity=musicArtist&limit=6', { signal: AbortSignal.timeout(2500) }),
      fetch('https://itunes.apple.com/search?term=' + encoded + '&entity=song&limit=12', { signal: AbortSignal.timeout(2500) }),
    ]);

    const artistJson = artistRes.ok ? await artistRes.json() : { results: [] };
    const songJson = songRes.ok ? await songRes.json() : { results: [] };
    const map = new Map();
    const qLower = query.toLowerCase();

    const scoreName = (name, base) => {
      const lower = name.toLowerCase();
      if (lower === qLower) return base + 40;
      if (lower.startsWith(qLower)) return base + 25;
      if (lower.includes(qLower)) return base + 10;
      return base;
    };

    for (const a of artistJson.results || []) {
      if (!a.artistName) continue;
      const key = a.artistName.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: String(a.artistId || key),
          name: a.artistName.trim(),
          genre: a.primaryGenreName || 'Artista',
          sampleAlbum: null,
          artworkUrl: null,
          score: scoreName(a.artistName, 50),
        });
      }
    }

    for (const s of songJson.results || []) {
      if (!s.artistName) continue;
      const key = s.artistName.trim().toLowerCase();
      const art = s.artworkUrl100 ? s.artworkUrl100.replace('100x100bb', '200x200bb') : null;
      const existing = map.get(key);
      if (existing) {
        if (!existing.artworkUrl && art) existing.artworkUrl = art;
        if (!existing.sampleAlbum && s.collectionName) existing.sampleAlbum = s.collectionName;
        if (existing.genre === 'Artista' && s.primaryGenreName) existing.genre = s.primaryGenreName;
        existing.score += 5;
      } else {
        map.set(key, {
          id: String(s.artistId || key),
          name: s.artistName.trim(),
          genre: s.primaryGenreName || 'Artista',
          sampleAlbum: s.collectionName || null,
          artworkUrl: art,
          score: scoreName(s.artistName, 20),
        });
      }
    }

    const artists = Array.from(map.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(({ id, name, genre, sampleAlbum, artworkUrl }) => ({ id, name, genre, sampleAlbum, artworkUrl }));

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ artists }));
  } catch {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ artists: [] }));
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url || '/', 'http://localhost:' + PORT);

    if (req.method === 'GET' && urlObj.pathname === '/api/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, activeUsers: activeSessions.size, maxActiveUsers: MAX_ACTIVE_USERS }));
      return;
    }

    if (req.method === 'POST' && urlObj.pathname === '/api/shutdown') {
      if (!isLoopbackAddr(req.socket?.remoteAddress)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Solo permitido desde este ordenador.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 120);
      return;
    }

    const admission = checkVisitorAdmission(req, res);
    if (!admission.allowed) {
      const msg = 'Aforo completo: actualmente hay ' + MAX_ACTIVE_USERS + ' personas usando Mostaza ArtTracks en este servidor. Inténtalo de nuevo en unos minutos.';
      if (urlObj.pathname.startsWith('/api/')) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: msg }));
      } else {
        res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><html lang="es"><body style="background:#0b0d10;color:#f3f4f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;"><div style="max-width:440px;background:#12151b;border:1px solid rgba(255,255,255,0.12);border-radius:12px;padding:24px;"><h2 style="margin-bottom:8px;">Servidor en capacidad máxima</h2><p style="color:#9ca3af;font-size:14px;">' + msg + '</p></div></body></html>');
      }
      return;
    }

    const extraHeaders = {};
    if (admission.isNewCookie && admission.sid) {
      extraHeaders['Set-Cookie'] = 'arttrack_sid=' + encodeURIComponent(admission.sid) + '; Path=/; SameSite=Lax';
    }

    if (req.method === 'GET' && urlObj.pathname === '/api/network-info') {
      res.writeHead(200, { ...extraHeaders, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(getNetworkInfo()));
      return;
    }
    if (req.method === 'GET' && urlObj.pathname === '/api/artists') {
      await handleArtists(urlObj, res);
      return;
    }
    if (req.method === 'POST' && urlObj.pathname === '/api/curate') {
      await handleCurate(req, res);
      return;
    }
    if (req.method === 'POST' && urlObj.pathname === '/api/ytm-queue') {
      await handleYtmQueue(req, res);
      return;
    }

    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { ...extraHeaders, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (err) {
    const code = err?.statusCode || 500;
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err?.message || 'Error interno' }));
  }
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.log('Mostaza ArtTracks ya estaba ejecutándose en el puerto ' + PORT + '.');
    process.exit(0);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const net = getNetworkInfo();
  console.log('\\nMostaza ArtTracks (MostazaLabs) ejecutándose en: ' + net.localUrl);
  if (net.tailscaleUrls.length > 0) {
    console.log('Acceso móvil por Tailscale: ' + (net.tailscaleHostnameUrl || net.tailscaleUrls[0]) + '  (' + net.tailscaleUrls[0] + ')');
  }
  console.log('Límite de seguridad: máximo ' + MAX_ACTIVE_USERS + ' usuarios simultáneos · ' + MAX_PARALLEL_CURATIONS + ' curaciones en paralelo.');
  if (!HEADLESS) {
    const cmd = process.platform === 'win32' ? 'start "" "' + net.localUrl + '"' : process.platform === 'darwin' ? 'open "' + net.localUrl + '"' : 'xdg-open "' + net.localUrl + '"';
    exec(cmd, () => {});
  }
});
`;
}

function buildLocalLauncherMjs(): string {
  return `import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, exec } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = 'http://127.0.0.1:' + PORT;
const OPEN_URL = 'http://localhost:' + PORT;

function openBrowser() {
  const cmd =
    process.platform === 'win32'
      ? 'start "" "' + OPEN_URL + '"'
      : process.platform === 'darwin'
      ? 'open "' + OPEN_URL + '"'
      : 'xdg-open "' + OPEN_URL + '"';
  exec(cmd, () => {});
}

async function isServerAlive() {
  try {
    const res = await fetch(BASE_URL + '/api/health', { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (await isServerAlive()) {
    openBrowser();
    return;
  }

  const logFd = fs.openSync(path.join(__dirname, 'arttrack.log'), 'a');
  const child = spawn(process.execPath, [path.join(__dirname, 'server.mjs'), '--headless'], {
    cwd: __dirname,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await isServerAlive()) {
      openBrowser();
      return;
    }
  }
  openBrowser();
}

main().catch(() => {
  openBrowser();
});
`;
}

function buildLocalIndexHtml(): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mostaza ArtTracks · MostazaLabs</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: #0b0d10;
        color: #f3f4f6;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.5;
        min-height: 100vh;
      }
      .shell { max-width: 1120px; margin: 0 auto; padding: 24px 16px 60px; }
      header {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
        padding-bottom: 16px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.1);
      }
      .brand { font-weight: 700; font-size: 18px; letter-spacing: -0.01em; }
      .tailscale-bar {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
        margin-bottom: 18px; padding: 10px 14px; border-radius: 10px;
        background: #12151b; border: 1px solid rgba(255,255,255,0.1);
        font-size: 12.5px; color: #d1d5db;
      }
      .tailscale-url { font-family: monospace; color: #f3f4f6; word-break: break-all; }
      .grid { display: grid; grid-template-columns: 360px 1fr; gap: 20px; align-items: start; }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
      .card {
        background: #12151b; border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px; padding: 18px;
      }
      .lead { font-size: 13.5px; font-weight: 600; color: #d1d5db; margin-bottom: 8px; }
      input[type="search"] {
        width: 100%; background: #0b0d10; border: 1px solid rgba(255,255,255,0.14);
        border-radius: 9px; padding: 12px 13px; color: #f3f4f6; font-size: 15px;
      }
      input[type="search"]:focus { outline: none; border-color: #e5482b; }
      .suggestions {
        margin-top: 8px; background: #0b0d10; border: 1px solid rgba(255,255,255,0.12);
        border-radius: 9px; max-height: 260px; overflow-y: auto;
      }
      .artist-opt, .selected-card {
        width: 100%; display: flex; align-items: center; gap: 10px; padding: 10px 11px; min-height: 48px;
        background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.06);
        color: #f3f4f6; text-align: left; cursor: pointer;
      }
      .artist-opt:last-child { border-bottom: none; }
      .artist-opt:hover { background: rgba(255,255,255,0.05); }
      .selected-card {
        background: #0b0d10; border: 1px solid rgba(229,72,43,0.55); border-radius: 9px; cursor: default;
      }
      .thumb { width: 40px; height: 40px; border-radius: 5px; object-fit: cover; background: #1f242f; flex-shrink: 0; }
      .meta { flex: 1; min-width: 0; }
      .meta-title { font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .meta-sub { font-size: 11.5px; color: #9ca3af; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
      .ctrl {
        display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 44px;
        background: #161921; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 8px 10px; font-size: 12.5px; color: #d1d5db; cursor: pointer;
      }
      select { background: transparent; border: none; color: #f3f4f6; font-weight: 700; cursor: pointer; font-size: 13px; }
      select option { background: #12151b; }
      input[type="checkbox"] { accent-color: #e5482b; width: 16px; height: 16px; }
      .btn-primary {
        width: 100%; margin-top: 12px; background: #e5482b; color: #fff; border: none; min-height: 44px;
        border-radius: 9px; padding: 11px 16px; font-weight: 600; font-size: 13.5px; cursor: pointer;
      }
      .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-sec {
        background: #181c24; color: #f3f4f6; border: 1px solid rgba(255,255,255,0.14); min-height: 38px;
        border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
      }
      .progress {
        margin-bottom: 14px; padding: 10px 14px; border-radius: 8px;
        background: rgba(229,72,43,0.12); border: 1px solid rgba(229,72,43,0.35);
        font-size: 12.5px; color: #fca5a5;
      }
      .wb-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      .wb-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .track-list { list-style: none; margin-top: 10px; }
      .track-row {
        display: flex; align-items: center; gap: 10px; padding: 10px 4px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      .track-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .ch-label { font-size: 11.5px; color: #4ade80; white-space: nowrap; }
      @media (max-width: 600px) {
        .track-row { flex-wrap: wrap; }
        .track-right { width: 100%; justify-content: space-between; padding-left: 36px; }
      }
      .idx { width: 26px; text-align: right; font-family: monospace; font-size: 12px; color: #6b7280; flex-shrink: 0; }
      .hidden { display: none !important; }
    </style>
  </head>
  <body>
    <div class="shell">
      <header>
        <div class="brand">Mostaza ArtTracks</div>
        <span style="font-size:12px;color:#9ca3af;">MostazaLabs · Hasta 6 usuarios simultáneos</span>
      </header>

      <div id="tailscaleBar" class="tailscale-bar hidden">
        <div>
          <span style="color:#9ca3af;">Acceso móvil por Tailscale: </span>
          <span id="tailscaleUrl" class="tailscale-url"></span>
        </div>
        <button id="copyTsBtn" type="button" class="btn-sec">Copiar URL móvil</button>
      </div>

      <div class="grid">
        <form id="curateForm" class="card">
          <p class="lead">Haz una playlist con los mejores éxitos de...</p>

          <div id="searchWrap">
            <input id="artistInput" type="search" placeholder="Buscar artista o banda (ej. Queen, Soda Stereo)..." autocomplete="off" />
            <div id="suggestions" class="suggestions hidden"></div>
          </div>

          <div id="selectedCard" class="selected-card hidden">
            <img id="selImg" class="thumb" alt="" />
            <div class="meta">
              <div id="selName" class="meta-title"></div>
              <div id="selGenre" class="meta-sub"></div>
            </div>
            <button id="clearSel" type="button" class="btn-sec" style="padding:4px 10px;">×</button>
          </div>

          <div class="controls">
            <label class="ctrl">
              <span>Pistas</span>
              <select id="trackCount">
                <option value="8">8</option>
                <option value="12" selected>12</option>
                <option value="16">16</option>
                <option value="20">20</option>
                <option value="30">30</option>
                <option value="50">50</option>
                <option value="75">75</option>
                <option value="100">100</option>
              </select>
            </label>
            <label class="ctrl"><span>Solo "- Topic"</span><input id="strictTopic" type="checkbox" checked /></label>
            <label class="ctrl"><span>Sin directos</span><input id="excludeLive" type="checkbox" checked /></label>
            <label class="ctrl"><span>Sin remixes</span><input id="excludeRemixes" type="checkbox" checked /></label>
          </div>

          <button id="submitBtn" type="submit" class="btn-primary">Generar Playlist ArtTrack</button>
        </form>

        <div class="card">
          <div id="progressBox" class="progress hidden"></div>
          <div id="emptyState" style="padding:26px 8px;color:#9ca3af;font-size:13.5px;">
            Busca cualquier grupo o artista y elige una sugerencia. El servidor local verificará hasta 100 pistas exclusivas del canal oficial del artista con portada estática (cero videoclips, cero covers).
          </div>
          <div id="resultsBox" class="hidden">
            <div class="wb-head">
              <div>
                <h2 id="plTitle" style="font-size:18px;"></h2>
                <p id="plMeta" style="font-size:12px;color:#9ca3af;margin-top:2px;"></p>
              </div>
              <div id="wbActions" class="wb-actions"></div>
            </div>
            <ul id="trackList" class="track-list"></ul>
          </div>
        </div>
      </div>
      <footer style="margin-top:32px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;font-size:12px;color:#6b7280;">
        <span>Mostaza ArtTracks · MostazaLabs</span>
        <span>MostazaLabs: División comercial de la Asociación Pirata Ibérica</span>
      </footer>
    </div>

    <script>
      const sessionId = sessionStorage.getItem('arttrack_sid') || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
      sessionStorage.setItem('arttrack_sid', sessionId);
      const apiHeaders = { 'Content-Type': 'application/json', 'x-arttrack-session': sessionId };

      const tailscaleBar = document.getElementById('tailscaleBar');
      const tailscaleUrlEl = document.getElementById('tailscaleUrl');
      const copyTsBtn = document.getElementById('copyTsBtn');

      fetch('/api/network-info', { headers: { 'x-arttrack-session': sessionId } })
        .then((r) => (r.ok ? r.json() : null))
        .then((info) => {
          if (!info) return;
          const primaryMobileUrl = info.tailscaleHostnameUrl || info.tailscaleUrls?.[0];
          const fallbackIpUrl = info.tailscaleUrls?.[0];
          if (primaryMobileUrl) {
            tailscaleUrlEl.textContent = fallbackIpUrl && fallbackIpUrl !== primaryMobileUrl
              ? primaryMobileUrl + ' (' + fallbackIpUrl + ')'
              : primaryMobileUrl;
            const mobileUrl = primaryMobileUrl;
            tailscaleBar.classList.remove('hidden');
            copyTsBtn.onclick = async () => {
              try {
                await navigator.clipboard.writeText(mobileUrl);
                copyTsBtn.textContent = 'Copiado';
                setTimeout(() => { copyTsBtn.textContent = 'Copiar URL móvil'; }, 1800);
              } catch {}
            };
          }
        })
        .catch(() => {});

      const artistInput = document.getElementById('artistInput');
      const suggestions = document.getElementById('suggestions');
      const searchWrap = document.getElementById('searchWrap');
      const selectedCard = document.getElementById('selectedCard');
      const selImg = document.getElementById('selImg');
      const selName = document.getElementById('selName');
      const selGenre = document.getElementById('selGenre');
      const clearSel = document.getElementById('clearSel');
      const trackCountEl = document.getElementById('trackCount');
      const strictTopicEl = document.getElementById('strictTopic');
      const excludeLiveEl = document.getElementById('excludeLive');
      const excludeRemixesEl = document.getElementById('excludeRemixes');
      const submitBtn = document.getElementById('submitBtn');
      const progressBox = document.getElementById('progressBox');
      const emptyState = document.getElementById('emptyState');
      const resultsBox = document.getElementById('resultsBox');
      const plTitle = document.getElementById('plTitle');
      const plMeta = document.getElementById('plMeta');
      const wbActions = document.getElementById('wbActions');
      const trackList = document.getElementById('trackList');

      let selectedArtist = null;
      let searchTimer = null;
      let currentTracks = [];
      let currentTitle = '';
      let activeAudio = null;

      function normKey(s) {
        return String(s || '').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
          .replace(/\\([^)]*(remaster|version|edit|mono|stereo|deluxe)[^)]*\\)/gi, '')
          .replace(/[^a-z0-9\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
      }

      artistInput.addEventListener('input', () => {
        const q = artistInput.value.trim();
        clearTimeout(searchTimer);
        if (q.length < 2) { suggestions.classList.add('hidden'); return; }
        suggestions.classList.remove('hidden');
        suggestions.innerHTML = '<div style="padding:10px;font-size:12px;color:#9ca3af;">Buscando artistas...</div>';
        searchTimer = setTimeout(async () => {
          const res = await fetch('/api/artists?q=' + encodeURIComponent(q), { headers: { 'x-arttrack-session': sessionId } });
          const data = await res.json();
          suggestions.innerHTML = '';
          if (!res.ok) {
            suggestions.innerHTML = '<div style="padding:10px;font-size:12px;color:#fca5a5;">' + (data.error || 'Error al buscar.') + '</div>';
            return;
          }
          if (!data.artists || data.artists.length === 0) {
            suggestions.innerHTML = '<div style="padding:10px;font-size:12px;color:#9ca3af;">Sin sugerencias exactas; pulsa Generar igualmente.</div>';
            return;
          }
          data.artists.forEach((a) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'artist-opt';
            btn.innerHTML =
              (a.artworkUrl ? '<img class="thumb" src="' + a.artworkUrl + '" alt="" />' : '<div class="thumb"></div>') +
              '<div class="meta"><div class="meta-title"></div><div class="meta-sub"></div></div>';
            btn.querySelector('.meta-title').textContent = a.name;
            btn.querySelector('.meta-sub').textContent = a.genre + (a.sampleAlbum ? ' · ' + a.sampleAlbum : '');
            btn.onclick = () => {
              selectedArtist = a;
              searchWrap.classList.add('hidden');
              selectedCard.classList.remove('hidden');
              selName.textContent = a.name;
              selGenre.textContent = a.genre + (a.sampleAlbum ? ' · ' + a.sampleAlbum : '');
              selImg.src = a.artworkUrl || '';
              selImg.style.display = a.artworkUrl ? 'block' : 'none';
              submitBtn.textContent = 'Generar éxitos de ' + a.name;
              runCuration(a.name);
            };
            suggestions.appendChild(btn);
          });
        }, 220);
      });

      clearSel.onclick = () => {
        selectedArtist = null;
        artistInput.value = '';
        selectedCard.classList.add('hidden');
        searchWrap.classList.remove('hidden');
        suggestions.classList.add('hidden');
        submitBtn.textContent = 'Generar Playlist ArtTrack';
        artistInput.focus();
      };

      function renderTracks(artistName, ytmUrls) {
        emptyState.classList.add('hidden');
        resultsBox.classList.remove('hidden');
        plTitle.textContent = currentTitle;
        plMeta.textContent = artistName + ' · ' + currentTracks.length + ' ArtTracks oficiales verificados';

        wbActions.innerHTML = '';
        const m3uBtn = document.createElement('button');
        m3uBtn.className = 'btn-sec';
        m3uBtn.textContent = 'Exportar .M3U';
        m3uBtn.onclick = () => {
          const lines = ['#EXTM3U', '#PLAYLIST:' + currentTitle];
          currentTracks.forEach((t) => { lines.push('#EXTINF:-1,' + t.artist + ' - ' + t.title); lines.push(t.watchUrl); });
          const blob = new Blob([lines.join('\\n')], { type: 'audio/x-mpegurl' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'arttrack-playlist.m3u';
          a.click();
        };
        wbActions.appendChild(m3uBtn);

        const ids = currentTracks.map((t) => t.videoId).filter(Boolean);
        const chunks = [];
        for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
        chunks.forEach((chunk, idx) => {
          const ytBtn = document.createElement('a');
          ytBtn.href = (ytmUrls && ytmUrls[idx]) ? ytmUrls[idx] : ('https://www.youtube.com/watch_videos?video_ids=' + chunk.join(','));
          ytBtn.target = '_blank';
          ytBtn.rel = 'noopener noreferrer';
          ytBtn.className = 'btn-primary';
          ytBtn.style.cssText = 'width:auto;margin-top:0;padding:8px 14px;font-size:12px;text-decoration:none;min-height:38px;display:inline-flex;align-items:center;';
          ytBtn.textContent = chunks.length > 1
            ? 'YouTube Music (' + (idx * 50 + 1) + '–' + (idx * 50 + chunk.length) + ')'
            : 'Abrir en YouTube Music';
          wbActions.appendChild(ytBtn);
        });

        trackList.innerHTML = '';
        currentTracks.forEach((t, idx) => {
          const li = document.createElement('li');
          li.className = 'track-row';
          li.innerHTML =
            '<span class="idx">' + String(idx + 1).padStart(2, '0') + '</span>' +
            (t.artworkUrl ? '<img class="thumb" loading="lazy" decoding="async" src="' + t.artworkUrl + '" alt="" />' : '<div class="thumb"></div>') +
            '<div class="meta"><div class="meta-title"></div><div class="meta-sub"></div></div>' +
            '<div class="track-right"><span class="ch-label"></span></div>';
          li.querySelector('.meta-title').textContent = t.title + ' · ' + (t.durationText || '');
          li.querySelector('.meta-sub').textContent = t.artist + ' · ' + (t.album || '') + ' · ' + (t.year || '');
          li.querySelector('.ch-label').textContent = t.channelName || 'ArtTrack';

          const rightBox = li.querySelector('.track-right');
          if (t.previewUrl) {
            const pBtn = document.createElement('button');
            pBtn.type = 'button';
            pBtn.className = 'btn-sec';
            pBtn.textContent = '▶ 30s';
            pBtn.onclick = () => {
              if (activeAudio) { activeAudio.pause(); activeAudio = null; }
              activeAudio = new Audio(t.previewUrl);
              activeAudio.play().catch(() => {});
            };
            rightBox.appendChild(pBtn);
          }
          trackList.appendChild(li);
        });
      }

      async function runCuration(artistName) {
        const clean = (artistName || '').trim();
        if (!clean) return;
        const targetCount = Number(trackCountEl.value);
        const maxRounds = targetCount <= 30 ? 4 : 10;
        const excludeTitles = [];
        const seenKeys = new Set();
        const seenIds = new Set();
        currentTracks = [];
        currentTitle = 'Mejores éxitos de ' + clean + ' · Solo ArtTracks';
        submitBtn.disabled = true;

        try {
          let emptyRounds = 0;
          for (let round = 1; round <= maxRounds && currentTracks.length < targetCount; round++) {
            const needed = targetCount - currentTracks.length;
            progressBox.classList.remove('hidden');
            progressBox.textContent = 'Guardarraíl ronda ' + round + '/' + maxRounds + ': ' + currentTracks.length + '/' + targetCount + ' ArtTracks oficiales verificados...';

            const res = await fetch('/api/curate', {
              method: 'POST',
              headers: apiHeaders,
              body: JSON.stringify({
                prompt: 'Haz una playlist con los mejores éxitos de ' + clean,
                artist: clean,
                trackCount: Math.min(needed + 4, 16),
                strictTopicOnly: strictTopicEl.checked,
                excludeLive: excludeLiveEl.checked,
                excludeRemixes: excludeRemixesEl.checked,
                excludeTitles,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error del servidor local');
            if (data.playlistTitle) currentTitle = data.playlistTitle;

            for (const a of data.attemptedTitles || []) {
              const k = normKey(a);
              if (k && !seenKeys.has(k)) { seenKeys.add(k); excludeTitles.push(a); }
            }

            let added = 0;
            for (const t of data.tracks || []) {
              if (currentTracks.length >= targetCount) break;
              if (!t.videoId || seenIds.has(t.videoId)) continue;
              seenIds.add(t.videoId);
              currentTracks.push(t);
              added++;
            }

            renderTracks(clean, null);
            if (added === 0) { emptyRounds++; if (emptyRounds >= 2) break; } else { emptyRounds = 0; }
          }

          const finalIds = currentTracks.map((t) => t.videoId).filter(Boolean);
          if (finalIds.length > 0) {
            const ytmRes = await fetch('/api/ytm-queue', {
              method: 'POST',
              headers: apiHeaders,
              body: JSON.stringify({ videoIds: finalIds }),
            });
            if (ytmRes.ok) {
              const ytmData = await ytmRes.json();
              renderTracks(clean, ytmData.urls || null);
            }
          }
        } catch (err) {
          progressBox.classList.remove('hidden');
          progressBox.textContent = err.message || 'Error inesperado';
        } finally {
          if (currentTracks.length > 0) progressBox.classList.add('hidden');
          submitBtn.disabled = false;
        }
      }

      document.getElementById('curateForm').addEventListener('submit', (e) => {
        e.preventDefault();
        runCuration(selectedArtist ? selectedArtist.name : artistInput.value);
      });
    </script>
  </body>
</html>
`;
}

export interface LocalPackageFile {
  name: string;
  content: string | Uint8Array;
  executable?: boolean;
}

export function buildLocalWebAppFiles(): LocalPackageFile[] {
  return [
    { name: 'server.mjs', content: buildLocalServerMjs() },
    { name: 'launcher.mjs', content: buildLocalLauncherMjs() },
    { name: 'index.html', content: buildLocalIndexHtml() },
    { name: 'arttrack.ico', content: buildArtTrackIco() },
    {
      name: 'Mostaza ArtTracks.vbs',
      content:
        'Set fso = CreateObject("Scripting.FileSystemObject")\r\n' +
        'dir = fso.GetParentFolderName(WScript.ScriptFullName)\r\n' +
        'Set shell = CreateObject("WScript.Shell")\r\n' +
        'shell.CurrentDirectory = dir\r\n' +
        'isHeadless = False\r\n' +
        'If WScript.Arguments.Count > 0 Then\r\n' +
        '  If WScript.Arguments(0) = "--headless" Then isHeadless = True\r\n' +
        'End If\r\n' +
        'If isHeadless Then\r\n' +
        '  shell.Run "node """ & dir & "\\server.mjs"" --headless", 0, False\r\n' +
        'Else\r\n' +
        '  shell.Run "node """ & dir & "\\launcher.mjs""", 0, False\r\n' +
        'End If\r\n',
    },
    {
      name: 'Crear-Acceso-Directo-Escritorio.bat',
      content:
        '@echo off\r\n' +
        'setlocal\r\n' +
        'where node >nul 2>nul\r\n' +
        'if errorlevel 1 (\r\n' +
        '  echo Necesitas Node.js 18 o superior: https://nodejs.org\r\n' +
        '  pause\r\n' +
        '  exit /b 1\r\n' +
        ')\r\n' +
        'set "APP_DIR=%~dp0"\r\n' +
        'if "%APP_DIR:~-1%"=="\\" set "APP_DIR=%APP_DIR:~0,-1%"\r\n' +
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "' +
        '$desktop = [Environment]::GetFolderPath(\'Desktop\'); ' +
        '$ws = New-Object -ComObject WScript.Shell; ' +
        '$sc = $ws.CreateShortcut((Join-Path $desktop \'Mostaza ArtTracks.lnk\')); ' +
        '$sc.TargetPath = \'wscript.exe\'; ' +
        '$sc.Arguments = [char]34 + $env:APP_DIR + \'\\Mostaza ArtTracks.vbs\' + [char]34; ' +
        '$sc.WorkingDirectory = $env:APP_DIR; ' +
        '$sc.IconLocation = $env:APP_DIR + \'\\arttrack.ico,0\'; ' +
        '$sc.Description = \'Abrir Mostaza ArtTracks\'; ' +
        '$sc.Save()"\r\n' +
        'echo.\r\n' +
        'echo Acceso directo "Mostaza ArtTracks" creado en tu Escritorio.\r\n' +
        'echo Haz doble clic en el icono del Escritorio para abrir la WebApp sin consola.\r\n' +
        'echo Para acceder desde el movil por Tailscale usa http://MostazaArtTracks:3000 (si Windows Firewall pregunta, pulsa Permitir acceso).\r\n' +
        'echo.\r\n' +
        'pause\r\n',
    },
    {
      name: 'Activar-Inicio-Con-Windows.bat',
      content:
        '@echo off\r\n' +
        'setlocal\r\n' +
        'set "APP_DIR=%~dp0"\r\n' +
        'if "%APP_DIR:~-1%"=="\\" set "APP_DIR=%APP_DIR:~0,-1%"\r\n' +
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "' +
        '$startup = [Environment]::GetFolderPath(\'Startup\'); ' +
        '$ws = New-Object -ComObject WScript.Shell; ' +
        '$sc = $ws.CreateShortcut((Join-Path $startup \'Mostaza ArtTracks Servidor.lnk\')); ' +
        '$sc.TargetPath = \'wscript.exe\'; ' +
        '$sc.Arguments = [char]34 + $env:APP_DIR + \'\\Mostaza ArtTracks.vbs\' + [char]34 + \' --headless\'; ' +
        '$sc.WorkingDirectory = $env:APP_DIR; ' +
        '$sc.IconLocation = $env:APP_DIR + \'\\arttrack.ico,0\'; ' +
        '$sc.Save()"\r\n' +
        'echo.\r\n' +
        'echo Servidor configurado para arrancar automaticamente en segundo plano al encender Windows (listo para Tailscale).\r\n' +
        'pause\r\n',
    },
    {
      name: 'Detener-Mostaza-ArtTracks.bat',
      content:
        '@echo off\r\n' +
        'powershell -NoProfile -Command "try { Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/shutdown | Out-Null; Write-Host \'Mostaza ArtTracks detenido correctamente.\' } catch { Write-Host \'El servidor no estaba ejecutandose.\' }"\r\n' +
        'pause\r\n',
    },
    {
      name: '.env.example',
      content:
        '# Configuración opcional de Mostaza ArtTracks (MostazaLabs)\n' +
        'PORT=3000\n' +
        'HOST=0.0.0.0\n' +
        'TAILSCALE_HOSTNAME=MostazaArtTracks\n' +
        '# Recomendado para IP doméstica (Core 5 210H / 16 GB RAM):\n' +
        'MAX_ACTIVE_USERS=6\n' +
        'MAX_PARALLEL_CURATIONS=3\n' +
        '# Opcional: añade tu clave de Gemini si quieres ranking editorial IA (funciona igualmente sin clave).\n' +
        'GEMINI_API_KEY=\n',
    },
    {
      name: 'iniciar-windows.bat',
      content:
        '@echo off\r\n' +
        'echo Iniciando Mostaza ArtTracks (MostazaLabs)...\r\n' +
        'where node >nul 2>nul\r\n' +
        'if errorlevel 1 (\r\n' +
        '  echo Necesitas Node.js 18 o superior: https://nodejs.org\r\n' +
        '  pause\r\n' +
        '  exit /b 1\r\n' +
        ')\r\n' +
        'node "%~dp0server.mjs"\r\n' +
        'pause\r\n',
    },
    {
      name: 'iniciar-mac-linux.sh',
      executable: true,
      content: '#!/usr/bin/env bash\ncd "$(dirname "$0")"\nnode server.mjs\n',
    },
    {
      name: 'LEEME.txt',
      content: `MOSTAZA ARTTRACKS (MostazaLabs) · WEBAPP LOCAL + ESCRITORIO + TAILSCALE
========================================================================

Requisito único: Node.js 18 o superior (https://nodejs.org). No requiere npm install.

1. CREAR ICONO EN EL ESCRITORIO (WINDOWS):
   - Descomprime esta carpeta en una ubicación fija (ej. C:\\MostazaArtTracks).
   - Haz doble clic una sola vez en "Crear-Acceso-Directo-Escritorio.bat".
   - Aparecerá el icono "Mostaza ArtTracks" en tu Escritorio. A partir de ahí, solo tienes
     que pulsar ese icono (inicia el servidor oculto sin ventanas negras y abre el navegador).
   - Opcional: ejecuta "Activar-Inicio-Con-Windows.bat" si quieres que el servidor arranque
     solo al encender el PC para tenerlo siempre disponible desde el móvil por Tailscale.
   - Para apagarlo en segundo plano, ejecuta "Detener-Mostaza-ArtTracks.bat".

2. EJECUCIÓN EN MAC Y LINUX:
   - Abre una terminal en esta carpeta y ejecuta: ./iniciar-mac-linux.sh
     (o directamente: node server.mjs)

3. ACCEDER DESDE TU MÓVIL CON TAILSCALE:
   - El servidor escucha en todas las interfaces (0.0.0.0:3000).
   - Si Windows Firewall pregunta la primera vez, pulsa "Permitir acceso".
   - Con Tailscale activo en tu PC y en tu móvil, abre en el navegador del móvil:
     http://MostazaArtTracks:3000  (o tu IP 100.x.x.x:3000 de Tailscale que verás arriba en la WebApp).
   - Para que http://MostazaArtTracks:3000 resuelva sin mostrar el nombre real de tu equipo,
     abre el panel web de Tailscale -> Machines -> "..." en tu PC -> Edit machine name -> mostazaarttracks.

4. PROTECCIÓN DE RECURSOS Y AFORO:
   - Por defecto admite hasta 6 visitantes simultáneos y 3 curaciones pesadas en paralelo
     (con cola automática) para proteger tu IP doméstica de bloqueos de YouTube y mantener
     el portátil fluido. Puedes ajustar MAX_ACTIVE_USERS en un archivo .env si lo deseas.

MostazaLabs: División comercial de la Asociación Pirata Ibérica.
`,
    },
  ];
}

export async function downloadLocalWebAppZip(): Promise<void> {
  const zip = new JSZip();
  for (const file of buildLocalWebAppFiles()) {
    zip.file(
      file.name,
      file.content,
      file.executable ? { unixPermissions: '755' } : undefined
    );
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mostaza-arttracks-local.zip';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
