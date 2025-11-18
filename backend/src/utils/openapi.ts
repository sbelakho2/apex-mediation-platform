import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { OpenAPIObject } from 'openapi3-ts/dist/model/openapi30';
import { loginSchema, registerSchema, refreshSchema } from '../controllers/auth.controller';
import { AuctionRequestSchema } from '../schemas/rtb';

let cachedDoc: OpenAPIObject | null = null;

export function getOpenAPIDocument(): OpenAPIObject {
  if (cachedDoc) return cachedDoc;

  const registry = new OpenAPIRegistry();

  const API_VERSION = process.env.API_VERSION || 'v1';
  const base = `/api/${API_VERSION}`;

  // Register schemas
  const LoginBody = registry.register('LoginRequest', loginSchema);
  const RegisterBody = registry.register('RegisterRequest', registerSchema);
  const RefreshBody = registry.register('RefreshRequest', refreshSchema);
  const AuctionBody = registry.register('AuctionRequest', AuctionRequestSchema);

  // Paths
  // Auth/session + CSRF
  registry.registerPath({
    method: 'get',
    path: `${base}/auth/csrf`,
    tags: ['auth'],
    responses: { 200: { description: 'CSRF token issued (cookie + body)' } },
  });

  registry.registerPath({
    method: 'get',
    path: `${base}/auth/me`,
    tags: ['auth'],
    responses: { 200: { description: 'Current session user' }, 401: { description: 'Unauthorized' } },
  });

  registry.registerPath({
    method: 'post',
    path: `${base}/auth/logout`,
    tags: ['auth'],
    responses: { 200: { description: 'Logged out' } },
  });
  registry.registerPath({
    method: 'post',
    path: `${base}/auth/login`,
    tags: ['auth'],
    request: { body: { content: { 'application/json': { schema: LoginBody } } } },
    responses: {
      200: { description: 'Logged in' },
      401: { description: 'Unauthorized' },
      400: { description: 'Validation error' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: `${base}/auth/register`,
    tags: ['auth'],
    request: { body: { content: { 'application/json': { schema: RegisterBody } } } },
    responses: {
      201: { description: 'Registered' },
      409: { description: 'Conflict' },
      400: { description: 'Validation error' },
    },
  });

  registry.registerPath({
    method: 'post',
    path: `${base}/auth/refresh`,
    tags: ['auth'],
    request: { body: { content: { 'application/json': { schema: RefreshBody } } } },
    responses: {
      200: { description: 'Refreshed' },
      401: { description: 'Unauthorized' },
      400: { description: 'Validation error' },
    },
  });

  // RTB: Auction endpoint (protected)
  registry.registerPath({
    method: 'post',
    path: `${base}/rtb/bid`,
    tags: ['rtb'],
    request: { body: { content: { 'application/json': { schema: AuctionBody } } } },
    responses: {
      200: { description: 'Auction response (win)', },
      204: { description: 'No bid' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
    },
  });

  // RTB: Creative delivery (public)
  registry.registerPath({
    method: 'get',
    path: `/creative`,
    tags: ['rtb'],
    parameters: [
      {
        in: 'query',
        name: 'token',
        required: true,
        schema: { type: 'string' },
        description: 'Signed delivery token',
      },
    ],
    responses: {
      302: { description: 'Redirect to asset' },
      400: { description: 'Invalid token' },
    },
  });

  // RTB: Tracking endpoints (public)
  for (const ev of ['imp', 'click'] as const) {
    registry.registerPath({
      method: 'get',
      path: `/t/${ev}`,
      tags: ['rtb'],
      parameters: [
        {
          in: 'query',
          name: 'token',
          required: true,
          schema: { type: 'string' },
          description: 'Signed tracking token',
        },
      ],
      responses: ev === 'imp'
        ? { 204: { description: 'Tracked' }, 400: { description: 'Invalid token' } }
        : { 302: { description: 'Redirect after click' }, 400: { description: 'Invalid token' } },
    });
  }

  const generator = new OpenApiGeneratorV3(registry.definitions);
  const doc = generator.generateDocument({
    openapi: '3.0.0',
    info: {
      title: 'ApexMediation API',
      version: '1.0.0',
      description: 'OpenAPI specification generated from Zod schemas',
    },
    servers: [{ url: '/' }],
  });

  cachedDoc = doc;
  return doc;
}
