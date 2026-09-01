/** 模型单价表：单位为分 / 百万 token（cents per 1M tokens），价格依据 docs/官方API分发机制调研与开发方案.md */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'glm-4.7-flash': { input: 0, output: 0 },
  'glm-4-flash': { input: 0, output: 0 },
  'glm-4v-flash': { input: 0, output: 0 },
  'glm-5': { input: 400, output: 1800 },
  'deepseek-v4-flash': { input: 100, output: 200 },
  'deepseek-v4-pro': { input: 300, output: 600 },
};

export function lookupModelPrice(model: string): { input: number; output: number } | null {
  return MODEL_PRICES[model] ?? null;
}

/** 未知模型按 0 成本记账（可在 usage_logs 中结合 estimated 字段人工对账） */
export function costCents(model: string, promptTokens: number, completionTokens: number): number {
  const price = MODEL_PRICES[model];
  if (!price || (price.input === 0 && price.output === 0)) {
    return 0;
  }
  return Math.ceil((promptTokens * price.input + completionTokens * price.output) / 1_000_000);
}
