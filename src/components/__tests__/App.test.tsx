import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import App from '../App';
import * as prdrHelper from '../../helpers/prdr';
import * as imageConverter from '../../helpers/imageConverter';
import {
  buildPrdrBytes,
  createMinimalJpegBytes,
} from '../../helpers/__tests__/prdrFixtures';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

const makePrdrFile = (name: string, title = 'Grizzlies East'): File => {
  const bytes = buildPrdrBytes({
    headerLabel: 'PHOTO - 11/23/25 14:58:57',
    jpegBytes: createMinimalJpegBytes(),
    titleText: title,
    jsonText: JSON.stringify({ width: 1920, height: 1080, mode: 'SP' }),
  });
  return new File([bytes.slice()], name);
};

const getDropzoneInput = (): HTMLInputElement => {
  const dropText = screen.getByText(/click here to select prdr files/i);
  const root = dropText.closest('div') as HTMLDivElement;
  return root.querySelector('input') as HTMLInputElement;
};

const setupCanvasPngMock = () => {
  const originalCreateElement = document.createElement.bind(document);
  const toBlobSpy = vi.fn((cb: BlobCallback) =>
    cb(new Blob(['png'], { type: 'image/png' })),
  );

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas'
      ? ({
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
          toBlob: toBlobSpy,
        } as unknown as HTMLCanvasElement)
      : originalCreateElement(tag),
  );

  class MockImage {
    naturalWidth = 1920;
    naturalHeight = 1080;
    onload: (() => void) | null = null;
    set src(_value: string) {
      this.onload?.();
    }
  }
  globalThis.Image = MockImage as unknown as typeof Image;

  return toBlobSpy;
};

describe('App', () => {
  const OriginalImage = globalThis.Image;
  const originalMatchMedia = window.matchMedia;
  let urlCounter = 0;

  beforeEach(() => {
    urlCounter = 0;
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    window.matchMedia = originalMatchMedia;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:mock-${++urlCounter}`,
    );
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.Image = OriginalImage;
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('switches between Follow device (Auto), Dark, and Light themes and reacts to OS changes in Auto mode', async () => {
    let changeListener: ((event: MediaQueryListEvent) => void) | undefined;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: (
          _event: string,
          cb: (event: MediaQueryListEvent) => void,
        ) => {
          changeListener = cb;
        },
        removeEventListener: vi.fn(),
      }),
    });

    render(<App />);

    const autoBtn = screen.getByRole('button', {
      name: /follow device \(auto\)/i,
    });
    const darkBtn = screen.getByRole('button', { name: /^dark$/i });
    const lightBtn = screen.getByRole('button', { name: /^light$/i });

    expect(autoBtn).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.theme).toBe('light');

    // OS switches to dark while Auto is selected
    act(() => {
      changeListener?.({ matches: true } as MediaQueryListEvent);
    });
    expect(document.documentElement.dataset.theme).toBe('dark');

    // Switch explicitly to Light
    await userEvent.click(lightBtn);
    expect(lightBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rdr2-prdr-theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    // Switch explicitly to Dark
    await userEvent.click(darkBtn);
    expect(darkBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rdr2-prdr-theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    // Return to Follow device (Auto)
    await userEvent.click(autoBtn);
    expect(autoBtn).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('rdr2-prdr-theme')).toBe('auto');
  });

  it('renders header, path hints, and format/naming controls', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', {
        name: /rdr2 prdr to jpeg \/ png converter/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/documents\\rockstar games/i)).toBeInTheDocument();
    expect(screen.getByText(/citizenfx\\rdr2/i)).toBeInTheDocument();
  });

  it('ignores empty file drops', async () => {
    render(<App />);
    const input = getDropzoneInput();
    fireEvent.drop(input, {
      dataTransfer: { files: [], items: [], types: ['Files'] },
    });
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/photo ready/i)).not.toBeInTheDocument();
  });

  it('handles valid, invalid, and non-Error failures and dismisses error banner', async () => {
    render(<App />);
    const validFile = makePrdrFile('PRDR100');
    const invalidFile = new File(['bad'], 'bad.txt', { type: 'text/plain' });

    await userEvent.upload(getDropzoneInput(), [invalidFile, validFile]);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('bad.txt');
    expect(screen.getByText('PRDR100.jpg')).toBeInTheDocument();
    expect(screen.getByText('1 photo ready.')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Dismiss errors' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    vi.spyOn(prdrHelper, 'parsePrdrFile').mockRejectedValueOnce(
      'raw string fail',
    );
    await userEvent.upload(getDropzoneInput(), [validFile]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'raw string fail',
    );
  });

  it('switches output format and naming mode and caches PNG conversions', async () => {
    const toBlobSpy = setupCanvasPngMock();
    const downloadSpy = vi.spyOn(imageConverter, 'triggerFileDownload');

    render(<App />);
    await userEvent.upload(getDropzoneInput(), [makePrdrFile('PRDR100')]);

    // Download single JPEG
    await userEvent.click(
      await screen.findByRole('button', { name: 'Download .JPG' }),
    );
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(expect.any(File), 'PRDR100.jpg');
    });

    // Switch to PNG + metadata naming
    await userEvent.click(screen.getByRole('button', { name: 'PNG' }));
    await userEvent.click(
      screen.getByRole('button', { name: /date & location/i }),
    );
    expect(
      screen.getByText('2025-11-23_14-58-57_Grizzlies_East_PRDR100.png'),
    ).toBeInTheDocument();

    // First PNG download encodes once
    await userEvent.click(screen.getByRole('button', { name: 'Download .PNG' }));
    await waitFor(() => {
      expect(toBlobSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenLastCalledWith(
        expect.any(File),
        '2025-11-23_14-58-57_Grizzlies_East_PRDR100.png',
      );
    });

    // Second PNG download reuses cache
    await userEvent.click(screen.getByRole('button', { name: 'Download .PNG' }));
    await waitFor(() => {
      expect(toBlobSpy).toHaveBeenCalledTimes(1);
      expect(downloadSpy).toHaveBeenCalledTimes(3);
    });

    // Switch back to JPEG + Original filename
    await userEvent.click(
      screen.getByRole('button', { name: /jpeg \( original\)/i }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: /original filename/i }),
    );
    expect(screen.getByText('PRDR100.jpg')).toBeInTheDocument();
  });

  it('handles ZIP batch downloads in JPEG and PNG modes, duplicate filenames, and partial cache', async () => {
    const toBlobSpy = setupCanvasPngMock();
    const downloadSpy = vi.spyOn(imageConverter, 'triggerFileDownload');

    render(<App />);
    await userEvent.upload(getDropzoneInput(), [
      makePrdrFile('PRDR_DUP', 'Valentine'),
      makePrdrFile('PRDR_DUP', 'Valentine'),
    ]);

    expect(await screen.findByText('2 photos ready.')).toBeInTheDocument();

    // Batch ZIP in JPEG mode
    await userEvent.click(
      screen.getByRole('button', { name: 'Download all (.zip)' }),
    );
    await waitFor(() => {
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        'RDR2-photos-jpeg.zip',
      );
    });

    // Switch to PNG, convert only the first card individually, then batch ZIP
    await userEvent.click(screen.getByRole('button', { name: 'PNG' }));
    const pngButtons = screen.getAllByRole('button', { name: 'Download .PNG' });
    await userEvent.click(pngButtons[0]);
    await waitFor(() => expect(toBlobSpy).toHaveBeenCalledTimes(1));

    await userEvent.click(
      screen.getByRole('button', { name: 'Download all (.zip)' }),
    );
    await waitFor(() => {
      expect(toBlobSpy).toHaveBeenCalledTimes(2);
      expect(downloadSpy).toHaveBeenLastCalledWith(
        expect.any(Blob),
        'RDR2-photos-png.zip',
      );
    });

    // Second batch ZIP uses cache for every item
    await userEvent.click(
      screen.getByRole('button', { name: 'Download all (.zip)' }),
    );
    await waitFor(() => {
      expect(toBlobSpy).toHaveBeenCalledTimes(2);
      expect(downloadSpy).toHaveBeenCalledTimes(4);
    });
  });

  it('surfaces errors during single and ZIP downloads and shows zipping indicator', async () => {
    let resolvePending!: (blob: Blob) => void;
    const pendingPromise = new Promise<Blob>(resolve => {
      resolvePending = resolve;
    });

    vi.spyOn(imageConverter, 'resolveOutputFile')
      .mockRejectedValueOnce(new Error('PNG encode failed'))
      .mockImplementationOnce(() =>
        pendingPromise.then(blob => ({
          file: new File([blob], 'a.png', { type: 'image/png' }),
          pngBlob: blob,
        })),
      )
      .mockRejectedValueOnce(new Error('ZIP item failed'));

    render(<App />);
    await userEvent.upload(getDropzoneInput(), [
      makePrdrFile('PRDR_1'),
      makePrdrFile('PRDR_2'),
    ]);

    // Single download error
    const jpgButtons = await screen.findAllByRole('button', {
      name: 'Download .JPG',
    });
    await userEvent.click(jpgButtons[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'PNG encode failed',
    );

    // Deferred ZIP shows "Creating ZIP..." then errors on second item
    await userEvent.click(
      screen.getByRole('button', { name: 'Download all (.zip)' }),
    );
    expect(
      screen.getByRole('button', { name: 'Creating ZIP...' }),
    ).toBeDisabled();
    resolvePending(new Blob(['ok']));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ZIP item failed',
    );
  });

  it('removes individual photos, clears all photos, and revokes preview URLs on unmount', async () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const { unmount } = render(<App />);

    await userEvent.upload(getDropzoneInput(), [
      makePrdrFile('PRDR_A'),
      makePrdrFile('PRDR_B'),
      makePrdrFile('PRDR_C'),
    ]);

    await screen.findByText('3 photos ready.');
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove PRDR_A.jpg' }),
    );
    expect(screen.getByText('2 photos ready.')).toBeInTheDocument();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-1');

    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByText(/photos ready/i)).not.toBeInTheDocument();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-2');
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-3');

    await userEvent.upload(getDropzoneInput(), [makePrdrFile('PRDR_D')]);
    await screen.findByText('1 photo ready.');
    unmount();
    expect(revokeSpy).toHaveBeenCalledWith('blob:mock-4');
  });
});
