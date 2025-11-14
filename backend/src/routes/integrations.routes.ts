import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

// In-memory Slack connection state by user
const slackConnected: Map<string, boolean> = new Map();

// GET /api/v1/integrations/slack/status (no auth required for sandbox)
router.get('/slack/status', (req, res) => {
  const userId = req.user?.userId || 'anon';
  const connected = slackConnected.get(userId) === true;
  res.json({ data: { connected } });
});

// GET /api/v1/integrations/slack/connect -> returns OAuth URL for Slack (no auth required for sandbox)
router.get('/slack/connect', (req, res) => {
  const clientId = process.env.SLACK_CLIENT_ID || '0000000000.0000000000';
  const scopes = encodeURIComponent('chat:write,channels:read,incoming-webhook');
  const backend =
    process.env.API_URL ||
    process.env.BACKEND_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    `${req.protocol}://${req.get('host')}`;
  const redirectUri = encodeURIComponent(`${backend}/api/v1/integrations/slack/callback`);
  const url = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}`;
  res.json({ data: { url } });
});

// Public callback endpoint typically lives on backend; for sandbox set connected=true and redirect to settings
router.get('/slack/callback', (req, res) => {
  const frontend = process.env.WEBSITE_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  // In real flow, exchange code for token. Here, mark connected for anonymous demo user
  const userId = 'anon';
  slackConnected.set(userId, true);
  res.redirect(`${frontend}/dashboard/settings?tab=security&slack=connected`);
});

export default router;
