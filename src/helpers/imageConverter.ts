import {
  buildOutputFileName,
  NamingMode,
  OutputFormat,
  ParsedPrdr,
} from './prdr';

export const convertJpegBlobToPng = (jpegBlob: Blob): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(jpegBlob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error('Failed to create 2D canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob => {
          URL.revokeObjectURL(url);
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to encode PNG image'));
          }
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode JPEG image'));
    };

    img.src = url;
  });

export const resolveOutputFile = async (
  parsed: ParsedPrdr,
  format: OutputFormat,
  namingMode: NamingMode,
  cachedPngBlob?: Blob,
): Promise<{ file: File; pngBlob?: Blob }> => {
  const fileName = buildOutputFileName(parsed, format, namingMode);
  if (format === 'jpeg') {
    return {
      file: new File([parsed.jpegBlob], fileName, { type: 'image/jpeg' }),
      pngBlob: cachedPngBlob,
    };
  }
  const pngBlob =
    cachedPngBlob ?? (await convertJpegBlobToPng(parsed.jpegBlob));
  return {
    file: new File([pngBlob], fileName, { type: 'image/png' }),
    pngBlob,
  };
};

export const triggerFileDownload = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const deduplicateFileName = (
  fileName: string,
  usedNames: Set<string>,
): string => {
  if (!usedNames.has(fileName)) {
    usedNames.add(fileName);
    return fileName;
  }
  const dotIndex = fileName.lastIndexOf('.');
  const stem = dotIndex !== -1 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex !== -1 ? fileName.slice(dotIndex) : '';
  let suffix = 2;
  while (usedNames.has(`${stem}_${suffix}${ext}`)) {
    suffix++;
  }
  const uniqueName = `${stem}_${suffix}${ext}`;
  usedNames.add(uniqueName);
  return uniqueName;
};
