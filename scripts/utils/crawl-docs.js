import axios from "axios";
import { load } from "cheerio";
import { URL } from "url";
import fs from "fs";

export async function crawlDocs(root, opts = {}) {
  const maxDepth = opts.maxDepth ?? 2;
  const limit = opts.limit ?? 50;
  const visited = new Set();
  const queue = [{ url: root, depth: 0 }];
  const results = [];

  while (queue.length && results.length < limit) {
    const { url, depth } = queue.shift();
    if (visited.has(url) || depth > maxDepth) continue;
    visited.add(url);

    try {
      const { data: html } = await axios.get(url, { timeout: 10000 });
      const $ = load(html);
      const title = $("title").text().trim();
      const text = $("body").text().replace(/\s+/g, " ").slice(0, 2000);
      results.push({ url, title, snippet: text });

      if (depth < maxDepth) {
        $("a[href]").each((_, el) => {
          const href = $(el).attr("href");
          try {
            const next = new URL(href, root).href;
            if (next.startsWith(root) && !visited.has(next))
              queue.push({ url: next, depth: depth + 1 });
          } catch {}
        });
      }
    } catch (e) {
      console.error("Skip", url, e.message);
    }
  }

  if (opts.save)
    fs.writeFileSync(opts.save, JSON.stringify(results, null, 2));

  return results;
}
