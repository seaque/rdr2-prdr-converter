import {
  buildOutputFileName,
  ERROR_FILE_TOO_SMALL,
  ERROR_INVALID_PRDR_FILE,
  hasJpegMagicAt,
  parsePrdrFile,
  sanitizeFileNameSegment,
} from '../prdr';
import { buildPrdrBytes, createMinimalJpegBytes } from './prdrFixtures';

describe('hasJpegMagicAt', () => {
  it('detects valid JPEG SOI headers and rejects invalid offsets or bytes', () => {
    const jpeg = createMinimalJpegBytes();
    expect(hasJpegMagicAt(jpeg, 0)).toBe(true);
    expect(hasJpegMagicAt(jpeg, -1)).toBe(false);
    expect(hasJpegMagicAt(jpeg, jpeg.length - 2)).toBe(false);

    const badByte0 = jpeg.slice();
    badByte0[0] = 0x00;
    expect(hasJpegMagicAt(badByte0, 0)).toBe(false);

    const badByte1 = jpeg.slice();
    badByte1[1] = 0x00;
    expect(hasJpegMagicAt(badByte1, 0)).toBe(false);

    const badByte2 = jpeg.slice();
    badByte2[2] = 0x00;
    expect(hasJpegMagicAt(badByte2, 0)).toBe(false);

    const badMarker = jpeg.slice();
    badMarker[3] = 0x99;
    expect(hasJpegMagicAt(badMarker, 0)).toBe(false);
  });
});

describe('parsePrdrFile', () => {
  it('parses a standard PRDR file, trims exact JPEG bytes, and extracts full metadata', async () => {
    const jpeg = createMinimalJpegBytes([0x11, 0x22, 0x33]);
    const jsonText = JSON.stringify({
      width: 1920,
      height: 1080,
      mode: 'SP',
      creat: 1763890137,
      time: {
        year: 1899,
        month: 2,
        day: 28,
        hour: 9,
        minute: 16,
        second: 36,
      },
    });
    const prdrBytes = buildPrdrBytes({
      jpegBytes: jpeg,
      bufferSize: 256,
      jsonText,
      titleText: 'Grizzlies East',
      descriptionText: 'Morning mist over the valley',
    });

    const file = new File([prdrBytes.slice()], 'PRDR3301126630_1');
    const parsed = await parsePrdrFile(file);

    expect(parsed.originalName).toBe('PRDR3301126630_1');
    expect(new Uint8Array(await parsed.jpegBlob.arrayBuffer())).toStrictEqual(
      jpeg,
    );
    expect(parsed.metadata).toStrictEqual({
      capturedAt: '2025-11-23 14:58:57',
      fileTimestamp: '2025-11-23_14-58-57',
      title: 'Grizzlies East',
      description: 'Morning mist over the valley',
      width: 1920,
      height: 1080,
      mode: 'SP',
      jpegSize: jpeg.length,
      inGameTime: {
        year: 1899,
        month: 2,
        day: 28,
        hour: 9,
        minute: 16,
        second: 36,
      },
    });
  });

  it('rejects files smaller than 304 bytes', async () => {
    const empty = new File([], 'empty');
    await expect(parsePrdrFile(empty)).rejects.toThrow(ERROR_FILE_TOO_SMALL);

    const small = new File([new Uint8Array(100)], 'small.bin');
    await expect(parsePrdrFile(small)).rejects.toThrow(ERROR_FILE_TOO_SMALL);
  });

  it('rejects plain JPEG and plain PNG files padded past 304 bytes', async () => {
    const plainJpeg = new Uint8Array(400);
    plainJpeg.set(createMinimalJpegBytes(), 0);
    await expect(
      parsePrdrFile(new File([plainJpeg], 'photo.jpg')),
    ).rejects.toThrow(ERROR_INVALID_PRDR_FILE);

    const plainPng = new Uint8Array(400);
    plainPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    await expect(
      parsePrdrFile(new File([plainPng], 'photo.png')),
    ).rejects.toThrow(ERROR_INVALID_PRDR_FILE);
  });

  it('rejects arbitrary binary files with partial image prefixes and no JPEG', async () => {
    const prefixes = [
      [0xff, 0x00, 0x00, 0x00],
      [0xff, 0xd8, 0x00, 0x00],
      [0x89, 0x00, 0x00, 0x00],
      [0x89, 0x50, 0x00, 0x00],
      [0x89, 0x50, 0x4e, 0x00],
    ];

    for (const prefix of prefixes) {
      const junk = new Uint8Array(400);
      junk.set(prefix, 0);
      await expect(
        parsePrdrFile(new File([junk], 'junk.bin')),
      ).rejects.toThrow(ERROR_INVALID_PRDR_FILE);
    }
  });

  it('extracts JPEG at offset 300 without JPEG chunk tag and trims at EOI or end', async () => {
    const jpeg = createMinimalJpegBytes();
    const withEoi = buildPrdrBytes({
      jpegBytes: jpeg,
      includeJpegTag: false,
      bufferSize: jpeg.length,
      trailingBytes: 32,
      includeJend: false,
    });
    // Put a false 0xFF byte without 0xD9 in trailing area to verify backward scan
    withEoi[withEoi.length - 5] = 0xff;
    withEoi[withEoi.length - 4] = 0x00;

    const parsedWithEoi = await parsePrdrFile(
      new File([withEoi.slice()], 'PRDR_NO_TAG'),
    );
    expect(
      new Uint8Array(await parsedWithEoi.jpegBlob.arrayBuffer()),
    ).toStrictEqual(jpeg);

    const jpegWithoutEoi = createMinimalJpegBytes().slice(0, -2);
    const withoutEoiBytes = buildPrdrBytes({
      jpegBytes: jpegWithoutEoi,
      includeJpegTag: false,
      bufferSize: jpegWithoutEoi.length,
      includeJend: false,
    });
    const parsedNoEoi = await parsePrdrFile(
      new File([withoutEoiBytes.slice()], 'PRDR_NO_EOI'),
    );
    expect(
      new Uint8Array(await parsedNoEoi.jpegBlob.arrayBuffer()),
    ).toStrictEqual(jpegWithoutEoi);
  });

  it('falls back to EOI trimming when JPEG chunk length metadata is invalid', async () => {
    const jpeg = createMinimalJpegBytes();

    const shortLen = buildPrdrBytes({
      jpegBytes: jpeg,
      overrideJpegLength: 2,
      includeJend: false,
    });
    expect(
      new Uint8Array(
        await (await parsePrdrFile(new File([shortLen], 'PRDR1'))).jpegBlob.arrayBuffer(),
      ),
    ).toStrictEqual(jpeg);

    const hugeLen = buildPrdrBytes({
      jpegBytes: jpeg,
      overrideJpegLength: 999999,
      includeJend: false,
    });
    expect(
      new Uint8Array(
        await (await parsePrdrFile(new File([hugeLen], 'PRDR2'))).jpegBlob.arrayBuffer(),
      ),
    ).toStrictEqual(jpeg);

    const badEndByte1 = buildPrdrBytes({
      jpegBytes: jpeg,
      overrideJpegLength: jpeg.length - 1,
      includeJend: false,
    });
    expect(
      new Uint8Array(
        await (await parsePrdrFile(new File([badEndByte1], 'PRDR3'))).jpegBlob.arrayBuffer(),
      ),
    ).toStrictEqual(jpeg);

    const badEndByte2 = jpeg.slice();
    badEndByte2[badEndByte2.length - 1] = 0xaa;
    const withBadEnd2 = buildPrdrBytes({
      jpegBytes: badEndByte2,
      bufferSize: badEndByte2.length,
      overrideJpegLength: badEndByte2.length,
      includeJend: false,
    });
    expect(
      new Uint8Array(
        await (await parsePrdrFile(new File([withBadEnd2], 'PRDR4'))).jpegBlob.arrayBuffer(),
      ),
    ).toStrictEqual(badEndByte2);
  });

  it('handles shifted JPEG chunk fallback and raw JFIF fallback', async () => {
    const jpeg = createMinimalJpegBytes();

    // Shifted JPEG chunk at offset 320 (JPEG data at 332)
    const shiftedChunk = buildPrdrBytes({
      jpegBytes: jpeg,
      jpegOffset: 332,
      includeJpegTag: true,
      bufferSize: jpeg.length,
    });
    const parsedShifted = await parsePrdrFile(
      new File([shiftedChunk.slice()], 'PRDR_SHIFTED'),
    );
    expect(
      new Uint8Array(await parsedShifted.jpegBlob.arrayBuffer()),
    ).toStrictEqual(jpeg);

    // False "JPEG" tag early in file without valid JPEG SOI after it, followed by raw JFIF
    const rawJfif = buildPrdrBytes({
      jpegBytes: jpeg,
      jpegOffset: 340,
      includeJpegTag: false,
      bufferSize: jpeg.length,
    });
    rawJfif[100] = 0x4a;
    rawJfif[101] = 0x50;
    rawJfif[102] = 0x45;
    rawJfif[103] = 0x47;
    const parsedJfif = await parsePrdrFile(
      new File([rawJfif.slice()], 'PRDR_JFIF'),
    );
    expect(
      new Uint8Array(await parsedJfif.jpegBlob.arrayBuffer()),
    ).toStrictEqual(jpeg);
  });

  it('handles 4-digit years, full header labels, creat epoch fallback, and JSON edge cases', async () => {
    const jpeg = createMinimalJpegBytes();

    // 4-digit year + full non-null-terminated 128-char UTF-16 header label
    const fourDigit = buildPrdrBytes({
      headerLabel: 'PHOTO - 01/05/2026 08:09:10',
      fillFullHeaderLabel: true,
      jpegBytes: jpeg,
      jsonText: JSON.stringify({
        width: 'invalid',
        height: Number.NaN,
        mode: '   ',
        time: {},
      }),
      descriptionText: '   ',
    });
    const parsed4Digit = await parsePrdrFile(
      new File([fourDigit.slice()], 'PRDR_4Y'),
    );
    expect(parsed4Digit.metadata.capturedAt).toBe('2026-01-05 08:09:10');
    expect(parsed4Digit.metadata.width).toBeUndefined();
    expect(parsed4Digit.metadata.height).toBeUndefined();
    expect(parsed4Digit.metadata.mode).toBeUndefined();
    expect(parsed4Digit.metadata.inGameTime).toBeUndefined();
    expect(parsed4Digit.metadata.description).toBeUndefined();

    // Missing header timestamp -> falls back to JSON creat UTC timestamp + non-object time
    const creatFallback = buildPrdrBytes({
      headerLabel: 'NO DATE HERE',
      jpegBytes: jpeg,
      jsonText: JSON.stringify({
        creat: 1704067200, // 2024-01-01 00:00:00 UTC
        time: 'invalid',
        mode: 'MP',
      }),
    });
    const parsedCreat = await parsePrdrFile(
      new File([creatFallback.slice()], 'PRDR_CREAT'),
    );
    expect(parsedCreat.metadata.capturedAt).toBe('2024-01-01 00:00:00');
    expect(parsedCreat.metadata.mode).toBe('MP');
    expect(parsedCreat.metadata.inGameTime).toBeUndefined();

    // Non-object JSON & malformed JSON & truncated chunk tag near EOF
    const nonObjectJson = buildPrdrBytes({
      headerLabel: 'NO DATE',
      jpegBytes: jpeg,
      jsonText: '123',
      includeJend: false,
    });
    const parsedNonObj = await parsePrdrFile(
      new File([nonObjectJson.slice()], 'PRDR_NONOBJ'),
    );
    expect(parsedNonObj.metadata.capturedAt).toBeUndefined();

    const malformedJson = buildPrdrBytes({
      headerLabel: 'NO DATE',
      jpegBytes: jpeg,
      jsonText: '{bad json',
      includeJend: false,
    });
    const withTruncatedTitl = new Uint8Array(malformedJson.length + 6);
    withTruncatedTitl.set(malformedJson, 0);
    withTruncatedTitl.set([0x54, 0x49, 0x54, 0x4c, 0x10, 0x00], malformedJson.length);
    const parsedMalformed = await parsePrdrFile(
      new File([withTruncatedTitl.slice()], 'PRDR_BADJSON'),
    );
    expect(parsedMalformed.metadata.title).toBeUndefined();
    expect(parsedMalformed.metadata.capturedAt).toBeUndefined();
  });

  it('reads non-null-terminated trailing chunks where payload fills chunkSize', async () => {
    const jpeg = createMinimalJpegBytes();
    const base = buildPrdrBytes({
      jpegBytes: jpeg,
      bufferSize: jpeg.length,
      includeJend: false,
    });
    const title = new TextEncoder().encode('Valentine');
    const chunk = new Uint8Array(8 + title.length);
    chunk.set([0x54, 0x49, 0x54, 0x4c], 0);
    new DataView(chunk.buffer).setUint32(4, title.length, true);
    chunk.set(title, 8);

    const combined = new Uint8Array(base.length + chunk.length);
    combined.set(base, 0);
    combined.set(chunk, base.length);

    const parsed = await parsePrdrFile(
      new File([combined.slice()], 'PRDR_EXACT_CHUNK'),
    );
    expect(parsed.metadata.title).toBe('Valentine');
  });
});

describe('sanitizeFileNameSegment & buildOutputFileName', () => {
  it('sanitizes unsafe characters and builds original or metadata filenames', () => {
    expect(sanitizeFileNameSegment('  New Austin: Armadillo / West?  ')).toBe(
      'New_Austin-_Armadillo_-_West-',
    );

    const base = {
      originalName: 'PRDR12345_1.PRDR',
      metadata: {
        jpegSize: 100,
        fileTimestamp: '2025-11-23_14-58-57',
        title: 'Grizzlies East',
      },
    };

    expect(buildOutputFileName(base, 'jpeg', 'original')).toBe(
      'PRDR12345_1.jpg',
    );
    expect(buildOutputFileName(base, 'png', 'original')).toBe(
      'PRDR12345_1.png',
    );
    expect(buildOutputFileName(base, 'jpeg', 'metadata')).toBe(
      '2025-11-23_14-58-57_Grizzlies_East_PRDR12345_1.jpg',
    );

    const noMeta = {
      originalName: 'PRDR999',
      metadata: { jpegSize: 100 },
    };
    expect(buildOutputFileName(noMeta, 'png', 'metadata')).toBe('PRDR999.png');
  });
});
