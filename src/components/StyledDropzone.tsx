import { ReactNode } from 'react';
import { useDropzone } from 'react-dropzone';
import clsx from 'clsx';

interface StyledDropzoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  children: ReactNode;
}

const StyledDropzone = ({
  onDrop,
  disabled = false,
  children,
}: StyledDropzoneProps) => {
  const { getRootProps, getInputProps, isDragAccept } = useDropzone({
    onDrop,
    disabled,
  });

  const cornerClass = isDragAccept
    ? 'rdr-dropzone-corner-accept'
    : 'rdr-dropzone-corner';

  return (
    <div
      {...getRootProps()}
      className={clsx(
        'group relative cursor-pointer border px-8 py-9 transition-all select-none rdr-dropzone focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rdr-crimson-bright)]',
        disabled && 'opacity-60 cursor-not-allowed',
        isDragAccept ? 'rdr-dropzone-accept' : 'rdr-dropzone-default',
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 transition-colors',
          cornerClass,
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 transition-colors',
          cornerClass,
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 transition-colors',
          cornerClass,
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          'pointer-events-none absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 transition-colors',
          cornerClass,
        )}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[var(--rdr-crimson)]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[var(--rdr-crimson)]"
      />
      <input {...getInputProps()} />
      {children}
    </div>
  );
};

export default StyledDropzone;
