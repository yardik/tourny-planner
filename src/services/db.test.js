import { describe, it, expect, vi, beforeEach } from 'vitest';
import db from './db';
import { doc, getDoc, setDoc } from 'firebase/firestore';

vi.mock('firebase/firestore', () => {
  return {
    getFirestore: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    collection: vi.fn(),
    getDocs: vi.fn(),
    onSnapshot: vi.fn()
  };
});

vi.mock('./firebase.config.local', () => {
  return {
    default: {
      apiKey: "test",
      projectId: "test"
    }
  };
});

describe('Database Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('instantiates correctly', () => {
    expect(db).toBeDefined();
  });


});
