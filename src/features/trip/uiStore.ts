import { create } from 'zustand';

/** Ephemeral sheet interaction only. Never trip phase, passenger, driver or credentials. */
interface TripUiState {
  sheetInteractionEnabled: boolean;
  setSheetInteractionEnabled: (enabled: boolean) => void;
}

export const useTripUiStore = create<TripUiState>((set) => ({
  sheetInteractionEnabled: true,
  setSheetInteractionEnabled: (sheetInteractionEnabled) => set({ sheetInteractionEnabled }),
}));
