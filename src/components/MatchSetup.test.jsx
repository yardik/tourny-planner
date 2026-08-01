import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MatchSetup from './MatchSetup';

vi.mock('../services/db', () => {
  return {
    default: {
      getPlayers: vi.fn().mockResolvedValue([]),
      getTournamentMethod: vi.fn().mockReturnValue('standard'),
      saveActiveTournament: vi.fn().mockResolvedValue(),
      getLocalMatchSetup: vi.fn().mockReturnValue(null),
      saveMatchSetup: vi.fn()
    }
  };
});

describe('MatchSetup Component', () => {
  it('renders without crashing', async () => {
    render(<MatchSetup players={[]} onComplete={vi.fn()} isAnonymous={false} />);
    await waitFor(() => {
      expect(screen.getByText(/Teams Setup/i)).toBeInTheDocument();
    });
  });
});
