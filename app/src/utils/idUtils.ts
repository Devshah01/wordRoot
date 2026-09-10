import * as Crypto from 'expo-crypto';

/**
 * Normalizes a word string for consistent hash key generation.
 */
export function normalizeWordString(rawWord: string): string {
  return rawWord.trim().toLowerCase().normalize('NFC');
}

/**
 * Generates a deterministic SHA-256 hex ID string for a word given a userId and raw word text.
 * Guarantee: The same userId + word string will ALWAYS generate the exact same 64-character ID
 * across iOS, Android, Web, and Server environments.
 */
export async function generateDeterministicWordId(
  userId: string | undefined | null,
  rawWord: string
): Promise<string> {
  const normalized = normalizeWordString(rawWord);
  const prefix = userId ? userId.trim() : 'local_guest';
  const canonicalString = `${prefix}:${normalized}`;

  return await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalString
  );
}
