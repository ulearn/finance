import { crawlDocs } from './crawl-docs.js';

const rootUrl = 'https://developers.google.com/google-ads/api/samples';

console.log('Crawling Google Ads API samples...\n');

const results = await crawlDocs(rootUrl, {
  maxDepth: 2,
  limit: 100,
  save: './docs-cache/samples-crawl.json'
});

console.log(`\nCrawled ${results.length} pages`);

// Filter for asset-related samples
const assetPages = results.filter(r =>
  r.url.includes('asset') ||
  r.title.toLowerCase().includes('asset') ||
  r.snippet.toLowerCase().includes('asset')
);

console.log(`\nAsset-related pages: ${assetPages.length}`);
assetPages.forEach(p => {
  console.log(`  - ${p.title}`);
  console.log(`    ${p.url}`);
});

// Filter for performance max samples
const pmaxPages = results.filter(r =>
  r.url.includes('performance') ||
  r.title.toLowerCase().includes('performance max') ||
  r.snippet.toLowerCase().includes('performance max')
);

console.log(`\nPerformance Max pages: ${pmaxPages.length}`);
pmaxPages.forEach(p => {
  console.log(`  - ${p.title}`);
  console.log(`    ${p.url}`);
});
