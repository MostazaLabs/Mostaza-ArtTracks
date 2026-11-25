import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Disc3,
  ExternalLink,
  FileDown,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import type { CuratedPlaylist } from '../types/arttrack';

interface TracklistWorkbenchProps {
  playlist: CuratedPlaylist | null;
  isLoading: boolean;
  progressText: string | null;
  onRemoveTrack: (trackId: string) => void;
  onOpenYoutubeQueue: (chunkIndex?: number) => void;
  onExportM3u: () => void;
  onQuickPrompt: (prompt: string) => void;
}

export function TracklistWorkbench({
  playlist,
  isLoading,
  progressText,
  onRemoveTrack,
  onOpenYoutubeQueue,
  onExportM3u,
  onQuickPrompt,
}: TracklistWorkbenchProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState(false);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
    }
  }, [playlist?.generatedAt]);

  function toggleAudioPreview(trackId: string, previewUrl: string | null) {
    if (!previewUrl) return;

    if (playingTrackId === trackId && audioRef.current) {
      audioRef.current.pause();
      setPlayingTrackId(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
    }

    const audio = new Audio(previewUrl);
    audioRef.current = audio;
    setPlayingTrackId(trackId);

    audio.play().catch(() => {
      setPlayingTrackId(null);
    });
    audio.onended = () => {
      setPlayingTrackId(null);
    };
  }

  async function handleCopyVideoIds() {
    if (!playlist) return;
    const ids = playlist.tracks.map((t) => t.videoId).filter(Boolean).join(',');
    if (!ids) return;
    await navigator.clipboard.writeText(ids);
    setCopiedIds(true);
    setTimeout(() => setCopiedIds(false), 1800);
  }

  if (isLoading && !playlist) {
    return (
      <div id="resultados" className="rounded-xl border border-white/10 bg-[#12151B] p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/8 pb-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-[#F3F4F6]">
              {progressText || 'Consultando catálogo oficial y verificando ArtTracks...'}
            </p>
            <p className="text-xs text-[#9CA3AF]">
              Filtrando pistas de estudio con portada estática 1:1 en YouTube Music.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="flex items-center gap-4 rounded-lg border border-white/6 bg-[#161A22] px-4 py-3"
            >
              <span className="w-5 text-right font-mono text-xs tabular-nums text-[#6B7280]">
                {String(idx + 1).padStart(2, '0')}
              </span>
              <div className="h-12 w-12 rounded bg-white/6 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-44 rounded bg-white/8" />
                <div className="h-3 w-60 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!playlist) {
    return (
      <div
        id="resultados"
        className="flex h-full flex-col justify-between rounded-xl border border-white/10 bg-[#12151B] p-8"
      >
        <div className="space-y-4 max-w-xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F4F6]">
            Solo música de estudio con portada estática
          </h2>
          <p className="text-sm leading-relaxed text-[#9CA3AF]">
            A diferencia de una búsqueda normal en YouTube que mezcla videoclips, conciertos en
            directo y vídeos con letras, Mostaza ArtTracks localiza únicamente pistas generadas por
            distribuidoras oficiales bajo canales <span className="font-mono text-[#D1D5DB]">- Topic</span>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/8">
            <div>
              <p className="text-xs font-semibold text-[#F3F4F6]">01. Búsqueda directa</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Elige cualquier banda o etapa musical y selecciona hasta 100 pistas.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#F3F4F6]">02. Filtro ArtTrack</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Verifica el canal oficial del artista y la huella &ldquo;Provided to YouTube by&rdquo;.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#F3F4F6]">03. Cola en YT Music</p>
              <p className="mt-1 text-xs text-[#9CA3AF]">
                Abre la playlist directa en YouTube Music o expórtala en formato M3U.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-white/8 flex flex-wrap items-center gap-3">
          <span className="text-xs text-[#9CA3AF]">Prueba rápida:</span>
          <button
            type="button"
            onClick={() => onQuickPrompt('Soda Stereo')}
            className="rounded-lg border border-white/12 bg-[#181C24] px-3.5 py-2 text-xs font-medium text-[#F3F4F6] hover:border-white/25 cursor-pointer"
          >
            Éxitos de Soda Stereo
          </button>
          <button
            type="button"
            onClick={() => onQuickPrompt('The Cure')}
            className="rounded-lg border border-white/12 bg-[#181C24] px-3.5 py-2 text-xs font-medium text-[#F3F4F6] hover:border-white/25 cursor-pointer"
          >
            Éxitos de The Cure
          </button>
          <button
            type="button"
            onClick={() => onQuickPrompt('Radiohead')}
            className="rounded-lg border border-white/12 bg-[#181C24] px-3.5 py-2 text-xs font-medium text-[#F3F4F6] hover:border-white/25 cursor-pointer"
          >
            Éxitos de Radiohead
          </button>
        </div>
      </div>
    );
  }

  const verifiedIds = playlist.tracks.map((t) => t.videoId).filter((id): id is string => Boolean(id));
  const chunkCount = Math.ceil(verifiedIds.length / 50);

  return (
    <div id="resultados" className="rounded-xl border border-white/10 bg-[#12151B] overflow-hidden">
      {isLoading && progressText && (
        <div className="border-b border-[#E5482B]/30 bg-[#E5482B]/10 px-6 py-2.5 text-xs font-medium text-[#FCA5A5]">
          {progressText}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
        <div className="space-y-1 min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight text-[#F3F4F6] truncate">
            {playlist.playlistTitle}
          </h2>
          <p className="text-xs text-[#9CA3AF]">
            {playlist.artist} · {playlist.tracks.length} canciones · {verifiedIds.length} ArtTracks
            verificados · Portada 1:1 sin vídeo
          </p>
          <p className="text-xs text-[#D1D5DB] pt-1">{playlist.curationNote}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyVideoIds}
            disabled={verifiedIds.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#181C24] px-3 py-2 text-xs font-medium text-[#F3F4F6] hover:border-white/25 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {copiedIds ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                <span>IDs copiados</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copiar IDs</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onExportM3u}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-[#181C24] px-3 py-2 text-xs font-medium text-[#F3F4F6] hover:border-white/25 cursor-pointer whitespace-nowrap"
          >
            <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>M3U</span>
          </button>

          {chunkCount > 1 ? (
            Array.from({ length: chunkCount }).map((_, idx) => {
              const startNum = idx * 50 + 1;
              const endNum = Math.min((idx + 1) * 50, verifiedIds.length);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onOpenYoutubeQueue(idx)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#E5482B] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 cursor-pointer whitespace-nowrap"
                >
                  <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                  <span>
                    YouTube Music ({startNum}–{endNum})
                  </span>
                </button>
              );
            })
          ) : (
            <button
              type="button"
              onClick={() => onOpenYoutubeQueue()}
              disabled={verifiedIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#E5482B] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>Abrir en YouTube Music</span>
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-white/6">
        {playlist.tracks.map((track, index) => {
          const isPlaying = playingTrackId === track.id;
          const isVerified = track.verificationStatus === 'verified_arttrack';
          const topicSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
            track.artTrackQuery
          )}`;

          return (
            <div
              key={track.id}
              className="flex items-center gap-4 px-6 py-3.5 hover:bg-white/[0.02]"
            >
              <span className="w-6 text-right font-mono text-xs tabular-nums text-[#6B7280] shrink-0">
                {String(index + 1).padStart(2, '0')}
              </span>

              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-[#1B1F28]">
                {track.artworkUrl ? (
                  <img
                    src={track.artworkUrl}
                    alt={`Portada de ${track.album}`}
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[#6B7280]">
                    <Disc3 className="h-5 w-5" aria-hidden="true" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-semibold text-[#F3F4F6]">{track.title}</p>
                  <span className="font-mono text-xs tabular-nums text-[#9CA3AF] shrink-0">
                    {track.durationText}
                  </span>
                </div>
                <p className="truncate text-xs text-[#9CA3AF]">
                  {track.artist} · {track.album} · {track.year}
                </p>
                <p className="truncate text-[11px] text-[#6B7280] mt-0.5">{track.reason}</p>
              </div>

              <div className="hidden md:flex flex-col items-end gap-1 shrink-0 min-w-[190px]">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                  {isVerified ? (
                    <>
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-emerald-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-emerald-400 truncate max-w-[175px]">
                        {track.channelName || 'ArtTrack Verificado'}
                      </span>
                    </>
                  ) : track.videoId ? (
                    <>
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-amber-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-amber-300 truncate max-w-[175px]">
                        {track.channelName || 'Audio candidato'}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle
                        className="h-3.5 w-3.5 text-amber-400 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="text-amber-300">Pendiente de verificar</span>
                    </>
                  )}
                </div>

                {track.videoId ? (
                  <a
                    href={`https://music.youtube.com/watch?v=${track.videoId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[#9CA3AF] hover:text-white"
                  >
                    <span>ytm:{track.videoId}</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                ) : (
                  <a
                    href={topicSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF] hover:text-white"
                  >
                    <span>Buscar Topic en YouTube</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleAudioPreview(track.id, track.previewUrl)}
                  disabled={!track.previewUrl}
                  title={
                    track.previewUrl
                      ? isPlaying
                        ? 'Pausar muestra de estudio'
                        : 'Escuchar muestra de 30s'
                      : 'Muestra de audio no disponible'
                  }
                  aria-label={isPlaying ? `Pausar ${track.title}` : `Reproducir ${track.title}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181C24] text-[#D1D5DB] hover:border-white/25 hover:text-white disabled:opacity-35 cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onRemoveTrack(track.id)}
                  title="Excluir pista"
                  aria-label={`Excluir ${track.title}`}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#181C24] text-[#9CA3AF] hover:border-red-500/40 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
