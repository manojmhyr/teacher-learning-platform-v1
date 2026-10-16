/**
 * Password hashing for the demo (no-backend) mode.
 *
 * Uses PBKDF2 via the Web Crypto API with a per-user random salt. This is NOT
 * what production uses — the real backend hashes with BCrypt/Argon2id in
 * Spring Security and the browser never sees a hash at all. It exists so the
 * demo never stores a plaintext password anywhere, even in local storage.
 */

const ITERATIONS = 150_000;

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256);
  return toHex(bits);
}

/** Returns `pbkdf2$<iterations>$<saltHex>$<hashHex>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `pbkdf2$${ITERATIONS}$${toHex(salt.buffer)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, , saltHex, expected] = stored.split('$');
  if (scheme !== 'pbkdf2' || !saltHex || !expected) return false;
  const actual = await derive(password, fromHex(saltHex));
  // Length-constant comparison.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export interface PasswordCheck {
  ok: boolean;
  errors: string[];
}

/**
 * Deliberately modest rules: length is what matters, and symbol requirements
 * mostly push people towards writing passwords on sticky notes.
 */
export function checkPasswordStrength(password: string, employeeId?: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < 10) errors.push('Use at least 10 characters.');
  if (/^\d+$/.test(password)) errors.push('Do not use digits only.');
  if (employeeId && password.toLowerCase().includes(employeeId.toLowerCase())) errors.push('Do not include your employee ID.');
  const common = ['password', 'teacher', '12345678', 'qwerty', 'welcome', 'school'];
  if (common.some((c) => password.toLowerCase().includes(c))) errors.push('Avoid common words such as "password" or "welcome".');
  return { ok: errors.length === 0, errors };
}

/** Generates a readable temporary password for an admin to hand over. */
export function generateTempPassword(): string {
  const words = ['maple', 'river', 'cobalt', 'lantern', 'harbour', 'willow', 'ember', 'quartz', 'meadow', 'cedar'];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${pick()}-${pick()}-${digits}`;
}
