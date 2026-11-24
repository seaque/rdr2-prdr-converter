import { useEffect, useRef, useState } from 'react';
import JSZip from 'jszip';
import clsx from 'clsx';
import StyledDropzone from './StyledDropzone';
import PhotoCard from './PhotoCard';
import UpdatePrompt from './UpdatePrompt';
import {
  buildOutputFileName,
  NamingMode,
  OutputFormat,
  ParsedPrdr,
  parsePrdrFile,
} from '../helpers/prdr';
import {
  deduplicateFileName,
  resolveOutputFile,
  triggerFileDownload,
} from '../helpers/imageConverter';
import {
  applyResolvedTheme,
  getStoredThemePreference,
  getSystemTheme,
  ResolvedTheme,
  resolveTheme,
  saveThemePreference,
  subscribeToSystemTheme,
  ThemePreference,
} from '../helpers/theme';

interface PhotoItem {
  id: string;
  parsed: ParsedPrdr;
  previewUrl: string;
  pngBlob?: Blob;
}

interface ConversionError {
  name: string;
  reason: string;
}

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

const toggleBtnClass = (active: boolean, compact = false) =>
  clsx(
    'cursor-pointer font-rdr-title tracking-wider',
    compact ? 'text-xs px-3 py-1' : 'text-sm px-4 py-1.5',
    active ? 'rdr-brush-btn' : 'rdr-menu-btn',
  );

const App = () => {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [namingMode, setNamingMode] = useState<NamingMode>('original');
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    getStoredThemePreference(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const [parsing, setParsing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [errors, setErrors] = useState<ConversionError[]>([]);
  const activeUrlsRef = useRef<Set<string>>(new Set());
  const nextIdRef = useRef(0);

  useEffect(() => subscribeToSystemTheme(setSystemTheme), []);

  useEffect(() => {
    applyResolvedTheme(resolveTheme(themePreference, systemTheme));
  }, [themePreference, systemTheme]);

  useEffect(() => {
    const urls = activeUrlsRef.current;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const handleThemeChange = (next: ThemePreference) => {
    setThemePreference(next);
    saveThemePreference(next);
  };

  const handleFilesSelected = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setParsing(true);
    const added: PhotoItem[] = [];
    const failed: ConversionError[] = [];

    for (const file of files) {
      try {
        const parsed = await parsePrdrFile(file);
        const previewUrl = URL.createObjectURL(parsed.jpegBlob);
        activeUrlsRef.current.add(previewUrl);
        nextIdRef.current += 1;
        added.push({
          id: `prdr-${nextIdRef.current}`,
          parsed,
          previewUrl,
        });
      } catch (err) {
        failed.push({
          name: file.name,
          reason: getErrorMessage(err),
        });
      }
    }

    setErrors(failed);
    if (added.length > 0) {
      setItems(prev => prev.concat(added));
    }
    setParsing(false);
  };

  const handleDownloadSingle = async (target: PhotoItem) => {
    setBusyId(target.id);
    try {
      const result = await resolveOutputFile(
        target.parsed,
        format,
        namingMode,
        target.pngBlob,
      );
      if (result.pngBlob && !target.pngBlob) {
        const pngBlob = result.pngBlob;
        setItems(prev =>
          prev.map(item =>
            item.id === target.id ? { ...item, pngBlob } : item,
          ),
        );
      }
      triggerFileDownload(result.file, result.file.name);
    } catch (err) {
      setErrors([
        {
          name: target.parsed.originalName,
          reason: getErrorMessage(err),
        },
      ]);
    } finally {
      setBusyId(null);
    }
  };

  const handleDownloadAll = async () => {
    setZipping(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const newPngCache = new Map<string, Blob>();

      for (const item of items) {
        const result = await resolveOutputFile(
          item.parsed,
          format,
          namingMode,
          item.pngBlob,
        );
        if (result.pngBlob && !item.pngBlob) {
          newPngCache.set(item.id, result.pngBlob);
        }
        const entryName = deduplicateFileName(result.file.name, usedNames);
        zip.file(entryName, result.file);
      }

      if (newPngCache.size > 0) {
        setItems(prev =>
          prev.map(item => {
            const cached = newPngCache.get(item.id);
            return cached ? { ...item, pngBlob: cached } : item;
          }),
        );
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerFileDownload(zipBlob, `RDR2-photos-${format}.zip`);
    } catch (err) {
      setErrors([
        {
          name: 'ZIP archive',
          reason: getErrorMessage(err),
        },
      ]);
    } finally {
      setZipping(false);
    }
  };

  const handleRemove = (target: PhotoItem) => {
    URL.revokeObjectURL(target.previewUrl);
    activeUrlsRef.current.delete(target.previewUrl);
    setItems(prev => prev.filter(item => item.id !== target.id));
  };

  const handleClearAll = () => {
    items.forEach(item => {
      URL.revokeObjectURL(item.previewUrl);
      activeUrlsRef.current.delete(item.previewUrl);
    });
    setItems([]);
    setErrors([]);
  };

  return (
    <>
      <UpdatePrompt />
      <main className="max-w-5xl mx-auto px-4 py-8 text-center">
        <div className="flex justify-center sm:justify-end mb-4">
          <div
            role="group"
            aria-label="Theme"
            className="inline-flex flex-wrap items-center justify-center gap-1.5"
          >
            <span className="text-[11px] uppercase tracking-[0.18em] text-[var(--rdr-text-muted)] mr-1">
              Theme
            </span>
            <button
              type="button"
              aria-pressed={themePreference === 'auto'}
              onClick={() => handleThemeChange('auto')}
              className={toggleBtnClass(themePreference === 'auto', true)}
            >
              Follow device (Auto)
            </button>
            <button
              type="button"
              aria-pressed={themePreference === 'dark'}
              onClick={() => handleThemeChange('dark')}
              className={toggleBtnClass(themePreference === 'dark', true)}
            >
              Dark
            </button>
            <button
              type="button"
              aria-pressed={themePreference === 'light'}
              onClick={() => handleThemeChange('light')}
              className={toggleBtnClass(themePreference === 'light', true)}
            >
              Light
            </button>
          </div>
        </div>

        <header className="mb-6">
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="RDR2 PRDR Converter"
            className="w-16 h-16 mx-auto mb-3 border border-[var(--rdr-border)] shadow-lg"
          />
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--rdr-crimson-text)] font-semibold">
            Red Dead Redemption II • Photo Mode
          </p>
          <h1 className="font-rdr-title rdr-title-shadow text-4xl sm:text-5xl text-[var(--rdr-text)] mt-1.5">
            PRDR to JPEG / PNG Converter
          </h1>
          <svg
            aria-hidden="true"
            viewBox="0 0 360 12"
            className="w-72 sm:w-80 h-3 mx-auto mt-1.5 text-[var(--rdr-crimson)]"
            preserveAspectRatio="none"
          >
            <path
              d="M2 6 C 48 2, 110 9, 180 4 C 250 0, 310 8, 358 5 L 354 9 C 296 11, 232 6, 178 9 C 112 11, 44 7, 4 10 Z"
              fill="currentColor"
            />
          </svg>
          <div className="rdr-rule max-w-2xl mx-auto mt-4" />
          <p className="text-sm text-[var(--rdr-text-secondary)] mt-4 max-w-2xl mx-auto leading-relaxed">
            Extract Red Dead Redemption 2 &amp; RedM Photo Mode captures (
            <code className="text-[var(--rdr-text)] font-semibold">PRDR*</code>)
            to JPEG or PNG directly in your browser.
          </p>
        </header>

        <section
          aria-label="Output options"
          className="rdr-panel max-w-3xl mx-auto mb-5 px-4 py-3.5 flex flex-wrap items-center justify-center gap-5"
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--rdr-text-muted)]">
              Format
            </span>
            <div className="flex gap-2" role="group" aria-label="Output format">
              <button
                type="button"
                aria-pressed={format === 'jpeg'}
                onClick={() => setFormat('jpeg')}
                className={toggleBtnClass(format === 'jpeg')}
              >
                JPEG ( Original)
              </button>
              <button
                type="button"
                aria-pressed={format === 'png'}
                onClick={() => setFormat('png')}
                className={toggleBtnClass(format === 'png')}
              >
                PNG
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-[0.18em] text-[var(--rdr-text-muted)]">
              Filename
            </span>
            <div className="flex gap-2" role="group" aria-label="Naming mode">
              <button
                type="button"
                aria-pressed={namingMode === 'original'}
                onClick={() => setNamingMode('original')}
                className={toggleBtnClass(namingMode === 'original')}
              >
                Original filename
              </button>
              <button
                type="button"
                aria-pressed={namingMode === 'metadata'}
                onClick={() => setNamingMode('metadata')}
                className={toggleBtnClass(namingMode === 'metadata')}
              >
                Date &amp; Location
              </button>
            </div>
          </div>
        </section>

        <div className="max-w-2xl mx-auto">
          {parsing ? (
            <p className="rdr-panel font-rdr-title text-xl text-[var(--rdr-crimson-bright)] py-10 tracking-wider">
              Parsing PRDR files...
            </p>
          ) : (
            <StyledDropzone onDrop={handleFilesSelected} disabled={zipping}>
              <p className="font-rdr-title text-xl sm:text-2xl text-[var(--rdr-text)] tracking-wide">
                Click here to select PRDR files, or drag and drop.
              </p>
              <p className="text-xs text-[var(--rdr-text-muted)] mt-1.5 tracking-wide">
                Accepts extensionless PRDR* files and .prdr captures
              </p>
            </StyledDropzone>
          )}
        </div>

        <section
          aria-label="Where to find PRDR files"
          className="rdr-panel border-l-2 border-l-[var(--rdr-crimson)] max-w-2xl mx-auto mt-5 px-4 py-3 text-xs text-[var(--rdr-text-muted)] text-left space-y-1"
        >
          <p>
            <strong className="text-[var(--rdr-text)] tracking-wide">
              RDR2 (PC):
            </strong>{' '}
            <code className="text-[var(--rdr-text-secondary)]">
              Documents\Rockstar Games\Red Dead Redemption
              2\Profiles\&lt;ProfileID&gt;\
            </code>
          </p>
          <p>
            <strong className="text-[var(--rdr-text)] tracking-wide">
              RedM:
            </strong>{' '}
            <code className="text-[var(--rdr-text-secondary)]">
              %UserProfile%\Saved Games\CitizenFX\RDR2\
            </code>
          </p>
        </section>

        {errors.length > 0 && (
          <div
            role="alert"
            className="rdr-alert max-w-2xl mx-auto mt-5 px-4 py-3 text-left text-sm flex items-start justify-between gap-3"
          >
            <div>
              <p className="font-rdr-title text-base tracking-wider text-[var(--rdr-alert-title)]">
                Some files could not be processed:
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5 text-xs">
                {errors.map((err, idx) => (
                  <li key={`${err.name}-${idx}`}>
                    <strong>{err.name}:</strong> {err.reason}
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => setErrors([])}
              aria-label="Dismiss errors"
              className="cursor-pointer border border-[var(--rdr-border)] hover:border-[var(--rdr-border-strong)] w-6 h-6 flex items-center justify-center text-xs leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {items.length > 0 && (
          <section aria-label="Converted photos" className="mt-8">
            <div className="rdr-rule max-w-4xl mx-auto mb-5" />
            <div className="flex flex-wrap items-center justify-center gap-3 mb-5">
              <span className="font-rdr-title text-lg tracking-wider text-[var(--rdr-text)]">
                {items.length} {items.length === 1 ? 'photo' : 'photos'} ready.
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={zipping}
                  className="cursor-pointer disabled:cursor-wait disabled:opacity-60 rdr-brush-btn font-rdr-title text-base tracking-wider px-5 py-2"
                >
                  {zipping ? 'Creating ZIP...' : 'Download all (.zip)'}
                </button>
              )}
              <button
                type="button"
                onClick={handleClearAll}
                disabled={zipping}
                className="cursor-pointer disabled:opacity-60 rdr-menu-btn font-rdr-title text-base tracking-wider px-4 py-2"
              >
                Clear all
              </button>
            </div>

            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0">
              {items.map(item => (
                <PhotoCard
                  key={item.id}
                  previewUrl={item.previewUrl}
                  outputFileName={buildOutputFileName(
                    item.parsed,
                    format,
                    namingMode,
                  )}
                  metadata={item.parsed.metadata}
                  format={format}
                  busy={zipping || busyId === item.id}
                  onDownload={() => handleDownloadSingle(item)}
                  onRemove={() => handleRemove(item)}
                />
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10">
          <div className="rdr-rule-sharp" />
          <div className="pt-3 flex items-center justify-center gap-1.5 font-rdr-prompts text-xs text-[var(--rdr-text-secondary)]">
            <span>Vibecoded with</span>
            <svg
              role="img"
              aria-label="Gemini"
              viewBox="0 0 24 24"
              className="w-4 h-4 shrink-0 text-[var(--rdr-crimson)]"
              fill="none"
            >
              <p>Gemini</p>
              <path
                d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12Z"
                fill="currentColor"
              />
            </svg>
          </div>
        </footer>
      </main>
    </>
  );
};

export default App;
