import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import TournamentBrackets from './TournamentBrackets';

vi.mock('../services/db', () => {
  return {
    default: {
      getLocalActiveTournament: vi.fn().mockReturnValue({
        status: 'starting',
        teams: [
          { p1: { name: 'Player 1', rank: 'A' }, p2: { name: 'Player 2', rank: 'B' } },
          { p1: { name: 'Player 3', rank: 'A' }, p2: { name: 'Player 4', rank: 'B' } }
        ],
        rounds: [
          [ { id: 'g_0_0_1', team1Idx: 0, team2Idx: 1, score1: null, score2: null } ]
        ]
      }),
      subscribeActiveTournament: vi.fn((cb) => {
        cb();
        return () => {};
      }),
      saveActiveTournament: vi.fn().mockResolvedValue(),
      getBracketMethod: vi.fn().mockReturnValue('standard')
    }
  };
});

describe('TournamentBrackets Component', () => {
  it('renders tournament brackets', async () => {
    const tournament = {
      status: 'starting',
      teams: [],
      rounds: []
    };
    render(<TournamentBrackets players={[]} games={[]} tournament={tournament} onFinish={vi.fn()} />);
    
    // Check if the dashboard or some relevant text appears
    await waitFor(() => {
      expect(screen.getByText(/Starting Bracket/i)).toBeInTheDocument();
    });
  });
});
