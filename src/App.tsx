import { useEffect, useState } from 'react';
import { CuratorPanel } from './components/CuratorPanel';
import { Header } from './components/Header';
import { InstallGuide } from './components/InstallGuide';
import { TracklistWorkbench } from './components/TracklistWorkbench';
import { downloadLocalWebAppZip } from './lib/localWebAppTemplate';
import type { ArtistSuggestion, CuratedPlaylist, CuratedTrack } from './types/arttrack';

export default function App() {
  const [artistQuery, setArtistQuery] = useState('');
  const [artistSuggestions, setArtistSuggestions] = useState<ArtistSuggestion[]>([]);
  const [isSearchingArtists, setIsSearchingArtists] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<ArtistSuggestion | null>(null);

  const [trackCount, setTrackCount] = useState(12);
  const [strictTopicOnly, setStrictTopicOnly] = useState(true);
  const [excludeLive, setExcludeLive] = useState(true);
  const [excludeRemixes, setExcludeRemixes] = useState(true);

  const [playlist, setPlaylist] = useState<CuratedPlaylist | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadingWebApp, setIsDownloadingWebApp] = useState(false);

  useEffect(() => {
    if (selectedArtist) {
      setArtistSuggestions([]);
      return;
    }

    const trimmed = artistQuery.trim();
    if (trimmed.length < 2) {
      setArtistSuggestions([]);
      setIsSearchingArtists(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingArtists(true);
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = (await res.json()) as { artists?: ArtistSuggestion[] };
          setArtistSuggestions(data.artists ?? []);
        }
      } catch {
        // Ignore aborted or transient search errors
      } finally {
        setIsSearchingArtists(false);
      }
    }, 260);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [artistQuery, selectedArtist]);

  async function runCurationForArtist(artistName: string) {
    const cleanArtist = artistName.trim();
    if (!cleanArtist) return;

    const fullPrompt = `Haz una playlist con los mejores éxitos de ${cleanArtist}`;
    setIsLoading(true);
    setError(null);
    setPlaylist(null);
    setProgressText(`Ronda 1: buscando los primeros ArtTracks oficiales de ${cleanArtist}...`);

    try {
      const targetCount = Math.min(Math.max(trackCount, 3), 100);
      const maxRounds = targetCount <= 30 ? 4 : 10;
      const excludeTitles: string[] = [];
      const seenTitles = new Set<string>();
      const seenVideoIds = new Set<string>();
      const collectedTracks: CuratedTrack[] = [];

      let metaTitle = `Mejores éxitos de ${cleanArtist} · Solo ArtTracks`;
      let metaArtist = cleanArtist;
      let metaNote = `Selección oficial verificada del canal de ${cleanArtist} con portada estática.`;
      let emptyRounds = 0;

      const normalizeKey = (s: string) =>
        s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/\([^)]*(remaster|version|edit|mono|stereo|deluxe)[^)]*\)/gi, '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const fetchBatchWithRetry = async (batchTarget: number) => {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const res = await fetch('/api/curate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: fullPrompt,
              artist: cleanArtist,
              trackCount: batchTarget,
              strictTopicOnly,
              excludeLive,
              excludeRemixes,
              excludeTitles,
              batchMode: true,
            }),
          });

          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000));
              continue;
            }
            throw new Error(
              'El servidor devolvió HTML temporalmente. Si ya hay pistas cargadas, puedes usarlas o reintentar.'
            );
          }

          const data = (await res.json()) as CuratedPlaylist & { error?: string };
          if (!res.ok) {
            throw new Error(data.error || 'Error al generar la playlist ArtTrack.');
          }
          return data;
        }
        throw new Error('No se pudo completar el lote.');
      };

      for (let round = 1; round <= maxRounds; round++) {
        if (collectedTracks.length >= targetCount) break;

        const needed = targetCount - collectedTracks.length;
        const batchTarget = Math.min(needed + 4, 16);

        setProgressText(
          round === 1
            ? `Ronda 1: curando y verificando canal oficial de ${cleanArtist} (meta: ${targetCount})...`
            : `Guardarraíl ronda ${round}/${maxRounds}: ${collectedTracks.length}/${targetCount} ArtTracks verificados. Buscando ${needed} más...`
        );

        let data: CuratedPlaylist;
        try {
          data = await fetchBatchWithRetry(batchTarget);
        } catch (batchErr) {
          if (collectedTracks.length > 0) {
            setError(
              `Se verificaron ${collectedTracks.length} ArtTracks oficiales (una ronda intermedia tardó demasiado y se detuvo por seguridad).`
            );
            break;
          }
          throw batchErr;
        }

        if (round === 1) {
          if (data.playlistTitle) metaTitle = data.playlistTitle;
          if (data.artist) metaArtist = data.artist;
          if (data.curationNote) metaNote = data.curationNote;
        }

        for (const attempted of data.attemptedTitles ?? []) {
          const k = normalizeKey(attempted);
          if (k && !seenTitles.has(k)) {
            seenTitles.add(k);
            excludeTitles.push(attempted);
          }
        }

        let addedThisRound = 0;
        for (const track of data.tracks ?? []) {
          if (collectedTracks.length >= targetCount) break;
          if (!track.videoId) continue;
          if (strictTopicOnly && track.verificationStatus !== 'verified_arttrack') continue;
          if (seenVideoIds.has(track.videoId)) continue;

          const k = normalizeKey(track.title);
          if (!k) continue;
          if (!seenTitles.has(k)) {
            seenTitles.add(k);
            excludeTitles.push(track.title);
          } else if (collectedTracks.some((existing) => normalizeKey(existing.title) === k)) {
            continue;
          }

          seenVideoIds.add(track.videoId);
          collectedTracks.push({
            ...track,
            watchUrl: `https://music.youtube.com/watch?v=${track.videoId}`,
            order: collectedTracks.length + 1,
          });
          addedThisRound++;
        }

        const currentIds = collectedTracks.map((t) => t.videoId).filter((id): id is string => Boolean(id));
        setPlaylist({
          playlistTitle: metaTitle,
          artist: metaArtist,
          curationNote: metaNote,
          prompt: fullPrompt,
          strictTopicOnly,
          excludeLive,
          excludeRemixes,
          tracks: [...collectedTracks],
          youtubeQueueUrl:
            currentIds.length > 0
              ? `https://www.youtube.com/watch_videos?video_ids=${currentIds.slice(0, 50).join(',')}`
              : null,
          verifiedCount: collectedTracks.length,
          generatedAt: new Date().toISOString(),
        });

        if (addedThisRound === 0) {
          emptyRounds++;
          if (emptyRounds >= 2) break;
        } else {
          emptyRounds = 0;
        }
      }

      // Resolve YouTube Music queue links (music.youtube.com/watch?v=...&list=TLGG...)
      const finalIds = collectedTracks.map((t) => t.videoId).filter((id): id is string => Boolean(id));
      if (finalIds.length > 0) {
        setProgressText('Preparando colas directas para YouTube Music...');
        try {
          const ytmRes = await fetch('/api/ytm-queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoIds: finalIds }),
          });
          const ytmCt = ytmRes.headers.get('content-type') || '';
          if (ytmRes.ok && ytmCt.includes('application/json')) {
            const ytmData = (await ytmRes.json()) as { urls?: string[] };
            if (ytmData.urls && ytmData.urls.length > 0) {
              setPlaylist((prev) =>
                prev
                  ? {
                      ...prev,
                      youtubeQueueUrl: ytmData.urls![0] ?? prev.youtubeQueueUrl,
                      youtubeMusicUrls: ytmData.urls,
                    }
                  : prev
              );
            }
          }
        } catch {
          // Keep watch_videos fallback if YTM queue resolver fails
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo conectar con el servidor de curación.';
      setError(msg);
    } finally {
      setProgressText(null);
      setIsLoading(false);
    }
  }

  function handleSelectArtist(artist: ArtistSuggestion) {
    setSelectedArtist(artist);
    setArtistQuery(artist.name);
    setArtistSuggestions([]);
    void runCurationForArtist(artist.name);
  }

  function handleClearArtist() {
    setSelectedArtist(null);
    setArtistQuery('');
    setArtistSuggestions([]);
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    const targetArtist = selectedArtist ? selectedArtist.name : artistQuery.trim();
    if (!targetArtist) return;
    void runCurationForArtist(targetArtist);
  }

  function handleQuickPrompt(sampleArtist: string) {
    const cleanName = sampleArtist
      .replace(/^Haz una playlist con los mejores éxitos de\s+/i, '')
      .replace(/^Los mejores éxitos de\s+/i, '')
      .replace(/\s+sin videoclips$/i, '')
      .replace(/^Best studio hits by\s+/i, '')
      .replace(/,\s*ArtTracks only$/i, '')
      .trim();

    const quickArtist: ArtistSuggestion = {
      id: cleanName.toLowerCase(),
      name: cleanName,
      genre: 'Artista seleccionado',
      sampleAlbum: null,
      artworkUrl: null,
    };
    setSelectedArtist(quickArtist);
    setArtistQuery(cleanName);
    setArtistSuggestions([]);
    void runCurationForArtist(cleanName);
  }

  function handleRemoveTrack(trackId: string) {
    setPlaylist((prev) => {
      if (!prev) return null;
      const nextTracks = prev.tracks.filter((t) => t.id !== trackId);
      const nextIds = nextTracks.map((t) => t.videoId).filter(Boolean);
      return {
        ...prev,
        tracks: nextTracks,
        verifiedCount: nextTracks.filter((t) => t.verificationStatus === 'verified_arttrack').length,
        youtubeQueueUrl:
          nextIds.length > 0
            ? `https://www.youtube.com/watch_videos?video_ids=${nextIds.slice(0, 50).join(',')}`
            : null,
        youtubeMusicUrls: undefined,
      };
    });
  }

  function handleOpenYoutubeQueue(chunkIndex?: number) {
    if (!playlist) return;
    const ids = playlist.tracks.map((t) => t.videoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return;

    const fallbackChunks: string[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      fallbackChunks.push(`https://www.youtube.com/watch_videos?video_ids=${ids.slice(i, i + 50).join(',')}`);
    }

    const resolvedUrls =
      playlist.youtubeMusicUrls && playlist.youtubeMusicUrls.length === fallbackChunks.length
        ? playlist.youtubeMusicUrls
        : fallbackChunks;

    const targets =
      typeof chunkIndex === 'number' && resolvedUrls[chunkIndex]
        ? [resolvedUrls[chunkIndex]]
        : resolvedUrls;

    for (const queueUrl of targets) {
      const anchor = document.createElement('a');
      anchor.href = queueUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
  }

  function handleExportM3u() {
    if (!playlist) return;
    const lines = ['#EXTM3U', `#PLAYLIST:${playlist.playlistTitle}`];
    for (const track of playlist.tracks) {
      if (track.videoId) {
        lines.push(`#EXTINF:-1,${track.artist} - ${track.title}`);
        lines.push(`https://music.youtube.com/watch?v=${track.videoId}`);
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${playlist.artist.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'arttrack'}-playlist.m3u`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleDownloadWebAppZip() {
    setIsDownloadingWebApp(true);
    try {
      await downloadLocalWebAppZip();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'No se pudo empaquetar la WebApp local.';
      setError(msg);
    } finally {
      setIsDownloadingWebApp(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#F3F4F6]">
      <Header onDownloadWebApp={handleDownloadWebAppZip} isDownloadingWebApp={isDownloadingWebApp} />

      <main className="mx-auto max-w-[1360px] px-6 py-10 space-y-14">
        <section id="generador" className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-8 items-center">
          <div className="space-y-4 max-w-3xl">
            <p className="text-xs font-medium text-[#9CA3AF]">
              MostazaLabs · WebApp ligera de curación ArtTrack
            </p>
            <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-[#F3F4F6] text-balance leading-[1.08]">
              Playlists solo en formato ArtTrack, sin videoclips
            </h1>
            <p className="text-base leading-relaxed text-[#9CA3AF] max-w-2xl">
              Busca la banda o artista que quieras, elígelo entre las sugerencias y obtén únicamente
              pistas oficiales de estudio con portada estática 1:1 en canales{' '}
              <span className="font-mono text-[#D1D5DB]">- Topic</span> listas para abrir en YouTube Music.
            </p>
          </div>

          <div className="hidden lg:flex justify-end">
            <div className="h-44 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#12151B]">
              <img
                src="/src/assets/images/arttrack_studio_emblem_1795187434131.jpg"
                alt="Emblema de vinilo y portada estática de Mostaza ArtTracks"
                referrerPolicy="no-referrer"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8 items-start">
          <CuratorPanel
            artistQuery={artistQuery}
            onArtistQueryChange={setArtistQuery}
            artistSuggestions={artistSuggestions}
            isSearchingArtists={isSearchingArtists}
            selectedArtist={selectedArtist}
            onSelectArtist={handleSelectArtist}
            onClearArtist={handleClearArtist}
            trackCount={trackCount}
            onTrackCountChange={setTrackCount}
            strictTopicOnly={strictTopicOnly}
            onStrictTopicChange={setStrictTopicOnly}
            excludeLive={excludeLive}
            onExcludeLiveChange={setExcludeLive}
            excludeRemixes={excludeRemixes}
            onExcludeRemixesChange={setExcludeRemixes}
            onSubmit={handleFormSubmit}
            isLoading={isLoading}
            progressText={progressText}
            error={error}
            playlist={playlist}
            onOpenYoutubeQueue={handleOpenYoutubeQueue}
            onExportM3u={handleExportM3u}
          />

          <TracklistWorkbench
            playlist={playlist}
            isLoading={isLoading}
            progressText={progressText}
            onRemoveTrack={handleRemoveTrack}
            onOpenYoutubeQueue={handleOpenYoutubeQueue}
            onExportM3u={handleExportM3u}
            onQuickPrompt={handleQuickPrompt}
          />
        </section>

        <InstallGuide
          onDownloadWebApp={handleDownloadWebAppZip}
          isDownloadingWebApp={isDownloadingWebApp}
        />
      </main>

      <footer className="border-t border-white/8 py-6">
        <div className="mx-auto flex max-w-[1360px] flex-col sm:flex-row items-center justify-between gap-4 px-6 text-xs text-[#6B7280]">
          <span>Mostaza ArtTracks · MostazaLabs</span>
          <span>MostazaLabs: División comercial de la Asociación Pirata Ibérica</span>
        </div>
      </footer>
    </div>
  );
}
