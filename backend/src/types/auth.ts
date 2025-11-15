export interface AuthTokenPayload {
  userId: string;
  publisherId: string;
  email: string;
  role?: 'admin' | 'publisher' | 'readonly';
}

export const isAuthTokenPayload = (value: unknown): value is AuthTokenPayload => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AuthTokenPayload>;

  return (
    typeof candidate.userId === 'string' &&
    typeof candidate.publisherId === 'string' &&
    typeof candidate.email === 'string'
  );
};
