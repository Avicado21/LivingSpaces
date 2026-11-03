/* Claude on Amazon Bedrock. The only module that touches AWS credentials.
   Uses the Bedrock InvokeModel client with US cross-region inference profiles
   (this account returns 404 for every model id on the bedrock-mantle endpoint). */
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { CAT } from '../shared/categories.js';

export const DEFAULTS = {
  region: 'us-east-1',
  haikuModel: 'us.anthropic.claude-haiku-5-5',
  sonnetModel: 'us.anthropic.claude-sonnet-5-5',
};

export function classifySystem(categories) {
  return `You classify a single photo of household furniture for livingSpaces, a roommate cost-splitting app.
The room can only hold these ${categories.length} categories. Answer with exactly one of them:

${categories.map(c => `- ${c}: ${CAT[c].definition}`).join('\n')}

Rules:
- If several items are visible, classify the most prominent one.
${categories.includes('chair') && categories.includes('couch') ? '- Count seats to separate chair from couch: one seat cushion is a chair.\n' : ''}- If nothing fits well, pick the closest category and give it a low score.
- scores are rough probabilities for every category and should sum to about 1.
- suggestedName is a short, plain item name of at most 4 words, for example "Grey linen sofa".
- reason is one short phrase (at most 15 words) about what you saw.`;
}

export function classifySchema(categories) {
  return {
    type: 'object',
    properties: {
      category: { type: 'string', enum: categories },
      scores: { type: 'object', properties: Object.fromEntries(categories.map(c => [c, { type: 'number' }])), required: categories, additionalProperties: false },
      suggestedName: { type: 'string' },
      reason: { type: 'string' },
    },
    required: ['category', 'scores', 'suggestedName', 'reason'],
    additionalProperties: false,
  };
}

export const CHAD_SYSTEM = `You are Chad, the roommate helper inside livingSpaces, an app roommates use to split shared furniture and bills.

What you do:
- Answer questions about the shared furniture and bills: who bought what, how much each person paid, purchase dates, who owes whom, and what something is worth now.
- Help settle small roommate disputes (chores, noise, guests, food, money) fairly and kindly, with one concrete next step.

How you answer:
- Use only facts from the household ledger below. If the ledger doesn't have the answer, say so; never invent items, prices or dates.
- When someone keeps an item at move-out, a fair default value is the purchase price minus about 20% a year of wear (at least 3 months), and the keeper pays each co-owner their share of that value.
- Keep it short: at most about 120 words. Plain sentences, optionally a few lines starting with "• ". You may wrap key names and amounts in **double asterisks**. No headings, tables or code.`;

/* Normalise Claude's scores to probabilities over the allowed categories. */
export function normaliseScores(categories, raw) {
  const scores = Object.fromEntries(categories.map(c => [c, Math.max(0, Math.min(1, Number(raw?.[c]) || 0))]));
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  for (const c of categories) scores[c] = Math.round((scores[c] / total) * 1000) / 1000;
  return scores;
}

export function createBedrockAI(opts = {}) {
  const cfg = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v)) };
  /* No built-in profile: an explicit one wins, otherwise the standard AWS
     chain (AWS_PROFILE, env keys, the "default" profile, SSO, ...). */
  const credentials = () => fromNodeProviderChain(cfg.profile ? { profile: cfg.profile } : {});
  const profileLabel = cfg.profile || process.env.AWS_PROFILE || 'default';
  const client = new AnthropicBedrock({ awsRegion: cfg.region, providerChainResolver: async () => credentials() });

  return {
    info: { region: cfg.region, profile: profileLabel, models: { classify: cfg.haikuModel, chat: cfg.sonnetModel } },

    async checkCredentials() {
      const c = await credentials()();
      return { expiration: c.expiration ? new Date(c.expiration).toISOString() : null };
    },

    async classify({ pngBase64, categories }) {
      const t0 = Date.now();
      const msg = await client.messages.create({
        model: cfg.haikuModel,
        max_tokens: 1024,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: classifySchema(categories) } },
        system: classifySystem(categories),
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: pngBase64 } },
          { type: 'text', text: 'Classify the furniture in this photo.' },
        ] }],
      });
      if (msg.stop_reason === 'refusal') throw Object.assign(new Error('Claude declined to classify this photo. Pick the category by hand.'), { code: 'refusal', http: 422 });
      const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
      let out;
      try { out = JSON.parse(text); } catch { throw Object.assign(new Error('The classifier returned unreadable output.'), { code: 'bad_output', http: 502 }); }
      return { raw: out, model: cfg.haikuModel, ms: Date.now() - t0, usage: { input: msg.usage?.input_tokens, output: msg.usage?.output_tokens } };
    },

    /* Yields { type: 'text', text } deltas, then { type: 'done', stopReason, usage }. */
    async *chat({ system, messages }) {
      await credentials()();
      const stream = client.messages.stream({ model: cfg.sonnetModel, max_tokens: 2048, output_config: { effort: 'low' }, system, messages });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield { type: 'text', text: event.delta.text };
      }
      const final = await stream.finalMessage();
      yield { type: 'done', stopReason: final.stop_reason, model: cfg.sonnetModel, usage: { input: final.usage?.input_tokens, output: final.usage?.output_tokens } };
    },
  };
}

/* One clear message per failure, for the UI. An expired or missing AWS session
   is the common case and says exactly how to fix it. */
export function explainError(err, profile = process.env.AWS_PROFILE || 'default') {
  if (err?.http && err.code) return { status: err.http, code: err.code, message: err.message };
  if (err?.http) return { status: err.http, code: 'bad_request', message: err.message };
  const credsProblem = ['CredentialsProviderError', 'ExpiredTokenException', 'TokenProviderError', 'ExpiredToken'].includes(err?.name);
  if (credsProblem || err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError)
    return { status: 401, code: 'aws_auth', message: `The AWS session for profile "${profile}" is expired or not authorized. Refresh it with: aws sso login --profile ${profile}, then try again.`, detail: String(err?.message || '').slice(0, 300) };
  if (err instanceof Anthropic.NotFoundError) return { status: 502, code: 'model_not_found', message: 'Bedrock could not find the configured model in this region.', detail: String(err.message).slice(0, 300) };
  if (err instanceof Anthropic.RateLimitError) return { status: 429, code: 'rate_limited', message: 'Bedrock is rate-limiting requests. Wait a few seconds and retry.' };
  if (err instanceof Anthropic.BadRequestError) return { status: 400, code: 'bedrock_bad_request', message: 'Bedrock rejected the request.', detail: String(err.message).slice(0, 300) };
  if (err instanceof Anthropic.APIConnectionError) return { status: 503, code: 'bedrock_unreachable', message: 'Could not reach Amazon Bedrock from this machine.' };
  if (err instanceof Anthropic.APIError) return { status: 502, code: 'bedrock_error', message: `Bedrock returned an error (${err.status ?? 'unknown'}).`, detail: String(err.message).slice(0, 300) };
  return { status: 500, code: 'server_error', message: 'Unexpected server error.', detail: String(err?.message || err).slice(0, 300) };
}
