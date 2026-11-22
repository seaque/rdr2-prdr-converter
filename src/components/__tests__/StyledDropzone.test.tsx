import { render } from '@testing-library/react';
import { useDropzone } from 'react-dropzone';
import { vi } from 'vitest';
import StyledDropzone from '../StyledDropzone';

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(),
}));

const mockUseDropzone = useDropzone as unknown as ReturnType<typeof vi.fn>;

const baseDropzone = {
  getRootProps: vi.fn().mockReturnValue({}),
  getInputProps: vi.fn().mockReturnValue({}),
};

describe('StyledDropzone', () => {
  it('applies drag-accept styles when isDragAccept is true', () => {
    mockUseDropzone.mockReturnValue({ ...baseDropzone, isDragAccept: true });
    const { container } = render(
      <StyledDropzone onDrop={vi.fn()}>drop here</StyledDropzone>,
    );
    expect(container.firstChild).toHaveClass('rdr-dropzone-accept');
    expect(container.firstChild).not.toHaveClass('rdr-dropzone-default');
  });

  it('applies default and disabled styles appropriately', () => {
    mockUseDropzone.mockReturnValue({ ...baseDropzone, isDragAccept: false });
    const { container } = render(
      <StyledDropzone onDrop={vi.fn()} disabled>
        drop here
      </StyledDropzone>,
    );
    expect(container.firstChild).toHaveClass('rdr-dropzone-default');
    expect(container.firstChild).toHaveClass('opacity-60');
  });
});
