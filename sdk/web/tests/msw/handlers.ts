import { rest, delay } from 'msw';

export const state = {
  lastAuctionBody: null as any,
};

export const handlers = [
  rest.post('*/auction', async (req, res, ctx) => {
    try {
      const json = await req.json();
      state.lastAuctionBody = json as any;
    } catch {
      // ignore
    }
    return res(
      ctx.status(200),
      ctx.json({
        requestId: 'req-123',
        fill: true,
        price: 1.23,
        currency: 'USD',
        creative: { id: 'cr-1', html: '<div>Ad</div>' },
        ttlSeconds: 30,
      })
    );
  }),
];

export const timeoutHandler = rest.post('*/auction', async (_req, res, ctx) => {
  await delay(5000);
  return res(ctx.status(200), ctx.json({ requestId: 'late', fill: false }));
});
