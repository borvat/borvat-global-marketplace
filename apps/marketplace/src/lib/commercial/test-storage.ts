/** Browser-local test storage for the isolated shop. Never a server, WMS or Accounting store. */
export type ShopStorage = { read(): string | null; write(value: string): void; clear(): void };
export const TEST_STORAGE_KEY = "borvat.isolated-test-shop.v1";

export function browserTestStorage(): ShopStorage | null {
  try {
    const store = window.localStorage;
    return {
      read: () => store.getItem(TEST_STORAGE_KEY),
      write: (value) => store.setItem(TEST_STORAGE_KEY, value),
      clear: () => store.removeItem(TEST_STORAGE_KEY),
    };
  } catch {
    return null;
  }
}

export function memoryTestStorage(
  initial: string | null = null,
): ShopStorage & { value: string | null } {
  const box = {
    value: initial,
    read: () => box.value,
    write: (value: string) => {
      box.value = value;
    },
    clear: () => {
      box.value = null;
    },
  };
  return box;
}
