'use strict';

const PROVIDERS = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    compatibility: 'openai',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'gpt-4o', label: 'GPT-4o', inputPerMillion: 2.50, outputPerMillion: 10.00 },
      { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini', inputPerMillion: 0.40, outputPerMillion: 1.60 },
      { id: 'gpt-4.1', label: 'GPT-4.1', inputPerMillion: 2.00, outputPerMillion: 8.00 },
    ],
  },
  google: {
    id: 'google',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.5-flash',
    compatibility: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyPlaceholder: 'AIza...',
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', inputPerMillion: 0.30, outputPerMillion: 2.50 },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', inputPerMillion: 1.25, outputPerMillion: 10.00 },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    compatibility: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1/messages',
    keyPlaceholder: 'sk-ant-...',
    models: [
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', inputPerMillion: 1.00, outputPerMillion: 5.00 },
      { id: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', inputPerMillion: 3.00, outputPerMillion: 15.00 },
      { id: 'claude-opus-4-1-20250805', label: 'Claude Opus 4.1', inputPerMillion: 15.00, outputPerMillion: 75.00 },
    ],
    aliases: {
      'claude-3-5-haiku-latest': 'claude-haiku-4-5-20251001',
      'claude-3-5-sonnet-latest': 'claude-sonnet-4-5-20250929',
      'claude-3-opus-latest': 'claude-opus-4-1-20250805',
      'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
      'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
      'claude-opus-4-1': 'claude-opus-4-1-20250805',
    },
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-v4-flash',
    compatibility: 'openai',
    baseUrl: 'https://api.deepseek.com/chat/completions',
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', inputPerMillion: 0.14, outputPerMillion: 0.28 },
      { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', inputPerMillion: 0.55, outputPerMillion: 2.19 },
    ],
    aliases: {
      'deepseek-chat': 'deepseek-v4-flash',
      'deepseek-reasoner': 'deepseek-v4-pro',
    },
  },
  xai: {
    id: 'xai',
    label: 'xAI / Grok',
    defaultModel: 'grok-4.3',
    compatibility: 'openai',
    baseUrl: 'https://api.x.ai/v1/chat/completions',
    keyPlaceholder: 'xai-...',
    models: [
      { id: 'grok-4.3', label: 'Grok 4.3', inputPerMillion: 3.00, outputPerMillion: 15.00 },
      { id: 'grok-4.3-fast', label: 'Grok 4.3 Fast', inputPerMillion: 0.60, outputPerMillion: 3.00 },
      { id: 'grok-4', label: 'Grok 4 Vision', inputPerMillion: 3.00, outputPerMillion: 15.00 },
    ],
    aliases: {
      'grok-3': 'grok-4.3',
      'grok-3-mini': 'grok-4.3-fast',
      'grok-2-vision': 'grok-4',
    },
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.1-8b-instant',
    compatibility: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
    keyPlaceholder: 'gsk_...',
    models: [
      { id: 'allam-2-7b', label: 'Allam 2 7B', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'canopylabs/orpheus-arabic-saudi', label: 'Orpheus Arabic Saudi', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'canopylabs/orpheus-v1-english', label: 'Orpheus V1 English', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'groq/compound', label: 'Groq Compound', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'groq/compound-mini', label: 'Groq Compound Mini', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', inputPerMillion: 0.05, outputPerMillion: 0.08 },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', inputPerMillion: 0.59, outputPerMillion: 0.79 },
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B 16E Instruct', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'meta-llama/llama-prompt-guard-2-22m', label: 'Llama Prompt Guard 2 22M', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'meta-llama/llama-prompt-guard-2-86m', label: 'Llama Prompt Guard 2 86M', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'openai/gpt-oss-120b', label: 'GPT OSS 120B', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'openai/gpt-oss-20b', label: 'GPT OSS 20B', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'openai/gpt-oss-safeguard-20b', label: 'GPT OSS Safeguard 20B', inputPerMillion: 0.15, outputPerMillion: 0.60 },
      { id: 'qwen/qwen3-32b', label: 'Qwen3 32B', inputPerMillion: 0.15, outputPerMillion: 0.60 },
    ],
  },
};

const cloneProvider = (p) => ({
  id: p.id,
  label: p.label,
  default_model: p.defaultModel,
  compatibility: p.compatibility,
  key_placeholder: p.keyPlaceholder,
  models: p.models.map(({ id, label }) => ({ id, label })),
});

function listProviders() {
  return Object.values(PROVIDERS).map(cloneProvider);
}

function listModels(providerId = null) {
  const providers = providerId ? [getProvider(providerId)].filter(Boolean) : Object.values(PROVIDERS);
  return providers.flatMap((provider) => provider.models.map((model) => ({ id: model.id, label: model.label, provider: provider.id })));
}

function getProvider(providerId) {
  return PROVIDERS[String(providerId || '').toLowerCase()] || null;
}

function resolveProviderModel(provider, modelId) {
  if (!provider || !modelId) return null;
  const model = String(modelId);
  return provider.models.some((m) => m.id === model) ? model : (provider.aliases?.[model] || null);
}

function normalizeProviderModel(providerId, modelId) {
  const provider = getProvider(providerId);
  return resolveProviderModel(provider, modelId);
}

function getProviderForModel(modelId) {
  const model = String(modelId || '');
  return Object.values(PROVIDERS).find((provider) => resolveProviderModel(provider, model)) || null;
}

function getDefaultModel(providerId) {
  return getProvider(providerId)?.defaultModel || null;
}

function isModelAllowedForProvider(providerId, modelId) {
  return Boolean(normalizeProviderModel(providerId, modelId));
}

function normalizeAllowedModels(value) {
  if (!value) return ['all'];
  if (Array.isArray(value)) return value.length ? value : ['all'];
  if (value === 'all') return ['all'];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeAllowedModels(parsed);
    } catch {
      return [value];
    }
  }
  return ['all'];
}

function normalizeUsage(body = {}) {
  const usage = body.usage || {};
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage.total_tokens ?? (promptTokens + completionTokens)) || 0;
  return { promptTokens, completionTokens, totalTokens };
}

function estimateCostUsd(providerId, modelId, promptTokens = 0, completionTokens = 0, totalTokens = 0) {
  const provider = getProvider(providerId);
  const resolvedModel = normalizeProviderModel(providerId, modelId) || modelId;
  const model = provider?.models.find((m) => m.id === resolvedModel) || provider?.models.find((m) => m.id === provider.defaultModel);
  const inputPerMillion = Number(model?.inputPerMillion ?? 0.15);
  const outputPerMillion = Number(model?.outputPerMillion ?? 0.60);
  const effectivePrompt = promptTokens || totalTokens;
  return Number((((effectivePrompt / 1_000_000) * inputPerMillion) + ((completionTokens / 1_000_000) * outputPerMillion)).toFixed(6));
}

function messageContentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text') return part.text || '';
      return '';
    }).filter(Boolean).join('\n');
  }
  return content ? JSON.stringify(content) : '';
}

function toAnthropicContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return messageContentToText(content);
  const blocks = content.map((part) => {
    if (typeof part === 'string') return { type: 'text', text: part };
    if (part?.type === 'text') return { type: 'text', text: part.text || '' };
    if (part?.type === 'image_url' && part.image_url?.url) {
      return { type: 'image', source: { type: 'url', url: part.image_url.url } };
    }
    return null;
  }).filter(Boolean);
  return blocks.length ? blocks : '';
}

function toAnthropicPayload(payload = {}, model) {
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const system = messages.filter((m) => m.role === 'system').map((m) => messageContentToText(m.content)).filter(Boolean).join('\n\n');
  const anthropicMessages = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: toAnthropicContent(m.content) }));
  const body = {
    model,
    max_tokens: Number(payload.max_tokens || 1024),
    ...(system ? { system } : {}),
    messages: anthropicMessages.length ? anthropicMessages : [{ role: 'user', content: '' }],
    ...(payload.temperature !== undefined ? { temperature: payload.temperature } : {}),
    ...(payload.stop ? { stop_sequences: Array.isArray(payload.stop) ? payload.stop : [payload.stop] } : {}),
  };
  if (payload.temperature === undefined && payload.top_p !== undefined) body.top_p = payload.top_p;
  return body;
}

function normalizeAnthropicResponse(body = {}) {
  const text = (body.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('');
  const inputTokens = Number(body.usage?.input_tokens || 0);
  const outputTokens = Number(body.usage?.output_tokens || 0);
  return {
    id: body.id,
    model: body.model,
    choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: body.stop_reason || 'stop' }],
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    raw: body,
  };
}

function normalizeGoogleResponse(body = {}) {
  const usageMetadata = body?.usageMetadata || {};
  return {
    choices: [{ message: { content: body?.candidates?.[0]?.content?.parts?.[0]?.text || '' } }],
    usage: {
      prompt_tokens: Number(usageMetadata.promptTokenCount || 0),
      completion_tokens: Number(usageMetadata.candidatesTokenCount || 0),
      total_tokens: Number(usageMetadata.totalTokenCount || 0),
    },
    raw: body,
  };
}

function toOpenAICompatiblePayload(payload = {}, model) {
  return Object.fromEntries(Object.entries({ ...payload, model, stream: false }).filter(([, value]) => value !== undefined));
}

async function callProvider({ provider, apiKey, payload = {}, model }) {
  if (provider.compatibility === 'google') {
    const text = (payload.messages || []).map((m) => m.content).join('\n') || '';
    const geminiBody = { contents: [{ role: 'user', parts: [{ text }] }] };
    return fetch(`${provider.baseUrl}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });
  }

  if (provider.compatibility === 'anthropic') {
    return fetch(provider.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(toAnthropicPayload(payload, model)),
    });
  }

  return fetch(provider.baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(toOpenAICompatiblePayload(payload, model)),
  });
}

function normalizeProviderResponse(provider, body, ok) {
  if (!ok) return body || {};
  if (provider.compatibility === 'google') return normalizeGoogleResponse(body);
  if (provider.compatibility === 'anthropic') return normalizeAnthropicResponse(body);
  return body || {};
}

module.exports = {
  PROVIDERS,
  listProviders,
  listModels,
  getProvider,
  getProviderForModel,
  getDefaultModel,
  normalizeProviderModel,
  isModelAllowedForProvider,
  normalizeAllowedModels,
  normalizeUsage,
  estimateCostUsd,
  callProvider,
  normalizeProviderResponse,
};
