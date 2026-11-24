import { OutputFormat, PrdrInGameTime, PrdrMetadata } from '../helpers/prdr';

interface PhotoCardProps {
  previewUrl: string;
  outputFileName: string;
  metadata: PrdrMetadata;
  format: OutputFormat;
  busy: boolean;
  onDownload: () => void;
  onRemove: () => void;
}

const formatModeLabel = (mode: string): string => {
  if (mode === 'SP') {
    return 'Story';
  }
  if (mode === 'MP') {
    return 'Online';
  }
  return mode;
};

const formatInGameDate = (time?: PrdrInGameTime): string | null => {
  if (
    !time ||
    time.year === undefined ||
    time.month === undefined ||
    time.day === undefined
  ) {
    return null;
  }
  const yyyy = String(time.year).padStart(4, '0');
  const mm = String(time.month).padStart(2, '0');
  const dd = String(time.day).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const PhotoCard = ({
  previewUrl,
  outputFileName,
  metadata,
  format,
  busy,
  onDownload,
  onRemove,
}: PhotoCardProps) => {
  const sizeKb = Math.max(1, Math.round(metadata.jpegSize / 1024));
  const inGameDate = formatInGameDate(metadata.inGameTime);
  const saveShortLabel = format === 'png' ? 'SAVE .PNG' : 'SAVE .JPG';

  return (
    <li className="rdr-card overflow-hidden flex flex-col text-left shadow-lg">
      <div className="relative bg-black">
        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          title={`Download ${outputFileName}`}
          className="group/img relative block w-full cursor-pointer disabled:cursor-wait focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rdr-crimson-bright)]"
        >
          <img
            src={previewUrl}
            alt={metadata.title || outputFileName}
            className="w-full aspect-video object-cover block"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-2.5 py-2 opacity-0 group-hover/img:opacity-100 transition-opacity"
          >
            <span className="inline-block bg-[#efe7d8] text-[#0b0a09] font-bold text-[10px] tracking-wider leading-tight px-1.5 py-0.5 rounded-[2px]">
              CLICK
            </span>
            <span className="text-[11px] font-semibold tracking-wider text-[#efe7d8]">
              {saveShortLabel}
            </span>
          </span>
        </button>

        {metadata.title && (
          <span className="pointer-events-none absolute top-2 left-2 bg-[#0b0a09]/85 border-l-2 border-[#b81d18] px-2.5 py-0.5 font-rdr-title text-sm text-[#efe7d8]">
            {metadata.title}
          </span>
        )}

        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove ${outputFileName}`}
          className="rdr-icon-btn absolute top-2 right-2 cursor-pointer bg-[#0b0a09]/85 border border-[#efe7d8]/25 enabled:hover:border-[var(--rdr-crimson)] text-[#efe7d8] w-7 h-7 flex items-center justify-center text-xs"
        >
          ✕
        </button>
      </div>

      <div className="rdr-rule" />

      <div className="p-3.5 flex flex-col gap-3 flex-1 justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--rdr-text)] break-all">
            {outputFileName}
          </p>
          {metadata.description && (
            <p className="text-xs italic text-[var(--rdr-text-muted)] mt-1">
              {metadata.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2.5 text-[11px] tracking-wide">
            {metadata.capturedAt && (
              <span className="rdr-chip px-2 py-0.5">
                {metadata.capturedAt}
              </span>
            )}
            {inGameDate && (
              <span className="rdr-chip px-2 py-0.5">In-game {inGameDate}</span>
            )}
            {metadata.width && metadata.height && (
              <span className="rdr-chip px-2 py-0.5">
                {metadata.width}×{metadata.height}
              </span>
            )}
            {metadata.mode && (
              <span className="rdr-chip px-2 py-0.5">
                {formatModeLabel(metadata.mode)}
              </span>
            )}
            <span className="rdr-chip px-2 py-0.5">{sizeKb} KB</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={busy}
          className="w-full cursor-pointer disabled:cursor-wait disabled:opacity-60 rdr-brush-btn font-rdr-title text-base tracking-wider py-2 px-3"
        >
          {format === 'png' ? 'Download .PNG' : 'Download .JPG'}
        </button>
      </div>
    </li>
  );
};

export default PhotoCard;
