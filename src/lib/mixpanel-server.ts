import { Buffer } from 'node:buffer';

type ServerEventProps = Record<string, any> & { distinct_id?: string };

const MIXPANEL_TOKEN = process.env.MIXPANEL_PROJECT_TOKEN || process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

const MIXPANEL_API_ENDPOINT = 'https://api.mixpanel.com/track';

export async function trackMixpanelServerEvent(event: string, properties: ServerEventProps = {}) {
  if (!MIXPANEL_TOKEN) return;

  const payload = {
    event,
    properties: {
      token: MIXPANEL_TOKEN,
      time: Date.now() / 1000,
      ...properties,
    },
  };

  const body = Buffer.from(JSON.stringify(payload)).toString('base64');

  try {
    const response = await fetch(MIXPANEL_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `data=${encodeURIComponent(body)}`,
    });

    if (!response.ok) {
      console.error('[Mixpanel] Failed to send server event', response.status, await response.text());
    }
  } catch (error) {
    console.error('[Mixpanel] Server event error:', error);
  }
}
