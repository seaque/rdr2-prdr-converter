import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import PhotoCard from '../PhotoCard';

describe('PhotoCard', () => {
  it('renders Story/Online/custom mode labels, optional metadata, in-game dates, and action buttons', async () => {
    const onDownload = vi.fn();
    const onRemove = vi.fn();

    const { rerender } = render(
      <PhotoCard
        previewUrl="blob:preview-1"
        outputFileName="PRDR1.jpg"
        metadata={{
          jpegSize: 204800,
          title: 'Valentine',
          description: 'Saloon dusk',
          capturedAt: '2025-11-23 14:58:57',
          width: 1920,
          height: 1080,
          mode: 'SP',
          inGameTime: {
            year: 1899,
            month: 2,
            day: 28,
            hour: 9,
            minute: 16,
            second: 36,
          },
        }}
        format="jpeg"
        busy={false}
        onDownload={onDownload}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText('PRDR1.jpg')).toBeInTheDocument();
    expect(screen.getByText('Valentine')).toBeInTheDocument();
    expect(screen.getByText('Saloon dusk')).toBeInTheDocument();
    expect(screen.getByText('2025-11-23 14:58:57')).toBeInTheDocument();
    expect(screen.getByText('In-game 1899-02-28')).toBeInTheDocument();
    expect(screen.getByText('1920×1080')).toBeInTheDocument();
    expect(screen.getByText('Story')).toBeInTheDocument();
    expect(screen.getByText('200 KB')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download .JPG' }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Download .JPG' }));
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove PRDR1.jpg' }),
    );
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);

    rerender(
      <PhotoCard
        previewUrl="blob:preview-2"
        outputFileName="PRDR2.png"
        metadata={{
          jpegSize: 500,
          mode: 'MP',
          inGameTime: { month: 2, day: 28 },
        }}
        format="png"
        busy={false}
        onDownload={onDownload}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('1 KB')).toBeInTheDocument();
    expect(screen.queryByText(/In-game/)).not.toBeInTheDocument();
    expect(screen.getByAltText('PRDR2.png')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download .PNG' }),
    ).toBeInTheDocument();

    rerender(
      <PhotoCard
        previewUrl="blob:preview-3"
        outputFileName="PRDR3.png"
        metadata={{
          jpegSize: 1024,
          mode: 'CUSTOM',
          inGameTime: { year: 1899, day: 28 },
        }}
        format="png"
        busy
        onDownload={onDownload}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText('CUSTOM')).toBeInTheDocument();
    expect(screen.queryByText(/In-game/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Download .PNG' }),
    ).toBeDisabled();

    rerender(
      <PhotoCard
        previewUrl="blob:preview-4"
        outputFileName="PRDR4.png"
        metadata={{
          jpegSize: 1024,
          inGameTime: { year: 1899, month: 2 },
        }}
        format="png"
        busy={false}
        onDownload={onDownload}
        onRemove={onRemove}
      />,
    );
    expect(screen.queryByText(/In-game/)).not.toBeInTheDocument();
  });
});
