#!/usr/bin/env node

/**
 * Blog Generator CLI
 * Command-line interface for generating blogs
 */

const contentGenerator = require('./server/services/contentGenerator');
const imageGenerator = require('./server/services/imageGenerator');
const newsService = require('./server/services/newsService');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
🚀 Blog Generator CLI

Usage: node cli.js <command> <options>

Commands:
  blog <niche> <keyword> [imageCount]  - Generate a blog post
  news <niche> [limit]                  - Get news for a niche
  niches                                - List all supported niches
  help                                  - Show this help message

Examples:
  node cli.js blog cryptocurrency "how to buy bitcoin" 5
  node cli.js news cryptocurrency 10
  node cli.js niches

`);
  process.exit(0);
}

const command = args[0];

switch (command) {
  case 'blog':
    generateBlog();
    break;
  case 'news':
    getNews();
    break;
  case 'niches':
    listNiches();
    break;
  case 'help':
    showHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}

async function generateBlog() {
  const niche = args[1];
  const keyword = args[2];
  const imageCount = parseInt(args[3]) || 5;

  if (!niche || !keyword) {
    console.error('Error: niche and keyword are required');
    process.exit(1);
  }

  console.log(`\n🚀 Generating blog for ${niche}: "${keyword}"...\n`);

  try {
    const news = await newsService.getNewsForNiche(niche, 5);
    const newsContext = await newsService.formatNewsContext(news);
    
    const content = await contentGenerator.generateBlogContent(niche, keyword, newsContext, imageCount);
    const title = await contentGenerator.generateTitle(niche, keyword);
    const metaDesc = await contentGenerator.generateMetaDescription(content.html, keyword);

    console.log(`\n✅ Blog Generated!`);
    console.log(`Title: ${title}`);
    console.log(`Meta: ${metaDesc}`);
    console.log(`Word Count: ${content.metadata.wordCount}`);
    console.log(`Flesch Score: ${content.metadata.fleschScore}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

async function getNews() {
  const niche = args[1];
  const limit = parseInt(args[2]) || 10;

  if (!niche) {
    console.error('Error: niche is required');
    process.exit(1);
  }

  console.log(`\n📰 News for ${niche}\n`);

  try {
    const news = await newsService.getNewsForNiche(niche, limit);
    
    news.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.title}`);
      console.log(`   Source: ${item.source}`);
      console.log(`   Date: ${new Date(item.pubDate).toLocaleDateString()}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

function listNiches() {
  const niches = [
    'cryptocurrency',
    'artificial_intelligence',
    'cybersecurity',
    'personal_finance',
    'digital_marketing',
    'software_development',
    'real_estate',
    'ecommerce',
    'blockchain',
    'renewable_energy',
    'technology',
    'health',
    'finance',
    'sports',
    'travel',
    'food',
    'fashion',
    'business',
    'science',
    'gaming',
    'lifestyle',
    'productivity',
    'psychology',
    'education',
    'automotive'
  ];

  console.log(`\n📚 Supported Niches (${niches.length})\n`);
  niches.forEach((niche, idx) => {
    console.log(`${idx + 1}. ${niche}`);
  });
  console.log('');
}

function showHelp() {
  console.log(`
🚀 Blog Generator CLI Help

Usage: node cli.js <command> <options>

Available Commands:

  blog <niche> <keyword> [imageCount]
    Generate a blog post
    Example: node cli.js blog cryptocurrency "how to buy bitcoin" 5

  news <niche> [limit]
    Get recent news for a niche
    Example: node cli.js news cryptocurrency 10

  niches
    List all 25 supported niches
    Example: node cli.js niches

  help
    Show this help message

Options:
  --niche <name>     Specify niche
  --keyword <word>   Specify keyword
  --count <number>   Number of images (4-6)

Supported Niches (25):
  cryptocurrency, artificial_intelligence, cybersecurity,
  personal_finance, digital_marketing, software_development,
  real_estate, ecommerce, blockchain, renewable_energy,
  technology, health, finance, sports, travel, food,
  fashion, business, science, gaming, lifestyle,
  productivity, psychology, education, automotive

`);
}
