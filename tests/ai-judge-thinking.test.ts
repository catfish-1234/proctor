import { describe, it, expect, vi } from 'vitest';

// Models that think return a thinking block before the answer. The verdict must come from the
// text block, wherever it sits, and a refusal must stay the fail-safe "not a cheat".
let response: { stop_reason?: string; content: Array<Record<string, unknown>> } = { content: [] };
const seen: Array<{ max_tokens: number; model?: string; output_config?: unknown }> = [];

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: (args: { max_tokens: number; model?: string; output_config?: unknown }) => {
        seen.push(args);
        return Promise.resolve(response);
      },
    };
  },
}));

const { createAnthropicJudge, DEFAULT_JUDGE_MODEL } = await import('../src/ai/judge.js');
const ask = () => createAnthropicJudge('k', 'm').judge({ verifierId: 'RH004', diffExcerpt: 'x', explanation: 'r' });

describe('AI judge on models that think', () => {
  it('reads the verdict from the text block after a thinking block', async () => {
    response = { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'YES' }] };
    await expect(ask()).resolves.toBe(true);
  });

  it('leaves room for thinking before the answer', async () => {
    response = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'NO' }] };
    await ask();
    expect(seen.at(-1)!.max_tokens).toBeGreaterThanOrEqual(1024);
  });

  it('treats a refusal as not a cheat', async () => {
    response = { stop_reason: 'refusal', content: [{ type: 'text', text: 'YES' }] };
    await expect(ask()).resolves.toBe(false);
  });

  it('treats a reply with no text block as not a cheat', async () => {
    response = { stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }] };
    await expect(ask()).resolves.toBe(false);
  });

  it('defaults to the current Haiku, run at low effort', async () => {
    expect(DEFAULT_JUDGE_MODEL).toBe('claude-haiku-5-5');
    response = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'NO' }] };
    await createAnthropicJudge('k', DEFAULT_JUDGE_MODEL).judge({ verifierId: 'RH004', diffExcerpt: 'x', explanation: 'r' });
    expect(seen.at(-1)).toMatchObject({ model: 'claude-haiku-5-5', output_config: { effort: 'low' } });
  });

  it('sends a configured model without an effort setting, which older models reject', async () => {
    response = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'NO' }] };
    await createAnthropicJudge('k', 'claude-haiku-4-5-20251001').judge({ verifierId: 'RH004', diffExcerpt: 'x', explanation: 'r' });
    expect(seen.at(-1)).not.toHaveProperty('output_config');
  });
});
