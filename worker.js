/**
 * Cloudflare Worker for Blog Generator
 * Serves React app and provides /api/generate endpoint with Workers AI
 * No external APIs or secrets required - uses env.AI directly
 */

import { Router } from 'itty-router';

const router = Router();

/**
 * Serve React SPA from build directory
 */
async function serveAsset(pathname, env) {
  try {
    // Normalize path
    let assetPath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    
    // Try to get the asset
    if (env.ASSETS) {
      const asset = await env.ASSETS.get(assetPath);
      if (asset) {
        const contentType = getContentType(assetPath);
        return new Response(asset, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': assetPath.includes('.') ? 'public, max-age=31536000' : 'no-cache',
          },
        });
      }
    }

    // Fallback to index.html for SPA routing (only for non-API paths)
    if (!assetPath.startsWith('api/') && env.ASSETS) {
      const html = await env.ASSETS.get('index.html');
      if (html) {
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  } catch (error) {
    console.error('Asset serving error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Generate blog post using Cloudflare Workers AI (Llama 2)
 * No secrets required - uses env.AI binding
 */
async function generateBlogPost(request, env) {
  try {
    if (!env.AI) {
      return jsonResponse(
        { error: 'Workers AI not available in this environment' },
        500
      );
    }

    const body = await request.json();
    const { topic, tone = 'professional', length = 'medium' } = body;

    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return jsonResponse(
        { error: 'Missing or invalid required parameter: topic' },
        400
      );
    }

    if (!['professional', 'casual', 'technical', 'creative'].includes(tone)) {
      return jsonResponse(
        { error: 'Invalid tone. Use: professional, casual, technical, or creative' },
        400
      );
    }

    if (!['short', 'medium', 'long'].includes(length)) {
      return jsonResponse(
        { error: 'Invalid length. Use: short, medium, or long' },
        400
      );
    }

    // Map length to token count
    const lengthMap = {
      short: 300,
      medium: 600,
      long: 1000,
    };

    const maxTokens = lengthMap[length];
    const cleanTopic = topic.trim().substring(0, 200);

    // Create the prompt
    const prompt = `You are an expert blog writer. Write a ${length} blog post about "${cleanTopic}" in a ${tone} tone.

Structure the post with:
- An engaging title (as # Heading)
- An introduction paragraph
- 2-3 main sections with ## subheadings
- A conclusion
- Use markdown formatting for readability

Keep the content informative and engaging.`;

    // Call Workers AI with Llama 2 model
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt,
      max_tokens: maxTokens,
    });

    if (!response || !response.result) {
      return jsonResponse(
        { error: 'AI generation failed - no response from model' },
        500
      );
    }

    const generatedText = response.result.response || '';

    if (!generatedText || generatedText.trim().length === 0) {
      return jsonResponse(
        { error: 'AI model returned empty response' },
        500
      );
    }

    return jsonResponse({
      success: true,
      topic: cleanTopic,
      tone,
      length,
      content: generatedText.trim(),
      model: '@cf/meta/llama-2-7b-chat-int8',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Blog generation error:', error);
    const errorMessage = error instanceof SyntaxError
      ? 'Invalid JSON in request body'
      : error.message || 'Failed to generate blog post';
    return jsonResponse({ error: errorMessage }, 500);
  }
}

/**
 * Health check endpoint
 */
function healthCheck() {
  return jsonResponse({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'blog-generator',
  });
}

/**
 * Get content type based on file extension
 */
function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    json: 'application/json',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    webp: 'image/webp',
    mp4: 'video/mp4',
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * Helper to create JSON responses with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

/**
 * Handle preflight CORS requests
 */
router.options('*', () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
});

/**
 * API endpoints
 */
router.post('/api/generate', generateBlogPost);
router.get('/api/health', healthCheck);

/**
 * Catch-all for React SPA - serve index.html for client-side routing
 */
router.all('*', ({ request, env }) => {
  const url = new URL(request.url);
  return serveAsset(url.pathname, env);
});

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    try {
      const response = await router.handle(request, env, ctx);
      return response;
    } catch (error) {
      console.error('Request error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal Server Error' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },
};
