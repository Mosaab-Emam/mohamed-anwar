/**
 * AES-GCM encryption for the portable PDF library.
 * Key is derived deterministically so the same folder can be decrypted on any device
 * (creator or consumer app) without storing a secret.
 *
 * Consumer app contract: same key derivation (SHA256 of "mohamed-anwar-pdf-library-v1")
 * and same format: combined = nonce (12 bytes) + ciphertext + tag (16 bytes).
 */

import {
  CryptoDigestAlgorithm,
  CryptoEncoding,
  digestStringAsync,
  getRandomBytes,
} from "expo-crypto"
import { gcm } from "@noble/ciphers/aes.js"

const KEY_DERIVATION_SALT = "mohamed-anwar-pdf-library-v1"
const NONCE_LENGTH = 12
const GCM_TAG_LENGTH = 16

let cachedKey: Uint8Array | null = null

/**
 * Derives the 256-bit AES key from the fixed salt.
 * Cached so we only hash once per process.
 */
async function getLibraryKey(): Promise<Uint8Array> {
  if (cachedKey != null) return cachedKey
  const hex = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256 as CryptoDigestAlgorithm,
    KEY_DERIVATION_SALT,
    { encoding: CryptoEncoding.HEX as CryptoEncoding },
  )
  const key = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    key[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  cachedKey = key
  return key
}

/**
 * Encrypts plaintext with AES-256-GCM. Output format: nonce (12 bytes) + ciphertext + tag (16 bytes).
 */
export async function encryptBytes(plaintext: Uint8Array): Promise<Uint8Array> {
  const key = await getLibraryKey()
  const nonce = getRandomBytes(NONCE_LENGTH)
  const cipher = gcm(key, nonce)
  const ciphertextWithTag = cipher.encrypt(plaintext)
  const combined = new Uint8Array(nonce.length + ciphertextWithTag.length)
  combined.set(nonce, 0)
  combined.set(ciphertextWithTag, nonce.length)
  return combined
}

/**
 * Decrypts data produced by encryptBytes. Expects: nonce (12 bytes) + ciphertext + tag (16 bytes).
 */
export async function decryptBytes(combined: Uint8Array): Promise<Uint8Array> {
  if (combined.length < NONCE_LENGTH + GCM_TAG_LENGTH) {
    throw new Error("pdfLibraryCrypto: combined length too short")
  }
  const key = await getLibraryKey()
  const nonce = combined.subarray(0, NONCE_LENGTH)
  const ciphertextWithTag = combined.subarray(NONCE_LENGTH)
  const cipher = gcm(key, nonce)
  return cipher.decrypt(ciphertextWithTag)
}
