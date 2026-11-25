import { Download } from 'lucide-react';

interface HeaderProps {
  onDownloadWebApp: () => void;
  isDownloadingWebApp: boolean;
}

export function Header({ onDownloadWebApp, isDownloadingWebApp }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0B0D10]">
      <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-4">
        <a
          href="#generador"
          className="font-display text-lg font-bold tracking-tight text-[#F3F4F6] whitespace-nowrap shrink-0"
        >
          Mostaza ArtTracks
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#9CA3AF]">
          <a
            href="#generador"
            className="hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
          >
            Generador
          </a>
          <a
            href="#resultados"
            className="hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
          >
            Lista
          </a>
          <a
            href="#instalacion"
            className="hover:text-[#F3F4F6] whitespace-nowrap shrink-0"
          >
            WebApp Local
          </a>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onDownloadWebApp}
            disabled={isDownloadingWebApp}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E5482B] px-4 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5482B] disabled:opacity-60 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isDownloadingWebApp ? 'Empaquetando...' : 'Descargar WebApp'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
