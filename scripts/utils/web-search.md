1️⃣ Web searching (Google, Bing, DuckDuckGo, etc.)

A plain axios/cheerio crawler is good for reading a known site.
If you want open-web search, you have two choices:

Approach	How it works	Pros	Cons
Unofficial HTML scraping	axios.get('https://www.google.com/search?q=...') → parse with cheerio	Simple, no API key	Google often blocks it (CAPTCHAs, IP throttling).
Official search APIs	Use a JSON search endpoint	Stable, allowed	Requires key & quota

Recommended: use a real search API; wrap it the same way as your doc-fetcher.

Example — Google Custom Search API

Enable Programmable Search Engine → get cx and key.

Add to utils/search-web.js:

import axios from "axios";
export async function webSearch(q, limit = 5) {
  const key = process.env.GOOGLE_API_KEY;
  const cx  = process.env.GOOGLE_CX;
  const url = "https://www.googleapis.com/customsearch/v1";
  const { data } = await axios.get(url, { params: { key, cx, q, num: limit } });
  return data.items.map(i => ({ title: i.title, link: i.link, snippet: i.snippet }));
}


Claude Code can call webSearch("Performance Max mutateAsset") and then feed those URLs into your crawler.

That same wrapper pattern works for SerpAPI, Bing Search V7, DuckDuckGo Instant API, etc.