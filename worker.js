/**
 * Cloudflare Worker for Blog Generator
 * Serves React app and provides /api/generate endpoint with Workers AI
 */

import { Router } from 'itty-router';

const router = Router();

/**
 * Serve React SPA from build directory
 */
async function serveAsset(path, env) {
  try {
    // Remove leading slash and get the asset
    const cleanPath = path === '/' ? 'index.html' : path.replace(/^\//, '');
    
    // Try to get the asset from Workers KV or build directory
    if (env.ASSETS && env.ASSETS.get) {
      const asset = await env.ASSETS.get(cleanPath);
      if (asset) {
        const contentType = getContentType(cleanPath);
        return new Response(asset, {
          headers: { 'Content-Type': contentType },
        });
      }
    }

    // Fallback to index.html for SPA routing
    if (env.ASSETS && env.ASSETS.get) {
      const html = await env.ASSETS.get('index.html');
      if (html && cleanPath !== 'index.html') {
        return new Response(html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
 * Generate blog post using Cloudflare Workers AI
 */
async function generateBlogPost(request, env, ctx) {
  try {
    if (!env.ACCOUNT_ID || !env.API_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Missing API credentials. Set ACCOUNT_ID and API_TOKEN secrets.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { topic, tone = 'professional', length = 'medium' } = await request.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: topic' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Map length to token count
    const lengthMap = {
      short: 300,
      medium: 600,
      long: 1000,
    };

    const maxTokens = lengthMap[length] || 600;

    // Call Cloudflare Workers AI
    const response = await env.AI.run('@cf/meta/llama-2-7b-chat-int8', {
      prompt: `Write a ${length} blog post about "${topic}" in a ${tone} tone. 
      
      The post should be well-structured with:
      - An engaging introduction
      - 2-3 main sections with subheadings
      - A thoughtful conclusion
      
      Format the response in markdown.`,
      max_tokens: maxTokens,
    });

    // Extract the generated text
    const generatedText = response.result?.response || '';

    return new Response(
      JSON.stringify({
        success: true,
        topic,
        tone,
        length,
        content: generatedText,
        model: '@cf/meta/llama-2-7b-chat-int8',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Generation error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate blog post' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Determine content type based on file extension
 */
function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    html: 'text/html; charset=utf-8',
    css: 'text/css',
    js: 'application/javascript',
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
  };
  return types[ext] || 'application/octet-stream';
}

/**
 * CORS middleware
 */
function withCORS(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return new Response(response.body, { ...response, headers });
}

/**
 * Handle preflight requests
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
 * API route for generating blog posts
 */
router.post('/api/generate', generateBlogPost);

/**
 * Health check endpoint
 */
router.get('/api/health', () => {
  return new Response(JSON.stringify({ status: 'ok' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

/**
 * Catch-all for React SPA - serve index.html for client-side routing
 */
router.all('*', ({ request, env, ctx }) => {
  return serveAsset(new URL(request.url).pathname, env);
});

/**
 * Main fetch handler
 */
export default {
  async fetch(request, env, ctx) {
    try {
      const response = await router.handle(request, env, ctx);
      return withCORS(response);
    } catch (error) {
      console.error('Request error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
