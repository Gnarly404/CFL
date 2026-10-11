import { loadQueue } from '@/review/queue.js';
import { setAttentionBadge } from './attention-badge.js';

export async function refreshWritingAttention(instructorId) {
  try {
    const { items } = await loadQueue(instructorId);
    setAttentionBadge('writing-review', items.filter((item) => !item.feedback).length);
  } catch (error) {
    console.warn('Could not load the writing review attention count', error?.code ?? error);
    setAttentionBadge('writing-review', 0);
  }
}