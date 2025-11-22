import axios from "axios";
import { load } from "cheerio";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.join(__dirname, "docs-cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function getCacheKey(url) {
  return crypto.createHash("md5").update(url).digest("hex");
}

function getCachePath(url) {
  return path.join(CACHE_DIR, `${getCacheKey(url)}.json`);
}

export async function fetchDoc(url, opts = {}) {
  const cachePath = getCachePath(url);

  // Check cache first unless force refresh
  if (!opts.noCache && fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    console.error(`[cache hit] ${url}`);
    return cached;
  }

  console.error(`[fetching] ${url}`);

  const res = await axios.get(url, {
    timeout: opts.timeout || 15000,
    headers: { "User-Agent": "ClaudeCodeFetcher/1.0" }
  });

  const html = res.data;
  const $ = load(html);

  // Extract structured content
  const title = $("title").text().trim();

  // Extract headings
  const headings = [];
  $("h1, h2, h3, h4").each((i, el) => {
    headings.push({
      level: el.name,
      text: $(el).text().trim()
    });
  });

  // Extract code blocks
  const codeBlocks = [];
  $("pre code, pre, code").each((i, el) => {
    const code = $(el).text().trim();
    if (code.length > 10) {
      codeBlocks.push(code);
    }
  });

  // Extract tables
  const tables = [];
  $("table").each((i, el) => {
    const headers = [];
    $(el).find("th").each((j, th) => {
      headers.push($(th).text().trim());
    });

    const rows = [];
    $(el).find("tr").each((j, tr) => {
      const cells = [];
      $(tr).find("td").each((k, td) => {
        cells.push($(td).text().trim());
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    if (headers.length > 0 || rows.length > 0) {
      tables.push({ headers, rows });
    }
  });

  // Get main content text (prioritize article/main/content divs)
  let mainText = "";
  const contentSelectors = ["article", "main", "[role='main']", ".content", "#content"];
  for (const selector of contentSelectors) {
    const content = $(selector).text().trim();
    if (content.length > mainText.length) {
      mainText = content;
    }
  }
  if (!mainText) {
    mainText = $("body").text().trim();
  }

  const result = {
    url,
    title,
    headings,
    codeBlocks,
    tables,
    mainText: mainText.slice(0, 5000), // First 5000 chars
    fetchedAt: new Date().toISOString()
  };

  // Cache the result
  fs.writeFileSync(cachePath, JSON.stringify(result, null, 2), "utf8");

  return result;
}

// CLI usage
if (process.argv[2]) {
  const url = process.argv[2];
  const opts = {
    noCache: process.argv.includes("--no-cache")
  };

  fetchDoc(url, opts)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => {
      console.error("Error:", err.message);
      process.exit(1);
    });
}
