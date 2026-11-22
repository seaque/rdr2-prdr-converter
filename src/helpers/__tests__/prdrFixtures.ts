export const createMinimalJpegBytes = (
  extraPayload: number[] = [],
): Uint8Array<ArrayBuffer> =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    ...extraPayload,
    0xff,
    0xd9,
  ]);

const writeAsciiTag = (
  target: Uint8Array,
  offset: number,
  tag: string,
): void => {
  for (let i = 0; i < 4; i++) {
    target[offset + i] = tag.charCodeAt(i);
  }
};

const makeChunk = (
  tag: string,
  text: string,
  bufferSize: number,
  nullTerminate = true,
): Uint8Array => {
  const encoded = new TextEncoder().encode(text);
  const payloadLen = Math.max(bufferSize, encoded.length);
  const chunk = new Uint8Array(8 + payloadLen);
  writeAsciiTag(chunk, 0, tag);
  new DataView(chunk.buffer).setUint32(4, payloadLen, true);
  chunk.set(encoded, 8);
  if (!nullTerminate && encoded.length < payloadLen) {
    chunk.fill(0x20, 8 + encoded.length);
  }
  return chunk;
};

export interface BuildPrdrOptions {
  headerLabel?: string;
  jpegBytes?: Uint8Array;
  jpegOffset?: number;
  includeJpegTag?: boolean;
  overrideJpegLength?: number;
  bufferSize?: number;
  trailingBytes?: number;
  jsonText?: string;
  titleText?: string;
  descriptionText?: string;
  includeJend?: boolean;
  fillFullHeaderLabel?: boolean;
}

export const buildPrdrBytes = (
  options: BuildPrdrOptions = {},
): Uint8Array<ArrayBuffer> => {
  const {
    headerLabel = 'PHOTO - 11/23/25 14:58:57',
    jpegBytes = createMinimalJpegBytes(),
    jpegOffset = 300,
    includeJpegTag = true,
    overrideJpegLength,
    bufferSize = jpegBytes.length + 16,
    trailingBytes = 0,
    jsonText,
    titleText,
    descriptionText,
    includeJend = true,
    fillFullHeaderLabel = false,
  } = options;

  const chunks: Uint8Array[] = [];
  if (jsonText !== undefined) {
    chunks.push(makeChunk('JSON', jsonText, Math.max(64, jsonText.length + 8)));
  }
  if (titleText !== undefined) {
    chunks.push(makeChunk('TITL', titleText, Math.max(32, titleText.length + 4)));
  }
  if (descriptionText !== undefined) {
    chunks.push(
      makeChunk(
        'DESC',
        descriptionText,
        Math.max(32, descriptionText.length + 4),
      ),
    );
  }
  if (includeJend) {
    const jend = new Uint8Array(4);
    writeAsciiTag(jend, 0, 'JEND');
    chunks.push(jend);
  }

  const chunkTotal = chunks.reduce((sum, c) => sum + c.length, 0);
  const dataRegionSize = Math.max(bufferSize, jpegBytes.length) + trailingBytes;
  const totalSize = jpegOffset + dataRegionSize + chunkTotal;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);

  // Version 4 (big-endian)
  view.setUint32(0, 4, false);

  // UTF-16LE header label at bytes 4..259
  const labelText = fillFullHeaderLabel
    ? headerLabel.padEnd(128, ' ')
    : headerLabel;
  for (let i = 0; i < labelText.length && 4 + i * 2 + 1 < 260; i++) {
    view.setUint16(4 + i * 2, labelText.charCodeAt(i), true);
  }

  if (includeJpegTag && jpegOffset >= 12) {
    const tagOffset = jpegOffset - 12;
    writeAsciiTag(out, tagOffset, 'JPEG');
    view.setUint32(tagOffset + 4, bufferSize, true);
    view.setUint32(
      tagOffset + 8,
      overrideJpegLength ?? jpegBytes.length,
      true,
    );
  }

  out.set(jpegBytes, jpegOffset);

  let cursor = jpegOffset + dataRegionSize;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }

  return out;
};
