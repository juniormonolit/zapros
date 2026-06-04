import "server-only";

import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(
  password: string,
  encryptedPassword: string,
): Promise<boolean> {
  return bcrypt.compare(password, encryptedPassword);
}
