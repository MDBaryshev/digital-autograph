import { expect, it } from 'vitest';
import { hashPassword, verifyPassword, validNewPassword } from './password';
it('salts each password, handles Unicode and never trims or truncates passwords', async () => {
  const password = '  долгий пароль 🔐  ';
  const a = await hashPassword(password);
  const b = await hashPassword(password);
  expect(a).not.toBe(b);
  expect(a).not.toContain(password);
  expect(await verifyPassword(password, a)).toBe(true);
  expect(await verifyPassword(password.trim(), a)).toBe(false);
  expect(await verifyPassword('a different password', a)).toBe(false);
  expect(await verifyPassword(password, null)).toBe(false);
  expect(await verifyPassword(password, '$scrypt$999999999$8$1$bad')).toBe(
    false,
  );
});
it('requires 15–128 characters without arbitrary composition rules', () => {
  expect(validNewPassword('x'.repeat(14))).toBe(false);
  expect(validNewPassword('x'.repeat(15))).toBe(true);
  expect(validNewPassword('🦊'.repeat(128))).toBe(true);
  expect(validNewPassword('x'.repeat(129))).toBe(false);
  expect(validNewPassword('x'.repeat(15) + '\uD800')).toBe(false);
});
