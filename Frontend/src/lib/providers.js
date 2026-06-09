export const FALLBACK_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', default_model: 'gpt-4o-mini', key_placeholder: 'sk-...', models: [{ id: 'gpt-4o-mini', label: 'GPT-4o mini' }, { id: 'gpt-4o', label: 'GPT-4o' }, { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' }, { id: 'gpt-4.1', label: 'GPT-4.1' }] },
  { id: 'google', label: 'Google Gemini', default_model: 'gemini-2.5-flash', key_placeholder: 'AIza...', models: [{ id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' }, { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }] },
  { id: 'anthropic', label: 'Anthropic', default_model: 'claude-3-5-haiku-latest', key_placeholder: 'sk-ant-...', models: [{ id: 'claude-3-5-haiku-latest', label: 'Claude 3.5 Haiku' }, { id: 'claude-3-5-sonnet-latest', label: 'Claude 3.5 Sonnet' }, { id: 'claude-3-opus-latest', label: 'Claude 3 Opus' }] },
  { id: 'deepseek', label: 'DeepSeek', default_model: 'deepseek-chat', key_placeholder: 'sk-...', models: [{ id: 'deepseek-chat', label: 'DeepSeek Chat' }, { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }] },
  { id: 'xai', label: 'xAI / Grok', default_model: 'grok-3', key_placeholder: 'xai-...', models: [{ id: 'grok-3', label: 'Grok 3' }, { id: 'grok-3-mini', label: 'Grok 3 Mini' }, { id: 'grok-2-vision', label: 'Grok 2 Vision' }] },
  { id: 'groq', label: 'Groq', default_model: 'llama-3.1-8b-instant', key_placeholder: 'gsk_...', models: [
    { id: 'allam-2-7b', label: 'Allam 2 7B' },
    { id: 'canopylabs/orpheus-arabic-saudi', label: 'Orpheus Arabic Saudi' },
    { id: 'canopylabs/orpheus-v1-english', label: 'Orpheus V1 English' },
    { id: 'groq/compound', label: 'Groq Compound' },
    { id: 'groq/compound-mini', label: 'Groq Compound Mini' },
    { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
    { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    { id: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B' },
    { id: 'meta-llama/llama-prompt-guard-2-22m', label: 'Llama Prompt Guard 22M' },
    { id: 'meta-llama/llama-prompt-guard-2-86m', label: 'Llama Prompt Guard 86M' },
    { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
    { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
    { id: 'openai/gpt-oss-safeguard-20b', label: 'GPT-OSS Safeguard 20B' },
    { id: 'qwen/qwen3-32b', label: 'Qwen 3 32B' },
  ] },
];

export const providerLabel = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.label || id || 'Unknown';
export const providerModels = (providers, id) => ((providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.models || []).map((m) => m.id);
export const providerPlaceholder = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.key_placeholder || 'sk-...';
export const providerDefaultModel = (providers, id) => (providers || FALLBACK_PROVIDERS).find((p) => p.id === id)?.default_model || providerModels(providers, id)[0] || 'gpt-4o-mini';

export function parseAllowedModels(value) {
  if (!value || value === 'all') return ['all'];
  if (Array.isArray(value)) return value.length ? value : ['all'];
  if (typeof value === 'string') {
    try { return parseAllowedModels(JSON.parse(value)); } catch { return [value]; }
  }
  return ['all'];
}
