import { vi } from 'vitest';
import {
  convertJpegBlobToPng,
  deduplicateFileName,
  resolveOutputFile,
  triggerFileDownload,
} from '../imageConverter';
import { ParsedPrdr } from '../prdr';

const makeParsed = (): ParsedPrdr => ({
  originalName: 'PRDR100',
  jpegBlob: new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9])], {
    type: 'image/jpeg',
  }),
  metadata: {
    jpegSize: 6,
    fileTimestamp: '2025-11-23_14-58-57',
    title: 'Heartlands',
  },
});

describe('convertJpegBlobToPng', () => {
  const OriginalImage = globalThis.Image;
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    globalThis.Image = OriginalImage;
    vi.restoreAllMocks();
  });

  it('converts a JPEG blob to PNG via canvas and revokes object URL', async () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-jpeg');

    const drawImage = vi.fn();
    const pngBlob = new Blob(['png-data'], { type: 'image/png' });
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage }),
      toBlob: vi.fn((cb: BlobCallback) => cb(pngBlob)),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
      tag === 'canvas'
        ? (fakeCanvas as unknown as HTMLCanvasElement)
        : originalCreateElement(tag),
    );

    class MockImage {
      naturalWidth = 1920;
      naturalHeight = 1080;
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image;

    const result = await convertJpegBlobToPng(makeParsed().jpegBlob);
    expect(result).toBe(pngBlob);
    expect(fakeCanvas.width).toBe(1920);
    expect(fakeCanvas.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-jpeg');
  });

  it('falls back to width/height when naturalWidth/naturalHeight are 0', async () => {
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-fallback');

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toBlob: vi.fn((cb: BlobCallback) =>
        cb(new Blob(['png'], { type: 'image/png' })),
      ),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeCanvas as unknown as HTMLCanvasElement,
    );

    class FallbackSizeImage {
      naturalWidth = 0;
      naturalHeight = 0;
      width = 640;
      height = 480;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    globalThis.Image = FallbackSizeImage as unknown as typeof Image;

    await convertJpegBlobToPng(makeParsed().jpegBlob);
    expect(fakeCanvas.width).toBe(640);
    expect(fakeCanvas.height).toBe(480);
  });

  it('rejects when 2D canvas context is unavailable', async () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:no-ctx');
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement);

    class OkImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    globalThis.Image = OkImage as unknown as typeof Image;

    await expect(convertJpegBlobToPng(makeParsed().jpegBlob)).rejects.toThrow(
      'Failed to create 2D canvas context',
    );
    expect(revokeSpy).toHaveBeenCalledWith('blob:no-ctx');
  });

  it('rejects when canvas.toBlob returns null or drawImage throws', async () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:null-blob');

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toBlob: vi.fn((cb: BlobCallback) => cb(null)),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(
      fakeCanvas as unknown as HTMLCanvasElement,
    );

    class OkImage {
      naturalWidth = 100;
      naturalHeight = 100;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    globalThis.Image = OkImage as unknown as typeof Image;

    await expect(convertJpegBlobToPng(makeParsed().jpegBlob)).rejects.toThrow(
      'Failed to encode PNG image',
    );
    expect(revokeSpy).toHaveBeenCalledWith('blob:null-blob');

    fakeCanvas.getContext.mockReturnValue({
      drawImage: vi.fn(() => {
        throw new Error('draw failure');
      }),
    });
    await expect(convertJpegBlobToPng(makeParsed().jpegBlob)).rejects.toThrow(
      'draw failure',
    );
  });

  it('rejects when the JPEG image fails to decode', async () => {
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bad-img');

    class BadImage {
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onerror?.();
      }
    }
    globalThis.Image = BadImage as unknown as typeof Image;

    await expect(convertJpegBlobToPng(makeParsed().jpegBlob)).rejects.toThrow(
      'Failed to decode JPEG image',
    );
    expect(revokeSpy).toHaveBeenCalledWith('blob:bad-img');
  });
});

describe('resolveOutputFile', () => {
  const OriginalImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = OriginalImage;
    vi.restoreAllMocks();
  });

  it('returns original JPEG file directly without canvas encoding', async () => {
    const parsed = makeParsed();
    const result = await resolveOutputFile(parsed, 'jpeg', 'original');
    expect(result.file.name).toBe('PRDR100.jpg');
    expect(result.file.type).toBe('image/jpeg');
    expect(result.pngBlob).toBeUndefined();
  });

  it('converts to PNG when requested and reuses cached PNG blob', async () => {
    const parsed = makeParsed();
    const cached = new Blob(['cached-png'], { type: 'image/png' });
    const fromCache = await resolveOutputFile(
      parsed,
      'png',
      'metadata',
      cached,
    );
    expect(fromCache.file.name).toBe('2025-11-23_14-58-57_Heartlands_PRDR100.png');
    expect(fromCache.pngBlob).toBe(cached);

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:conv');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const encodedPng = new Blob(['encoded'], { type: 'image/png' });
    vi.spyOn(document, 'createElement').mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toBlob: vi.fn((cb: BlobCallback) => cb(encodedPng)),
    } as unknown as HTMLCanvasElement);

    class OkImage {
      naturalWidth = 10;
      naturalHeight = 10;
      onload: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    globalThis.Image = OkImage as unknown as typeof Image;

    const fresh = await resolveOutputFile(parsed, 'png', 'original');
    expect(fresh.file.name).toBe('PRDR100.png');
    expect(fresh.pngBlob).toBe(encodedPng);
  });
});

describe('triggerFileDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an anchor element, clicks it, removes it, and revokes the URL', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dl');
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    triggerFileDownload(new Blob(['data']), 'photo.jpg');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:dl');
    expect(document.body.querySelector('a[download="photo.jpg"]')).toBeNull();
  });
});

describe('deduplicateFileName', () => {
  it('appends numeric suffixes when filenames collide, with or without extensions', () => {
    const used = new Set<string>();
    expect(deduplicateFileName('PRDR1.jpg', used)).toBe('PRDR1.jpg');
    expect(deduplicateFileName('PRDR1.jpg', used)).toBe('PRDR1_2.jpg');
    expect(deduplicateFileName('PRDR1.jpg', used)).toBe('PRDR1_3.jpg');
    expect(deduplicateFileName('README', used)).toBe('README');
    expect(deduplicateFileName('README', used)).toBe('README_2');
  });
});
