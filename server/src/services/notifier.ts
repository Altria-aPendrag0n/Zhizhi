export interface Notifier {
  send(to: string, code: string, channel: string): Promise<void>;
}

export class LogNotifier implements Notifier {
  async send(to: string, code: string, channel: string): Promise<void> {
    console.log('[verify-code]', JSON.stringify({ to, code, channel }));
  }
}

export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  switch (env.VERIFY_CODE) {
    case 'email':
    case 'sms':
      console.warn(`[notifier] VERIFY_CODE=${env.VERIFY_CODE} 通道尚未接入，MVP 阶段回退 LogNotifier`);
      return new LogNotifier();
    default:
      return new LogNotifier();
  }
}
