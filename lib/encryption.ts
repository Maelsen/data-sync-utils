import crypto from 'crypto';

/**
 * Encryption utilities for securing hotel credentials
 * Uses AES-256-GCM for authenticated encryption
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits authentication tag
const KEY_LENGTH = 32; // 256 bits

// Validate encryption key on module load
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) {
  console.warn(
    'WARNING: ENCRYPTION_KEY is missing or invalid. ' +
    'It must be a 64-character hex string (32 bytes). ' +
    'Generate with: openssl rand -hex 32'
  );
}

let KEY_BUFFER: Buffer;
try {
  KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (KEY_BUFFER.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes (64 hex characters)`);
  }
} catch (error) {
  console.error('Failed to parse ENCRYPTION_KEY:', error);
  // Provide a dummy key for development (INSECURE!)
  KEY_BUFFER = Buffer.alloc(KEY_LENGTH);
}

/**
 * Encrypt a plaintext string
 * @param text - The plaintext to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData (all hex-encoded)
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty string');
  }

  try {
    // Generate random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, KEY_BUFFER, iv);

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - The encrypted string in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error('Cannot decrypt empty string');
  }

  try {
    // Parse the encrypted format
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format. Expected format: iv:authTag:encryptedData');
    }

    const [ivHex, authTagHex, encrypted] = parts;

    // Convert from hex to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Validate lengths
    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${iv.length}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTag.length}`);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY_BUFFER, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the text
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Hash a value for comparison (one-way)
 * Useful for comparing secrets without storing them in plaintext
 * @param value - The value to hash
 * @returns SHA-256 hash (hex-encoded)
 */
export function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Constant-time string comparison (prevents timing attacks)
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);

  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Generate a random encryption key (for initial setup)
 * @returns 64-character hex string (32 bytes)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Export utilities for testing
export const _test = {
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH,
  ALGORITHM,
};
