/**
 * Type declarations for Express Request extensions
 */

declare namespace Express {
  export interface Request {
    user?: {
      userId: string;
      email?: string;
      role?: string;
      organizationId?: string;
    };
  }
}
