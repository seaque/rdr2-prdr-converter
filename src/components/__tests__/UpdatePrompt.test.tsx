import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { useRegisterSW } from 'virtual:pwa-register/react';
import UpdatePrompt from '../UpdatePrompt';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: vi.fn(),
}));

const mockUpdateServiceWorker = vi.fn();
const mockSetNeedRefresh = vi.fn();
const mockUseRegisterSW = vi.mocked(useRegisterSW);

describe('UpdatePrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when no update is available', () => {
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [false, mockSetNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: mockUpdateServiceWorker,
    });
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the prompt and handles Update and Dismiss actions', async () => {
    mockUseRegisterSW.mockReturnValue({
      needRefresh: [true, mockSetNeedRefresh],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: mockUpdateServiceWorker,
    });

    render(<UpdatePrompt />);
    expect(screen.getByText(/a new version is available/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /update/i }));
    expect(mockUpdateServiceWorker).toHaveBeenCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(mockSetNeedRefresh).toHaveBeenCalledWith(false);
  });
});
