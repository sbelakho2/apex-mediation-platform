// middleware/auth.ts
// Authentication middleware

import { Request, Response, NextFunction } from 'express';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Implement JWT or session-based authentication
    // For now, expect Authorization: Bearer <token> header
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    
    const token = authHeader.substring(7);
    
    // TODO: Verify JWT token and extract user ID
    // For now, this is a placeholder
    
    // Attach user to request
    (req as any).user = {
      id: 'user_id_from_token', // TODO: Extract from verified JWT
    };
    
    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};
