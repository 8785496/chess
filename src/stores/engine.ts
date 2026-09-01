import { create } from 'zustand';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'busy' | 'error';

interface EngineState {
  status: EngineStatus;
  setStatus: (s: EngineStatus) => void;
}

export const useEngine = create<EngineState>((set) => ({
  status: 'idle',
  setStatus: (status) => set({ status }),
}));
