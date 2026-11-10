import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// OWASP scrypt baseline. Fixed parameters also bound work for corrupt DB hashes.
const prefix = '$scrypt$131072$8$1$';
const pattern = /^\$scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const dummy = `${prefix}${'0'.repeat(32)}$${'0'.repeat(64)}`;
const unpairedSurrogate = /[\uD800-\uDFFF]/u;
let running = 0;
export class PasswordBusyError extends Error {}

export function validNewPassword(value: string): boolean {
  return (
    [...value].length >= 15 &&
    [...value].length <= 128 &&
    !unpairedSurrogate.test(value) &&
    Buffer.byteLength(value, 'utf8') <= 512
  );
}

async function derive(password: string, salt: string): Promise<Buffer> {
  if (running >= 2) throw new PasswordBusyError();
  running++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(
        password,
        Buffer.from(salt, 'hex'),
        32,
        { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
        (error, key) => (error ? reject(error) : resolve(key)),
      );
    });
  } finally {
    running--;
  }
}

export async function hashPassword(password: string): Promise<string> {
  if (!validNewPassword(password)) throw new Error('Invalid password length');
  const salt = randomBytes(16).toString('hex');
  return `${prefix}${salt}$${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null,
): Promise<boolean> {
  if (
    Buffer.byteLength(password, 'utf8') > 512 ||
    unpairedSurrogate.test(password)
  )
    return false;
  const match = pattern.exec(stored ?? '') ?? pattern.exec(dummy)!;
  const key = await derive(password, match[1]!);
  return (
    timingSafeEqual(key, Buffer.from(match[2]!, 'hex')) &&
    stored !== null &&
    pattern.test(stored)
  );
}
