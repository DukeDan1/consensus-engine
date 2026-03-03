/**
 * wikipediaFetcher.ts
 *
 * Fetches the plain-text content of a Wikipedia article using the
 * MediaWiki API. No external dependencies required — uses native fetch.
 *
 * The extracted text is used as grounding context when generating
 * scenario simulation content via AI.
 */

// ────────────────────────── Types ──────────────────────────

export type WikipediaArticle = {
    /** Canonical title of the article. */
    title: string;
    /** Plain-text extract of the article (typically first ~10 k chars). */
    text: string;
    /** URL that was fetched. */
    sourceUrl: string;
    /** Number of characters in the extract. */
    charCount: number;
};

// ────────────────────────── Helpers ──────────────────────────

/**
 * Extract the article title from a Wikipedia URL.
 * Handles both `/wiki/Article_Name` and `/w/index.php?title=Article_Name` formats.
 */
function extractTitleFromUrl(url: string): string {
    const parsed = new URL(url);
    // Standard: https://en.wikipedia.org/wiki/Article_Name
    const wikiMatch = parsed.pathname.match(/^\/wiki\/(.+)$/);
    if (wikiMatch) {
        return decodeURIComponent(wikiMatch[1].replace(/_/g, " "));
    }
    // Alt: index.php?title=Article_Name
    const titleParam = parsed.searchParams.get("title");
    if (titleParam) {
        return decodeURIComponent(titleParam.replace(/_/g, " "));
    }
    throw new Error(`Could not extract article title from URL: ${url}`);
}

/**
 * Derive the MediaWiki API base URL from a Wikipedia article URL.
 * e.g. "https://en.wikipedia.org/wiki/Foo" → "https://en.wikipedia.org/w/api.php"
 */
function getApiBaseUrl(articleUrl: string): string {
    const parsed = new URL(articleUrl);
    return `${parsed.protocol}//${parsed.host}/w/api.php`;
}

// ────────────────────────── Main Fetch ──────────────────────────

/**
 * Fetch plain-text content of a Wikipedia article.
 *
 * Uses the `TextExtracts` API extension to get clean plain text:
 *   https://www.mediawiki.org/wiki/Extension:TextExtracts
 *
 * @param url  Full Wikipedia article URL.
 * @param maxChars  Maximum characters to extract (default 12 000).
 * @returns  A WikipediaArticle object.
 */
export async function fetchWikipediaArticle(
    url: string,
    maxChars: number = 12_000,
): Promise<WikipediaArticle> {
    const title = extractTitleFromUrl(url);
    const apiBase = getApiBaseUrl(url);

    const params = new URLSearchParams({
        action: "query",
        format: "json",
        titles: title,
        prop: "extracts",
        // Plain text, no HTML
        explaintext: "1",
        // Get the full extract then we'll truncate
        exintro: "0",
        exchars: String(maxChars),
    });

    const apiUrl = `${apiBase}?${params.toString()}`;

    const response = await fetch(apiUrl, {
        headers: {
            // Wikipedia asks for a User-Agent
            "User-Agent": "ConsensusEngine-ScenarioSimulation/1.0 (research; simulation)",
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error(
            `Wikipedia API returned ${response.status} ${response.statusText} for "${title}"`,
        );
    }

    const data = (await response.json()) as {
        query?: {
            pages?: Record<string, { title?: string; extract?: string; missing?: string }>;
        };
    };

    const pages = data?.query?.pages;
    if (!pages) {
        throw new Error(`Wikipedia API returned no pages for "${title}"`);
    }

    // Pages is keyed by numeric page ID; get the first (and only) entry
    const pageKey = Object.keys(pages)[0];
    const page = pages[pageKey];

    if (!page || page.missing !== undefined) {
        throw new Error(`Wikipedia article not found: "${title}"`);
    }

    const extract = (page.extract || "").trim();
    if (!extract) {
        throw new Error(`Wikipedia article "${title}" returned empty extract`);
    }

    return {
        title: page.title || title,
        text: extract,
        sourceUrl: url,
        charCount: extract.length,
    };
}

/**
 * Fetch multiple Wikipedia articles in parallel.
 * Logs progress and continues past failures.
 */
export async function fetchAllArticles(
    urls: string[],
): Promise<Map<string, WikipediaArticle>> {
    const results = new Map<string, WikipediaArticle>();

    const fetches = urls.map(async (url) => {
        try {
            const article = await fetchWikipediaArticle(url);
            console.log(
                `  ✓ Fetched Wikipedia: "${article.title}" (${article.charCount.toLocaleString()} chars)`,
            );
            results.set(url, article);
        } catch (err) {
            console.warn(
                `  ⚠ Failed to fetch ${url}: ${err instanceof Error ? err.message : err}`,
            );
        }
    });

    await Promise.all(fetches);
    return results;
}
