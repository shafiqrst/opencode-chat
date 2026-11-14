export class ModelRouter {
  constructor(config = {}) {
    this.providers = this.initProviders(config);
    this.currentIndex = 0;
    this.onFailoverCallback = config.onFailover || null;
    this.cooldowns = new Map(); // provider.id -> timestamp until cooldown expires
  }

  initProviders(config) {
    const list = [];

    // 0. Google Gemini (Free Generative AI API - High Reasoning, Vision & 1M Token Context)
    if (config.GEMINI_API_KEY) {
      list.push({
        id: 'gemini-flash',
        name: 'Google Gemini 2.0 Flash (Free)',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key: config.GEMINI_API_KEY,
        model: 'gemini-2.0-flash',
        priority: 0
      });
      list.push({
        id: 'gemini-1.5-flash',
        name: 'Google Gemini 1.5 Flash (Free)',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key: config.GEMINI_API_KEY,
        model: 'gemini-1.5-flash',
        priority: 0
      });
    }

    // 0.1 FreeLLMAPI / Local Unified Proxy (from video wVoWwo4P3BM)
    if (config.FREELLMAPI_BASE_URL || config.CUSTOM_PROXY_URL) {
      const proxyBase = (config.FREELLMAPI_BASE_URL || config.CUSTOM_PROXY_URL).replace(/\/$/, '');
      list.push({
        id: 'freellmapi-proxy',
        name: 'FreeLLMAPI Unified Gateway',
        url: proxyBase.endsWith('/chat/completions') ? proxyBase : `${proxyBase}/chat/completions`,
        key: config.FREELLMAPI_API_KEY || 'sk-freellmapi-local',
        model: config.FREELLMAPI_MODEL || 'claude-3-5-sonnet',
        priority: 0
      });
    }

    // 0.2 Cerebras (Ultra-Fast 2,000+ tokens/sec, 100% Free Developer Tier)
    if (config.CEREBRAS_API_KEY) {
      list.push({
        id: 'cerebras-llama70b',
        name: 'Cerebras (Llama 3.3 70B - 2000 t/s)',
        url: 'https://api.cerebras.ai/v1/chat/completions',
        key: config.CEREBRAS_API_KEY,
        model: 'llama3.3-70b',
        priority: 0
      });
    }

    // 1. Groq (Ultra-Fast LPUs - Verified Working)
    if (config.GROQ_API_KEY) {
      list.push({
        id: 'groq-qwen',
        name: 'Groq (Qwen 3.8 27B Coder)',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: config.GROQ_API_KEY,
        model: 'qwen/qwen3.8-27b',
        priority: 1
      });
      list.push({
        id: 'groq-gpt-oss',
        name: 'Groq (OpenAI GPT-OSS 120B)',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: config.GROQ_API_KEY,
        model: 'openai/gpt-oss-120b',
        priority: 2
      });
    }

    // 2. OpenRouter (Verified Free Models)
    if (config.OPENROUTER_API_KEY) {
      list.push({
        id: 'openrouter-nemotron',
        name: 'OpenRouter (Free Nemotron 3.5 Lightning)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'nvidia/nemotron-3.5-lightning:free',
        priority: 3
      });
      list.push({
        id: 'openrouter-nemotron-super',
        name: 'OpenRouter (Free Nemotron 3.5 Super)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'nvidia/nemotron-3.5-super-vl:free',
        priority: 4
      });
      list.push({
        id: 'openrouter-ernie',
        name: 'OpenRouter (Free Ernie 5.5 Flash)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'baidu/ernie-5.5-flash-preview:free',
        priority: 5
      });
    }

    // 3. NVIDIA NIM (Free DeepSeek V4.1 Flash)
    if (config.NVIDIA_API_KEY) {
      list.push({
        id: 'nvidia-nim',
        name: 'NVIDIA NIM (DeepSeek V4.1 Flash)',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        key: config.NVIDIA_API_KEY,
        model: 'deepseek-ai/deepseek-v4.1-flash',
        priority: 6
      });
    }

    // 4. DeepSeek Direct API (if configured)
    if (config.DEEPSEEK_API_KEY) {
      list.push({
        id: 'deepseek-direct',
        name: 'DeepSeek Direct API',
        url: 'https://api.deepseek.com/chat/completions',
        key: config.DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        priority: 7
      });
    }

    // 5. Local Ollama (Offline fallback)
    const ollamaUrl = config.OLLAMA_BASE_URL || 'http://localhost:11434/v1';
    list.push({
      id: 'local-ollama',
      name: 'Local Ollama (Offline)',
      url: `${ollamaUrl.replace(/\/$/, '')}/chat/completions`,
      key: 'ollama',
      model: config.OLLAMA_MODEL || 'qwen2.5-coder:7b',
      priority: 99
    });

    return list;
  }

  getActiveProviders() {
    return this.providers;
  }

  getCurrentProvider() {
    return this.providers[this.currentIndex % this.providers.length];
  }

  setProviderByName(nameOrId) {
    if (!nameOrId) return null;
    const norm = nameOrId.trim().toLowerCase();
    const idx = this.providers.findIndex(p => 
      p.name.toLowerCase().includes(norm) ||
      p.id.toLowerCase().includes(norm) ||
      p.model.toLowerCase().includes(norm)
    );
    if (idx !== -1) {
      this.currentIndex = idx;
      return this.providers[idx];
    }
    return null;
  }

  isProviderInCooldown(provider) {
    const expire = this.cooldowns.get(provider.id);
    if (!expire) return false;
    if (Date.now() >= expire) {
      this.cooldowns.delete(provider.id); // Cooldown expired, back to normal!
      return false;
    }
    return true;
  }

  getCooldownRemainingSeconds(provider) {
    const expire = this.cooldowns.get(provider.id);
    if (!expire) return 0;
    return Math.max(0, Math.ceil((expire - Date.now()) / 1000));
  }

  /**
   * Send chat completion with automatic failover and rate-limit reset tracking
   */
  async chatCompletion({ messages, tools, temperature = 0.2 }) {
    if (this.providers.length === 0) {
      throw new Error('No AI providers configured. Please set at least one API key in .env or run Ollama.');
    }

    let attempts = 0;
    const maxAttempts = this.providers.length;
    const errors = [];

    while (attempts < maxAttempts) {
      const provider = this.providers[this.currentIndex % this.providers.length];

      // If this provider is currently waiting out a cooldown, skip to next unless all are waiting
      if (this.isProviderInCooldown(provider) && attempts < maxAttempts - 1) {
        this.currentIndex = (this.currentIndex + 1) % this.providers.length;
        attempts++;
        continue;
      }

      try {
        const body = {
          model: provider.model,
          messages,
          temperature,
        };

        if (tools && tools.length > 0) {
          body.tools = tools;
          body.tool_choice = 'auto';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.key}`
        };

        if (provider.id.startsWith('openrouter')) {
          headers['HTTP-Referer'] = 'https://github.com/opencoder/kiln';
          headers['X-Title'] = 'Kiln Agent';
        }

        const response = await fetch(provider.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const status = response.status;
          const errorText = await response.text();

          // Check if rate limited (429) or server overloaded (503, 502, 504)
          if (status === 429 || status === 503 || status === 502 || status === 504) {
            let retrySeconds = 60; // default 60s window
            const retryHeader = response.headers.get('retry-after');
            const resetHeader = response.headers.get('x-ratelimit-reset');

            if (retryHeader) {
              const parsed = parseInt(retryHeader, 10);
              if (!isNaN(parsed) && parsed > 0) {
                retrySeconds = parsed;
              }
            } else if (resetHeader) {
              const resetTs = parseFloat(resetHeader);
              if (resetTs > 1000000000) {
                retrySeconds = Math.max(5, Math.ceil((resetTs * 1000 - Date.now()) / 1000));
              } else if (resetTs > 0) {
                retrySeconds = Math.ceil(resetTs);
              }
            }

            // Set cooldown expiration timestamp
            const expireAt = Date.now() + (retrySeconds * 1000);
            this.cooldowns.set(provider.id, expireAt);

            const resetTime = new Date(expireAt).toLocaleTimeString();
            const reason = status === 429 ? 'Rate Limit (429)' : `Server Overloaded (${status})`;
            errors.push(`${provider.name}: ${reason}`);

            if (this.onFailoverCallback) {
              this.onFailoverCallback({
                previous: provider,
                reason,
                status,
                retrySeconds,
                resetTime,
                next: this.providers[(this.currentIndex + 1) % this.providers.length]
              });
            }

            // Auto-advance to next provider
            this.currentIndex = (this.currentIndex + 1) % this.providers.length;
            attempts++;
            continue;
          }

          throw new Error(`HTTP ${status} from ${provider.name}: ${errorText.slice(0, 300)}`);
        }

        const data = await response.json();
        const choice = data.choices && data.choices[0];
        if (!choice) {
          throw new Error(`Malformed response from ${provider.name}: No choices returned.`);
        }

        return {
          content: choice.message.content || '',
          tool_calls: choice.message.tool_calls || [],
          providerUsed: provider.name,
          modelUsed: provider.model
        };

      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);

        // Handle network timeout / connection refused
        if (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
          if (this.onFailoverCallback) {
            this.onFailoverCallback({
              previous: provider,
              reason: err.name === 'AbortError' ? 'Timeout (60s)' : 'Connection Failed',
              next: this.providers[(this.currentIndex + 1) % this.providers.length]
            });
          }

          this.currentIndex = (this.currentIndex + 1) % this.providers.length;
          attempts++;
          continue;
        }

        if (attempts < maxAttempts - 1) {
          this.currentIndex = (this.currentIndex + 1) % this.providers.length;
          attempts++;
          continue;
        }

        throw new Error(`All providers failed:\n${errors.join('\n')}`);
      }
    }

    throw new Error(`All configured providers exhausted:\n${errors.join('\n')}`);
  }
}
