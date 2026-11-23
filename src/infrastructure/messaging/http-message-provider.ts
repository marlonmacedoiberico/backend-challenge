import type { MessageProvider } from '../../application/ports.js';
import type { OutboundMessage, ProviderResult } from '../../domain/model.js';

export class HttpMessageProvider implements MessageProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5_000,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(message: OutboundMessage): Promise<ProviderResult> {
    try {
      const response = await this.fetcher(
        `${this.baseUrl.replace(/\/$/, '')}/messages`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'Idempotency-Key': message.idempotencyKey,
          },
          body: JSON.stringify({ to: message.to, text: message.text }),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (response.status === 200 || response.status === 202) {
        return { kind: 'accepted' };
      }
      if (response.status === 422) return { kind: 'rejected' };
      return { kind: 'retryable' };
    } catch {
      return { kind: 'retryable' };
    }
  }
}
