import { Download } from 'lucide-react';

interface InstallGuideProps {
  onDownloadWebApp: () => void;
  isDownloadingWebApp: boolean;
}

export function InstallGuide({
  onDownloadWebApp,
  isDownloadingWebApp,
}: InstallGuideProps) {
  return (
    <section id="instalacion" className="space-y-6 pb-8">
      <div className="space-y-1.5 max-w-2xl">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F4F6]">
          Ejecución local en PC (Windows, macOS y Linux) y acceso por Tailscale
        </h2>
        <p className="text-sm text-[#9CA3AF]">
          Ejecuta Mostaza ArtTracks directamente en tu ordenador con icono de Escritorio, accede
          desde tu móvil por Tailscale o descarga el paquete listo para PC desde GitHub Actions y Releases.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#12151B] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono text-xs font-semibold text-[#E5482B]">01.</p>
            <h3 className="font-display text-base font-semibold text-[#F3F4F6]">
              WebApp Local para PC
            </h3>
            <p className="text-xs leading-relaxed text-[#9CA3AF]">
              Descarga el paquete <span className="font-mono text-[#D1D5DB]">.zip</span> y extráelo
              en una carpeta fija. Funciona en Windows, macOS y Linux solo con{' '}
              <span className="font-mono text-[#D1D5DB]">Node.js 18+</span> (sin{' '}
              <span className="font-mono text-[#D1D5DB]">npm install</span>).
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadWebApp}
            disabled={isDownloadingWebApp}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#E5482B] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-55 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isDownloadingWebApp ? 'Empaquetando...' : 'Descargar WebApp (.zip)'}</span>
          </button>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12151B] p-5 space-y-2">
          <p className="font-mono text-xs font-semibold text-[#E5482B]">02.</p>
          <h3 className="font-display text-base font-semibold text-[#F3F4F6]">
            Icono en Escritorio y Tailscale
          </h3>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            En Windows ejecuta una vez{' '}
            <span className="font-mono text-[#D1D5DB]">Crear-Acceso-Directo-Escritorio.bat</span>{' '}
            para crear el icono <span className="text-[#D1D5DB] font-medium">Mostaza ArtTracks</span>.
            Escucha en <span className="font-mono text-[#D1D5DB]">0.0.0.0:3000</span> para abrir{' '}
            <span className="font-mono text-[#D1D5DB]">http://MostazaArtTracks:3000</span> por Tailscale
            (tope seguro de 6 usuarios y 3 curaciones en paralelo).
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12151B] p-5 space-y-2">
          <p className="font-mono text-xs font-semibold text-[#E5482B]">03.</p>
          <h3 className="font-display text-base font-semibold text-[#F3F4F6]">
            Paquetes automáticos PC en GitHub
          </h3>
          <p className="text-xs leading-relaxed text-[#9CA3AF]">
            Al subir cambios a GitHub, el workflow de{' '}
            <span className="font-mono text-[#D1D5DB]">Actions</span> verifica el código y empaqueta
            automáticamente{' '}
            <span className="font-mono text-[#D1D5DB]">Mostaza-ArtTracks-PC.zip</span> y{' '}
            <span className="font-mono text-[#D1D5DB]">Mostaza-ArtTracks-Mac-Linux.tar.gz</span>{' '}
            (descargables en Actions y Releases).
          </p>
        </div>
      </div>
    </section>
  );
}
