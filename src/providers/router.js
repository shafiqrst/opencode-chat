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

    // 1. Groq (Ultra-Fast LPUs - Verified Working for tool-calling & reasoning)
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
        id: 'groq-gpt-20b',
        name: 'Groq (OpenAI GPT-OSS 20B)',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: config.GROQ_API_KEY,
        model: 'openai/gpt-oss-20b',
        priority: 2
      });
      list.push({
        id: 'groq-gpt-oss',
        name: 'Groq (OpenAI GPT-OSS 120B)',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        key: config.GROQ_API_KEY,
        model: 'openai/gpt-oss-120b',
        priority: 3
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
        priority: 4
      });
      list.push({
        id: 'openrouter-gemma-31b',
        name: 'OpenRouter (Free Google Gemma 4 31B)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'google/gemma-4-31b-it:free',
        priority: 5
      });
      list.push({
        id: 'openrouter-gemma-26b',
        name: 'OpenRouter (Free Google Gemma 4 26B)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'google/gemma-4-26b-a4b-it:free',
        priority: 6
      });
      list.push({
        id: 'openrouter-nemotron-super',
        name: 'OpenRouter (Free Nemotron 3.5 Super)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'nvidia/nemotron-3.5-super-vl:free',
        priority: 7
      });
      list.push({
        id: 'openrouter-ernie',
        name: 'OpenRouter (Free Ernie 5.5 Flash)',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: config.OPENROUTER_API_KEY,
        model: 'baidu/ernie-5.5-flash-preview:free',
        priority: 8
      });
    }

    // 3. NVIDIA NIM (Verified High-Speed Models with Tool-Calling Support)
    if (config.NVIDIA_API_KEY) {
      list.push({
        id: 'nvidia-nim-super',
        name: 'NVIDIA NIM (Nemotron 3.5 Super 120B)',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        key: config.NVIDIA_API_KEY,
        model: 'nvidia/nemotron-3.5-super-vl-120b-a12b',
        priority: 5
      });
      list.push({
        id: 'nvidia-nim-lightning',
        name: 'NVIDIA NIM (Nemotron 3.5 Lightning 30B)',
        url: 'https://integrate.api.nvidia.com/v1/chat/completions',
        key: config.NVIDIA_API_KEY,
        model: 'nvidia/nemotron-3.5-lightning-30b-a3b',
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
    const entry = this.cooldowns.get(provider.id);
    if (!entry) return false;
    const expireAt = typeof entry === 'number' ? entry : entry.expireAt;
    if (Date.now() >= expireAt) {
      this.cooldowns.delete(provider.id); // Cooldown expired, back to normal!
      return false;
    }
    return true;
  }

  getCooldownRemainingSeconds(provider) {
    const entry = this.cooldowns.get(provider.id);
    if (!entry) return 0;
    const expireAt = typeof entry === 'number' ? entry : entry.expireAt;
    return Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
  }

  getProviderStatus(provider) {
    const entry = this.cooldowns.get(provider.id);
    if (!entry) return { inCooldown: false, remaining: 0, reason: null, isOffline: false };
    const expireAt = typeof entry === 'number' ? entry : entry.expireAt;
    const isOffline = typeof entry === 'object' && Boolean(entry.isOffline);
    const reason = typeof entry === 'object' ? entry.reason : null;
    if (Date.now() >= expireAt) {
      this.cooldowns.delete(provider.id);
      return { inCooldown: false, remaining: 0, reason: null, isOffline: false };
    }
    return {
      inCooldown: true,
      remaining: Math.max(0, Math.ceil((expireAt - Date.now()) / 1000)),
      reason,
      isOffline
    };
  }

  /**
   * Send chat completion with automatic failover and rate-limit reset tracking
   */
  async chatCompletion({ messages, tools, temperature = 0.2 }) {
    if (this.providers.length === 0) {
      throw new Error('No AI providers configured. Please set at least one API key in .env or run Ollama.');
    }

    let attempts = 0;
    const errors = [];
    const startTime = Date.now();
    const MAX_WAIT_DURATION_MS = 30 * 60 * 1000; // Continue retrying up to 30 minutes

    while (Date.now() - startTime < MAX_WAIT_DURATION_MS) {
      // 1. Check if any provider is active and ready (not in cooldown)
      let provider = null;
      for (let i = 0; i < this.providers.length; i++) {
        const candidate = this.providers[(this.currentIndex + i) % this.providers.length];
        if (!this.isProviderInCooldown(candidate)) {
          this.currentIndex = (this.currentIndex + i) % this.providers.length;
          provider = candidate;
          break;
        }
      }

      // 2. If ALL configured models are cooling down or offline, wait for the one that resets earliest
      if (!provider) {
        let minWait = 999999;
        let bestCandidate = null;
        for (const p of this.providers) {
          const st = this.getProviderStatus(p);
          // Look for candidates that reset reasonably (<= 120s, e.g. Groq TPM resets) and are not offline
          if (st.inCooldown && !st.isOffline && st.remaining > 0 && st.remaining < minWait && st.remaining <= 120) {
            minWait = st.remaining;
            bestCandidate = p;
          }
        }

        const waitSec = (bestCandidate && minWait > 0 && minWait < 999999) ? minWait : 15;
        const targetModel = bestCandidate || this.providers[0];

        if (this.onFailoverCallback) {
          this.onFailoverCallback({
            previous: targetModel,
            reason: `All models cooling down: waiting ${waitSec}s for ${targetModel.name} to reset`,
            retrySeconds: waitSec,
            next: targetModel
          });
        }

        const sleepSec = Math.min(30, waitSec);
        await new Promise(resolve => setTimeout(resolve, (sleepSec + 1) * 1000));
        if (bestCandidate && sleepSec >= waitSec) {
          this.cooldowns.delete(bestCandidate.id);
          this.setProviderByName(bestCandidate.id);
        }
        continue;
      }

      try {
        // Sanitize messages before sending to OpenAI/Groq compatible endpoints:
        // Strip non-standard UI properties (e.g. timestamp, step, steps, etc.)
        const cleanMessages = messages.map(m => {
          const item = {
            role: m.role,
            content: m.content !== undefined ? m.content : null
          };
          if (m.name) item.name = m.name;
          if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
          if (m.tool_calls) item.tool_calls = m.tool_calls;
          return item;
        });

        const body = {
          model: provider.model,
          messages: cleanMessages,
          temperature,
        };

        if (tools && tools.length > 0 && provider.supportsTools !== false) {
          body.tools = tools;
          body.tool_choice = 'auto';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000); // 25s timeout for high reliability

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

          // Check if rate limited (429), token limit exceeded (413), or server overloaded (503, 502, 504)
          if (status === 429 || status === 413 || status === 503 || status === 502 || status === 504) {
            let retrySeconds = status === 413 ? 30 : 60; // 30s pause on token limit spike
            const retryHeader = response.headers.get('retry-after');
            const resetHeader = response.headers.get('x-ratelimit-reset');

            if (retryHeader) {
              const parsed = parseInt(retryHeader, 10);
              if (!isNaN(parsed) && parsed > 0) {
                retrySeconds = Math.min(3600, parsed);
              }
            } else if (resetHeader) {
              const resetVal = parseFloat(resetHeader);
              // OpenRouter sends absolute epoch timestamp in milliseconds or seconds
              if (resetVal > 1000000000000) {
                // Milliseconds epoch timestamp
                retrySeconds = Math.max(5, Math.ceil((resetVal - Date.now()) / 1000));
              } else if (resetVal > 1000000000) {
                // Seconds epoch timestamp
                retrySeconds = Math.max(5, Math.ceil((resetVal * 1000 - Date.now()) / 1000));
              } else if (resetVal > 0) {
                retrySeconds = Math.ceil(resetVal);
              }
            }

            // Set cooldown expiration timestamp
            const expireAt = Date.now() + (retrySeconds * 1000);
            const resetTime = new Date(expireAt).toLocaleTimeString();
            let reason = `Server Overloaded (${status})`;
            if (status === 429) reason = 'Rate Limit (429)';
            if (status === 413) reason = `Token Limit Reached (413 - auto reset in ${retrySeconds}s)`;

            this.cooldowns.set(provider.id, {
              expireAt,
              reason,
              isOffline: false
            });

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

        // Handle network timeout / connection refused / offline
        if (err.name === 'AbortError' || err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
          const isTimeout = err.name === 'AbortError';
          const isConnFailed = err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED');
          const cooldownSec = isTimeout ? 45 : 90;
          const expireAt = Date.now() + (cooldownSec * 1000);

          this.cooldowns.set(provider.id, {
            expireAt,
            reason: isTimeout ? 'Timeout (25s)' : 'Offline / Connection Failed',
            isOffline: isConnFailed
          });

          if (this.onFailoverCallback) {
            this.onFailoverCallback({
              previous: provider,
              reason: isTimeout ? 'Timeout (25s)' : 'Offline / Connection Failed',
              retrySeconds: cooldownSec,
              next: this.providers[(this.currentIndex + 1) % this.providers.length]
            });
          }

          this.currentIndex = (this.currentIndex + 1) % this.providers.length;
          attempts++;
          continue;
        }

        // Put provider on brief cooldown for general errors so it doesn't loop infinitely
        this.cooldowns.set(provider.id, {
          expireAt: Date.now() + 30000,
          reason: err.message.slice(0, 60),
          isOffline: false
        });

        // Failover on general errors to try next provider, or wait if up against rate limits
        if (Date.now() - startTime < MAX_WAIT_DURATION_MS) {
          this.currentIndex = (this.currentIndex + 1) % this.providers.length;
          attempts++;
          continue;
        }

        throw new Error(`All providers failed after 30m timeout:\n${errors.join('\n')}`);
      }
    }

    throw new Error(`All configured providers exhausted:\n${errors.join('\n')}`);
  }
}
