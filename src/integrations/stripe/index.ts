import Stripe from "stripe";

export class StripeClient {
  private client: Stripe;
  private config: {
    privateKey: string;
  };

  constructor({ privateKey }: { privateKey?: string }) {
    // Prefer STRIPE_SECRET_KEY; fallback to STRIPE_PRIVATE_KEY for backward compatibility
    if (!privateKey) {
      privateKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_PRIVATE_KEY;
      if (!privateKey) {
        throw new Error("Stripe secret key is not set (STRIPE_SECRET_KEY)");
      }
    }

    this.config = {
      privateKey,
    };

    this.client = new Stripe(privateKey, {
      // Cloudflare Workers/Node fetch client
      httpClient: Stripe.createFetchHttpClient(),
    });
  }

  stripe() {
    return this.client;
  }

  privateKey() {
    return this.config.privateKey;
  }
}

export function newStripeClient({
  privateKey,
}: {
  privateKey?: string;
} = {}): StripeClient {
  return new StripeClient({
    privateKey,
  });
}
