import * as SecureStore from 'expo-secure-store';

const credentialKey = 'vima.session-credential';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

/** Never pass this value to SQLite, logs, query caches or a public environment variable. */
export const credentials = {
  read: () => SecureStore.getItemAsync(credentialKey, options),
  async write(credential: string) {
    if (!credential) throw new Error('An empty credential cannot be stored');
    await SecureStore.setItemAsync(credentialKey, credential, options);
  },
  clear: () => SecureStore.deleteItemAsync(credentialKey, options),
};
