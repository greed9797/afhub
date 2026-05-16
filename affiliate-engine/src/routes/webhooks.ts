import { Hono } from 'hono';
import { handleTelegramUpdate } from '../services/telegram.js';

const webhooks = new Hono();

webhooks.post('/telegram', async (c) => {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && c.req.header('x-telegram-bot-api-secret-token') !== expected) {
    return c.json({ error: 'Invalid Telegram secret.' }, 401);
  }
  await handleTelegramUpdate(await c.req.json());
  return c.json({ ok: true });
});

export default webhooks;
