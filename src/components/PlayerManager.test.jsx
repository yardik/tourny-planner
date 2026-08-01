import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PlayerManager from './PlayerManager';

vi.mock('../services/db', () => {
  return {
    default: {
      getPlayers: vi.fn().mockResolvedValue([
        { id: '1', name: 'John Doe', rank: 'A', isPaid: true },
        { id: '2', name: 'Jane Smith', rank: 'B', isPaid: false }
      ]),
      addPlayer: vi.fn().mockResolvedValue('new-id'),
      deletePlayer: vi.fn().mockResolvedValue()
    }
  };
});

describe('PlayerManager Component', () => {
  it('renders without crashing', () => {
    const players = [
      { id: '1', name: 'John Doe', rank: 'A', isPaid: true }
    ];
    render(<PlayerManager players={players} games={[]} />);
    expect(screen.getByText(/Register New Player/i)).toBeInTheDocument();
  });
});
