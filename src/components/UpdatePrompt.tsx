import { useRegisterSW } from 'virtual:pwa-register/react';

const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <div className="rdr-toast fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 text-sm px-5 py-3 shadow-2xl z-50 whitespace-nowrap">
      <span className="font-rdr-title tracking-wider text-base">
        A new version is available.
      </span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="cursor-pointer rdr-brush-btn font-rdr-title text-sm tracking-wider px-3.5 py-1"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="rdr-icon-btn cursor-pointer border border-[var(--rdr-border)] enabled:hover:border-[var(--rdr-crimson)] text-[var(--rdr-text-muted)] enabled:hover:text-[var(--rdr-on-crimson)] w-6 h-6 flex items-center justify-center text-xs leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
};

export default UpdatePrompt;
