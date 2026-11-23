import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const USER_COLORS = [
  '#6C7BFF', // Indigo / Accent
  '#3DD68C', // Emerald
  '#FFB347', // Amber
  '#FF6B6B', // Coral Red
  '#A78BFA', // Purple
  '#F472B6', // Pink
  '#38BDF8', // Sky Blue
  '#FBBF24', // Warm Yellow
  '#34D399', // Mint
  '#FB7185', // Rose
] as const;

export function getRandomColor(): string {
  const index = Math.floor(Math.random() * USER_COLORS.length);
  return USER_COLORS[index];
}
