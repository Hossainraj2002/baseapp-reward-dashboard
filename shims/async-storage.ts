type Value = string | null;

const AsyncStorage = {
  async getItem(key: string): Promise<Value> {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  },

  async clear(): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.clear();
  },
};

export default AsyncStorage;
