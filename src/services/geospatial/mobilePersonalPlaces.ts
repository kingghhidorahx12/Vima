import Storage from 'expo-sqlite/kv-store';
import { createPersonalPlaces } from './personalPlaces.ts';

export const mobilePersonalPlaces = createPersonalPlaces(Storage);
