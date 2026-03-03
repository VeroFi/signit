/**
 * GPT-5.1 Service
 * Handles OpenAI API interactions with GPT-5.1-chat-latest
 * Includes prompt caching, rate limiting, and error handling
 */

import OpenAI from 'openai';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rate limiters
const userRateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.PAPERPAL_RATE_LIMIT_PER_USER || '20'), // requests
  duration: 3600, // per hour
});

const documentRateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.PAPERPAL_RATE_LIMIT_PER_DOC || '50'), // requests
  duration: 3600, // per hour
});

// Response cache (simple in-memory cache)
const responseCache = new Map();
const CACHE_TTL = parseInt(process.env.PAPERPAL_CACHE_TTL || '3600') * 1000; // Convert to milliseconds

/**
 * Check rate limits for user and document
 */
async function checkRateLimits(userId, documentId) {
  try {
    await userRateLimiter.consume(userId);
    if (documentId) {
      await documentRateLimiter.consume(documentId);
    }
  } catch (rejRes) {
    const remainingTime = Math.round(rejRes.msBeforeNext / 1000) || 1;
    throw new Error(`Rate limit exceeded. Please try again in ${remainingTime} seconds.`);
  }
}

/**
 * Generate cache key from message, context, and pageContext
 */
function generateCacheKey(message, documentContext, pageContext = null) {
  const contextHash = documentContext ? JSON.stringify(documentContext).slice(0, 100) : '';
  const pageHash = pageContext || '';
  return `${message.slice(0, 100)}_${contextHash}_${pageHash}`;
}

/**
 * Get cached response if available
 */
function getCachedResponse(cacheKey) {
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  responseCache.delete(cacheKey);
  return null;
}

/**
 * Cache a response
 */
function cacheResponse(cacheKey, response) {
  responseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
  });

  // Clean up old cache entries periodically
  if (responseCache.size > 1000) {
    const now = Date.now();
    for (const [key, value] of responseCache.entries()) {
      if (now - value.timestamp > CACHE_TTL) {
        responseCache.delete(key);
      }
    }
  }
}

/**
 * Call GPT-5.1 API with retry logic
 */
async function callGPT5API(messages, options = {}) {
  const {
    model = process.env.PAPERPAL_MODEL || 'gpt-5.1-chat-latest',
    temperature = 0.7,
    maxTokens = 1000,
  } = options;

  const maxRetries = 3;
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // GPT-5.1 requires max_completion_tokens instead of max_tokens
      // GPT-5.1 only supports temperature = 1 (default), so omit it for GPT-5 models
      const requestParams = {
        model,
        messages,
      };

      // Use max_completion_tokens for GPT-5.1 models, max_tokens for others
      if (model.includes('gpt-5')) {
        requestParams.max_completion_tokens = maxTokens;
        // GPT-5.1 only supports temperature = 1 (default), so don't include it
      } else {
        requestParams.max_tokens = maxTokens;
        requestParams.temperature = temperature; // Other models support custom temperature
      }

      const response = await openai.chat.completions.create(requestParams);

      return {
        content: response.choices[0].message.content,
        usage: response.usage,
        model: response.model,
      };
    } catch (error) {
      lastError = error;

      // If it's a rate limit error, wait before retrying
      if (error.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(
          `[gpt5Service] Rate limited, waiting ${waitTime}ms before retry ${
            attempt + 1
          }/${maxRetries}`
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // If it's a non-retryable error, throw immediately
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw error;
      }

      // For other errors, retry with exponential backoff
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(
          `[gpt5Service] Error, retrying in ${waitTime}ms (attempt ${attempt + 1}/${maxRetries})`
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError || new Error('Failed to get response from GPT-5.1 after retries');
}

/**
 * Main function to get AI response
 */
export async function getAIResponse(userMessage, systemPrompt, documentContext, options = {}) {
  const { userId, documentId, workflowState, pageContext, useCache = true } = options;

  // Check rate limits
  if (userId) {
    await checkRateLimits(userId, documentId);
  }

  // Check cache - include pageContext in cache key to avoid cross-page cache hits
  const cacheKey = generateCacheKey(userMessage, documentContext, pageContext);
  if (useCache) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      console.log('[gpt5Service] Returning cached response');
      return cached;
    }
  }

  // Build messages array
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
  ];

  // Add document context if available
  if (documentContext && documentContext.length > 0) {
    const contextText = documentContext.slice(
      0,
      parseInt(process.env.PAPERPAL_MAX_CONTEXT_LENGTH || '50000')
    );
    messages.push({
      role: 'system',
      content: `Document Context:\n${contextText}\n\nUse this context to answer questions about the document.`,
    });
  }

  // Add user message
  messages.push({
    role: 'user',
    content: userMessage,
  });

  // Call GPT-5.1 API
  try {
    const response = await callGPT5API(messages, {
      ...options,
    });

    // Cache the response
    if (useCache) {
      cacheResponse(cacheKey, response);
    }

    return response;
  } catch (error) {
    console.error('[gpt5Service] Error calling GPT-5.1:', error);

    // Fallback to GPT-5 if GPT-5.1 is unavailable
    if (error.message?.includes('gpt-5.1') || error.status === 404) {
      console.log('[gpt5Service] Falling back to gpt-5-chat-latest');
      try {
        const fallbackResponse = await callGPT5API(messages, {
          model: 'gpt-5-chat-latest',
          useCache: false, // Don't cache fallback responses
          ...options,
        });
        return fallbackResponse;
      } catch (fallbackError) {
        console.error('[gpt5Service] Fallback also failed:', fallbackError);
        throw new Error('AI service is temporarily unavailable. Please try again later.');
      }
    }

    throw error;
  }
}

/**
 * Get cost estimate for a request
 */
export function estimateCost(inputTokens, outputTokens) {
  // GPT-5.1-chat-latest pricing (approximate)
  const inputCostPer1K = 0.01; // $0.01 per 1K input tokens
  const outputCostPer1K = 0.03; // $0.03 per 1K output tokens

  const inputCost = (inputTokens / 1000) * inputCostPer1K;
  const outputCost = (outputTokens / 1000) * outputCostPer1K;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    inputTokens,
    outputTokens,
  };
}
