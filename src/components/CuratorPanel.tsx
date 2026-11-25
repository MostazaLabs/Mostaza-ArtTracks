import { Disc3, Play, Search, X } from 'lucide-react';
import type { ArtistSuggestion, CuratedPlaylist } from '../types/arttrack';

interface CuratorPanelProps {
  artistQuery: string;
  onArtistQueryChange: (value: string) => void;
  artistSuggestions: ArtistSuggestion[];
  isSearchingArtists: boolean;
  selectedArtist: ArtistSuggestion | null;
  onSelectArtist: (artist: ArtistSuggestion) => void;
  onClearArtist: () => void;
  trackCount: number;
  onTrackCountChange: (value: number) => void;
  strictTopicOnly: boolean;
  onStrictTopicChange: (value: boolean) => void;
  excludeLive: boolean;
  onExcludeLiveChange: (value: boolean) => void;
  excludeRemixes: boolean;
  onExcludeRemixesChange: (value: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  progressText: string | null;
  error: string | null;
  playlist: CuratedPlaylist | null;
  onOpenYoutubeQueue: (chunkIndex?: number) => void;
  onExportM3u: () => void;
}

export function CuratorPanel({
  artistQuery,
  onArtistQueryChange,
  artistSuggestions,
  isSearchingArtists,
  selectedArtist,
  onSelectArtist,
  onClearArtist,
  trackCount,
  onTrackCountChange,
  strictTopicOnly,
  onStrictTopicChange,
  excludeLive,
  onExcludeLiveChange,
  excludeRemixes,
  onExcludeRemixesChange,
  onSubmit,
  isLoading,
  progressText,
  error,
  playlist,
  onOpenYoutubeQueue,
  onExportM3u,
}: CuratorPanelProps) {
  const verifiedCount = playlist ? playlist.tracks.filter((t) => Boolean(t.videoId)).length : 0;
  const showSuggestions =
    !selectedArtist &&
    artistQuery.trim().length >= 2 &&
    (isSearchingArtists || artistSuggestions.length > 0);

  return (
    <div className="w-full rounded-xl border border-white/12 bg-[#11141A] p-5 space-y-4">
      <form onSubmit={onSubmit} className="space-y-3.5">
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#D1D5DB]">
            Haz una playlist con los mejores éxitos de...
          </p>

          {selectedArtist ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-[#E5482B]/50 bg-[#0B0D10] px-3 py-2">
              {selectedArtist.artworkUrl ? (
                <img
                  src={selectedArtist.artworkUrl}
                  alt={selectedArtist.name}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  className="h-9 w-9 rounded object-cover shrink-0 bg-[#1F242E]"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded bg-[#1F242E] text-[#6B7280] shrink-0">
                  <Disc3 className="h-4 w-4" aria-hidden="true" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#F3F4F6]">
                  {selectedArtist.name}
                </p>
                <p className="truncate text-[11px] text-[#9CA3AF]">
                  {selectedArtist.genre}
                  {selectedArtist.sampleAlbum ? ` · ${selectedArtist.sampleAlbum}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={onClearArtist}
                title="Buscar otro artista"
                aria-label="Buscar otro artista"
                className="rounded p-1.5 text-[#9CA3AF] hover:bg-white/5 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]"
                aria-hidden="true"
              />
              <input
                id="artist-search"
                type="search"
                value={artistQuery}
                onChange={(e) => onArtistQueryChange(e.target.value)}
                placeholder="Buscar artista o banda (ej. Queen, Soda Stereo)..."
                autoComplete="off"
                className="w-full rounded-lg border border-white/12 bg-[#0B0D10] pl-9 pr-9 py-2.5 text-sm text-[#F3F4F6] placeholder:text-[#6B7280] focus:border-[#E5482B] focus:outline-none"
              />
              {artistQuery.length > 0 && (
                <button
                  type="button"
                  onClick={() => onArtistQueryChange('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#6B7280] hover:text-white cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {showSuggestions && (
            <div
              role="listbox"
              aria-label="Artistas sugeridos"
              className="rounded-lg border border-white/12 bg-[#0B0D10] divide-y divide-white/6 max-h-[220px] overflow-y-auto"
            >
              {isSearchingArtists && artistSuggestions.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-[#9CA3AF]">Buscando artistas...</p>
              ) : (
                artistSuggestions.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => onSelectArtist(artist)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/[0.05] cursor-pointer"
                  >
                    {artist.artworkUrl ? (
                      <img
                        src={artist.artworkUrl}
                        alt={artist.name}
                        referrerPolicy="no-referrer"
                        decoding="async"
                        className="h-9 w-9 rounded object-cover shrink-0 bg-[#1F242E]"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded bg-[#1F242E] text-[#6B7280] shrink-0">
                        <Disc3 className="h-4 w-4" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[#F3F4F6]">
                        {artist.name}
                      </p>
                      <p className="truncate text-[11px] text-[#9CA3AF]">
                        {artist.genre}
                        {artist.sampleAlbum ? ` · ${artist.sampleAlbum}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {!selectedArtist &&
            !isSearchingArtists &&
            artistQuery.trim().length >= 2 &&
            artistSuggestions.length === 0 && (
              <p className="text-[11px] text-[#9CA3AF] px-1">
                Sin sugerencias exactas; pulsa Generar para buscar &ldquo;{artistQuery.trim()}&rdquo; directamente.
              </p>
            )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center justify-between rounded-lg border border-white/10 bg-[#161921] px-3 py-2.5 text-xs text-[#D1D5DB]">
            <span>Pistas</span>
            <select
              value={trackCount}
              onChange={(e) => onTrackCountChange(Number(e.target.value))}
              className="bg-transparent font-mono font-semibold text-[#F3F4F6] focus:outline-none cursor-pointer"
            >
              <option value={8} className="bg-[#11141A]">8</option>
              <option value={12} className="bg-[#11141A]">12</option>
              <option value={16} className="bg-[#11141A]">16</option>
              <option value={20} className="bg-[#11141A]">20</option>
              <option value={30} className="bg-[#11141A]">30</option>
              <option value={50} className="bg-[#11141A]">50</option>
              <option value={75} className="bg-[#11141A]">75</option>
              <option value={100} className="bg-[#11141A]">100</option>
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161921] px-3 py-2.5 text-xs text-[#D1D5DB] cursor-pointer">
            <input
              type="checkbox"
              checked={strictTopicOnly}
              onChange={(e) => onStrictTopicChange(e.target.checked)}
              className="accent-[#E5482B]"
            />
            <span className="truncate">Solo &quot;- Topic&quot;</span>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161921] px-3 py-2.5 text-xs text-[#D1D5DB] cursor-pointer">
            <input
              type="checkbox"
              checked={excludeLive}
              onChange={(e) => onExcludeLiveChange(e.target.checked)}
              className="accent-[#E5482B]"
            />
            <span className="truncate">Sin directos</span>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#161921] px-3 py-2.5 text-xs text-[#D1D5DB] cursor-pointer">
            <input
              type="checkbox"
              checked={excludeRemixes}
              onChange={(e) => onExcludeRemixesChange(e.target.checked)}
              className="accent-[#E5482B]"
            />
            <span className="truncate">Sin remixes</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading || (!selectedArtist && !artistQuery.trim())}
          className="w-full inline-flex items-center justify-center rounded-lg bg-[#E5482B] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-55 cursor-pointer"
        >
          {isLoading
            ? 'Verificando ArtTracks...'
            : selectedArtist
            ? `Generar éxitos de ${selectedArtist.name}`
            : 'Generar Playlist ArtTrack'}
        </button>
      </form>

      {isLoading && progressText && (
        <div className="rounded-lg border border-white/10 bg-[#161921] px-3 py-2 text-xs text-[#D1D5DB]">
          {progressText}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/35 bg-red-500/10 px-3 py-2.5 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {playlist && (
        <div className="space-y-3 border-t border-white/10 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-[#F3F4F6] truncate">
              {playlist.playlistTitle}
            </p>
            <span className="text-[11px] font-mono tabular-nums text-[#9CA3AF] shrink-0">
              {verifiedCount}/{playlist.tracks.length} listos
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onOpenYoutubeQueue()}
              disabled={verifiedCount === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#F3F4F6] px-3 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>
                {verifiedCount > 50
                  ? `Abrir ${verifiedCount} (${Math.ceil(verifiedCount / 50)} colas)`
                  : 'Abrir en YT Music'}
              </span>
            </button>
            <button
              type="button"
              onClick={onExportM3u}
              className="inline-flex items-center justify-center rounded-lg border border-white/12 bg-[#181C24] px-3 py-2 text-xs font-semibold text-[#F3F4F6] hover:border-white/25 cursor-pointer whitespace-nowrap"
            >
              Exportar .M3U
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
