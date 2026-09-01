import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { channels, type Channel } from '../db/schema.js';
import { decryptSecret } from './secret-box.js';

export interface ChannelCandidate {
  id: string;
  name: string;
  base_url: string;
  apiKey: string;
  groupTag: string;
}

/** 逗号分隔的模型列表解析；'*' 表示通配全部模型 */
export function parseChannelModels(models: string): string[] {
  return models
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function channelSupportsModel(channel: Pick<Channel, 'models'>, model: string): boolean {
  const list = parseChannelModels(channel.models);
  return list.includes('*') || list.includes(model);
}

export function channelMatchesGroup(channel: Pick<Channel, 'group_tag'>, group: string): boolean {
  return channel.group_tag === '*' || channel.group_tag === group;
}

/** 加权随机不放回排序：weight 越大越靠前被选中，作为故障转移候选序列 */
export function orderChannelsByWeight<T extends { weight: number }>(rows: T[], rng: () => number = Math.random): T[] {
  const pool = [...rows];
  const ordered: T[] = [];
  while (pool.length > 0) {
    const total = pool.reduce((sum, row) => sum + Math.max(1, row.weight), 0);
    let roll = rng() * total;
    let picked = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= Math.max(1, pool[i].weight);
      if (roll <= 0) {
        picked = i;
        break;
      }
    }
    ordered.push(pool[picked]);
    pool.splice(picked, 1);
  }
  return ordered;
}

/** 按模型与用户分组筛选启用渠道并解密上游 Key，返回故障转移候选序列 */
export async function resolveChannelCandidates(model: string, group: string): Promise<ChannelCandidate[]> {
  const db = getDb();
  const rows = await db.select().from(channels).where(eq(channels.status, 1));
  const matched = rows.filter((row) => channelSupportsModel(row, model) && channelMatchesGroup(row, group));
  return orderChannelsByWeight(matched).map((row) => ({
    id: row.id,
    name: row.name,
    base_url: row.base_url.replace(/\/+$/, ''),
    apiKey: decryptSecret(row.api_key_enc),
    groupTag: row.group_tag,
  }));
}
