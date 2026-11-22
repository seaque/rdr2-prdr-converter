export const ERROR_FILE_TOO_SMALL =
  'Not a valid PRDR file (file too small)';

export const ERROR_INVALID_PRDR_FILE =
  'Not a valid PRDR file (no embedded JPEG found)';

export const PRDR_JPEG_CHUNK_OFFSET = 288;
export const PRDR_JPEG_OFFSET = 300;

export type OutputFormat = 'jpeg' | 'png';
export type NamingMode = 'original' | 'metadata';

export interface PrdrInGameTime {
  year?: number;
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  second?: number;
}

export interface PrdrMetadata {
  capturedAt?: string;
  fileTimestamp?: string;
  title?: string;
  description?: string;
  width?: number;
  height?: number;
  mode?: string;
  jpegSize: number;
  inGameTime?: PrdrInGameTime;
}

export interface ParsedPrdr {
  originalName: string;
  jpegBlob: Blob;
  metadata: PrdrMetadata;
}

const JPEG_SOI_FOURTH_BYTES = new Set([
  0xe0, 0xe1, 0xe2, 0xe3, 0xe8, 0xdb, 0xee,
]);
const JPEG_TAG = [0x4a, 0x50, 0x45, 0x47] as const;
const JFIF_MAGIC = [
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
] as const;
const JSON_TAG = [0x4a, 0x53, 0x4f, 0x4e] as const;
const TITL_TAG = [0x54, 0x49, 0x54, 0x4c] as const;
const DESC_TAG = [0x44, 0x45, 0x53, 0x43] as const;

export const hasJpegMagicAt = (bytes: Uint8Array, offset: number): boolean =>
  offset >= 0 &&
  offset + 4 <= bytes.length &&
  bytes[offset] === 0xff &&
  bytes[offset + 1] === 0xd8 &&
  bytes[offset + 2] === 0xff &&
  JPEG_SOI_FOURTH_BYTES.has(bytes[offset + 3]);

const isPlainImageFile = (bytes: Uint8Array): boolean =>
  (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
  (bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47);

const matchesSequenceAt = (
  bytes: Uint8Array,
  offset: number,
  needle: readonly number[],
): boolean => needle.every((value, idx) => bytes[offset + idx] === value);

const findByteSequence = (
  haystack: Uint8Array,
  needle: readonly number[],
  startIndex: number,
): number => {
  const limit = haystack.length - needle.length;
  for (let i = startIndex; i <= limit; i++) {
    let matched = true;
    for (let k = 0; k < needle.length; k++) {
      if (haystack[i + k] !== needle[k]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return i;
    }
  }
  return -1;
};

const findLastJpegEoi = (bytes: Uint8Array, startOffset: number): number => {
  for (let i = bytes.length - 2; i >= startOffset + 2; i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      return i + 2;
    }
  }
  return -1;
};

const sliceJpegToEoi = (
  bytes: Uint8Array,
  jpegStart: number,
): { jpegBytes: Uint8Array; endOffset: number } => {
  const eoiEnd = findLastJpegEoi(bytes, jpegStart);
  const endOffset = eoiEnd !== -1 ? eoiEnd : bytes.length;
  return {
    jpegBytes: bytes.slice(jpegStart, endOffset),
    endOffset,
  };
};

const sliceJpegFromChunk = (
  bytes: Uint8Array,
  tagOffset: number,
): { jpegBytes: Uint8Array; endOffset: number } => {
  const jpegStart = tagOffset + 12;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jpegLength = view.getUint32(tagOffset + 8, true);
  const endOffset = jpegStart + jpegLength;
  if (
    jpegLength >= 4 &&
    endOffset <= bytes.length &&
    bytes[endOffset - 2] === 0xff &&
    bytes[endOffset - 1] === 0xd9
  ) {
    return {
      jpegBytes: bytes.slice(jpegStart, endOffset),
      endOffset,
    };
  }
  return sliceJpegToEoi(bytes, jpegStart);
};

const extractJpeg = (
  bytes: Uint8Array,
): { jpegBytes: Uint8Array; endOffset: number } | null => {
  if (isPlainImageFile(bytes)) {
    return null;
  }
  if (hasJpegMagicAt(bytes, PRDR_JPEG_OFFSET)) {
    return matchesSequenceAt(bytes, PRDR_JPEG_CHUNK_OFFSET, JPEG_TAG)
      ? sliceJpegFromChunk(bytes, PRDR_JPEG_CHUNK_OFFSET)
      : sliceJpegToEoi(bytes, PRDR_JPEG_OFFSET);
  }
  const tagIdx = findByteSequence(bytes, JPEG_TAG, 4);
  if (tagIdx !== -1 && hasJpegMagicAt(bytes, tagIdx + 12)) {
    return sliceJpegFromChunk(bytes, tagIdx);
  }
  const jfifIdx = findByteSequence(bytes, JFIF_MAGIC, 16);
  if (jfifIdx !== -1) {
    return sliceJpegToEoi(bytes, jfifIdx);
  }
  return null;
};

const formatTimestamp = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): { capturedAt: string; fileTimestamp: string } => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = String(year).padStart(4, '0');
  const mm = pad(month);
  const dd = pad(day);
  const hh = pad(hour);
  const min = pad(minute);
  const sec = pad(second);
  return {
    capturedAt: `${yyyy}-${mm}-${dd} ${hh}:${min}:${sec}`,
    fileTimestamp: `${yyyy}-${mm}-${dd}_${hh}-${min}-${sec}`,
  };
};

const extractHeaderTimestamp = (
  bytes: Uint8Array,
): { capturedAt: string; fileTimestamp: string } | null => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const limit = Math.min(260, bytes.length - 1);
  let text = '';
  for (let i = 4; i < limit; i += 2) {
    const codeUnit = view.getUint16(i, true);
    if (codeUnit === 0) {
      break;
    }
    text += String.fromCharCode(codeUnit);
  }
  const match = text.match(
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2}):(\d{2})/,
  );
  if (!match) {
    return null;
  }
  const [, monthStr, dayStr, yearStr, hourStr, minStr, secStr] = match;
  const rawYear = Number(yearStr);
  const year = yearStr.length === 2 ? 2000 + rawYear : rawYear;
  return formatTimestamp(
    year,
    Number(monthStr),
    Number(dayStr),
    Number(hourStr),
    Number(minStr),
    Number(secStr),
  );
};

const readChunkString = (
  bytes: Uint8Array,
  tag: readonly number[],
  searchFrom: number,
): string | null => {
  const tagIdx = findByteSequence(bytes, tag, searchFrom);
  if (tagIdx === -1 || tagIdx + 8 > bytes.length) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkSize = view.getUint32(tagIdx + 4, true);
  const payloadStart = tagIdx + 8;
  const payloadEnd = Math.min(bytes.length, payloadStart + chunkSize);
  let nullIdx = payloadStart;
  while (nullIdx < payloadEnd && bytes[nullIdx] !== 0) {
    nullIdx++;
  }
  const value = new TextDecoder('utf-8')
    .decode(bytes.subarray(payloadStart, nullIdx))
    .trim();
  return value || null;
};

interface RawPrdrJson {
  width?: unknown;
  height?: unknown;
  mode?: unknown;
  creat?: unknown;
  time?: {
    year?: unknown;
    month?: unknown;
    day?: unknown;
    hour?: unknown;
    minute?: unknown;
    second?: unknown;
  };
}

const asFiniteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const asNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

const parseInGameTime = (
  raw: RawPrdrJson['time'],
): PrdrInGameTime | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const parsed: PrdrInGameTime = {
    year: asFiniteNumber(raw.year),
    month: asFiniteNumber(raw.month),
    day: asFiniteNumber(raw.day),
    hour: asFiniteNumber(raw.hour),
    minute: asFiniteNumber(raw.minute),
    second: asFiniteNumber(raw.second),
  };
  return Object.values(parsed).some(v => v !== undefined) ? parsed : undefined;
};

const formatEpochUtc = (
  epochSeconds: number,
): { capturedAt: string; fileTimestamp: string } => {
  const date = new Date(epochSeconds * 1000);
  return formatTimestamp(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
};

const extractMetadata = (
  bytes: Uint8Array,
  jpegSize: number,
  trailingSearchFrom: number,
): PrdrMetadata => {
  let timestamp = extractHeaderTimestamp(bytes);
  let width: number | undefined;
  let height: number | undefined;
  let mode: string | undefined;
  let inGameTime: PrdrInGameTime | undefined;

  const jsonText = readChunkString(bytes, JSON_TAG, trailingSearchFrom);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as RawPrdrJson;
      if (parsed && typeof parsed === 'object') {
        width = asFiniteNumber(parsed.width);
        height = asFiniteNumber(parsed.height);
        mode = asNonEmptyString(parsed.mode);
        inGameTime = parseInGameTime(parsed.time);
        const creat = asFiniteNumber(parsed.creat);
        if (!timestamp && creat !== undefined) {
          timestamp = formatEpochUtc(creat);
        }
      }
    } catch {
      // Ignore malformed JSON chunks while preserving the extracted image
    }
  }

  const title = readChunkString(bytes, TITL_TAG, trailingSearchFrom) ?? undefined;
  const description =
    readChunkString(bytes, DESC_TAG, trailingSearchFrom) ?? undefined;

  return {
    capturedAt: timestamp?.capturedAt,
    fileTimestamp: timestamp?.fileTimestamp,
    title,
    description,
    width,
    height,
    mode,
    jpegSize,
    inGameTime,
  };
};

export const parsePrdrFile = async (file: File): Promise<ParsedPrdr> => {
  if (file.size < PRDR_JPEG_OFFSET + 4) {
    throw new Error(ERROR_FILE_TOO_SMALL);
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const extracted = extractJpeg(bytes);
  if (!extracted) {
    throw new Error(ERROR_INVALID_PRDR_FILE);
  }

  const jpegBytes = extracted.jpegBytes.slice();
  const jpegBlob = new Blob([jpegBytes], { type: 'image/jpeg' });
  const metadata = extractMetadata(
    bytes,
    jpegBytes.byteLength,
    extracted.endOffset,
  );

  return {
    originalName: file.name,
    jpegBlob,
    metadata,
  };
};

export const sanitizeFileNameSegment = (value: string): string =>
  value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');

export const buildOutputFileName = (
  parsed: Pick<ParsedPrdr, 'originalName' | 'metadata'>,
  format: OutputFormat,
  namingMode: NamingMode,
): string => {
  const ext = format === 'png' ? 'png' : 'jpg';
  const baseName = parsed.originalName.replace(/\.prdr$/i, '');
  if (namingMode === 'original') {
    return `${baseName}.${ext}`;
  }
  const parts = [
    parsed.metadata.fileTimestamp,
    parsed.metadata.title ? sanitizeFileNameSegment(parsed.metadata.title) : '',
    baseName,
  ].filter(Boolean);
  return `${parts.join('_')}.${ext}`;
};
