Usage:

node crawl-docs.js https://developers.google.com/google-ads/api/docs --depth 2 --save googleads-index.json


This builds a compact JSON index of every page’s title + first 2 000 chars.
Claude Code (or any script) can then search that offline file to find the right section instantly.

🧠 3️⃣ Heuristic strategy (“general RTFM brain”)

When you run any script that needs docs:

Check cache first (/docs-index/*.json).S

If not present, crawl the root URL (depth ≤ 2 or 3).

Summarize page titles → headings → URLs.

Look up relevant endpoint pages by keyword.

Fetch only those pages in full when you actually need details.

That gives Claude Code a pseudo-“search engine” view of any API’s manual without uncontrolled crawling.

⚙️ 4️⃣ Optional enhancements

Add robots.txt respect (don’t crawl banned paths).

Limit rate (await sleep(500) between requests).

Use cheerio to extract <code> or <pre> blocks only (for endpoint examples).

Persist a sitemap summary:

{ "GET /campaigns": "https://...", "POST /mutate": "https://..." }


→ Claude Code can consult this index for field names later.

✅ TL;DR

Axios fetcher = read one page.
Mini crawler (cheerio + queue + URL checks) = read entire manual.
Cache & index results → Claude Code can “RTFM” across hierarchies intelligently.