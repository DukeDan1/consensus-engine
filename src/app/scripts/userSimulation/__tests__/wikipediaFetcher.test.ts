/**
 * wikipediaFetcher.test.ts
 *
 * Unit tests for fetchWikipediaArticle and fetchAllArticles.
 * Global fetch is replaced with a vi stub — no network calls are made.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { fetchWikipediaArticle, fetchAllArticles } from "../wikipediaFetcher";

// ──────────────────────────── Helpers ────────────────────────────────────────

/** Build a minimal Wikipedia API JSON response for a single article. */
function makeWikiApiResponse(title: string, extract: string, missing = false) {
    const page: Record<string, unknown> = { title, extract };
    if (missing) page.missing = "";
    return {
        query: {
            pages: { "12345": page },
        },
    };
}

/** Create a mock Response-like object that resolves fetch(). */
function mockResponse(body: unknown, ok = true, status = 200) {
    return {
        ok,
        status,
        statusText: ok ? "OK" : "Not Found",
        json: vi.fn().mockResolvedValue(body),
    };
}

/** Replace global fetch with a function that returns the given response. */
function stubFetch(response: ReturnType<typeof mockResponse>) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchWikipediaArticle — success paths
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchWikipediaArticle", () => {
    it("returns a WikipediaArticle on a successful /wiki/ URL", async () => {
        const extract = "Climate change is a long-term shift in global temperatures.";
        stubFetch(mockResponse(makeWikiApiResponse("Climate change", extract)));

        const article = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Climate_change");

        expect(article.title).toBe("Climate change");
        expect(article.text).toBe(extract);
        expect(article.sourceUrl).toBe("https://en.wikipedia.org/wiki/Climate_change");
        expect(article.charCount).toBe(extract.length);
    });

    it("decodes URL-encoded article titles", async () => {
        const extract = "Two-state solution content.";
        stubFetch(mockResponse(makeWikiApiResponse("Two-state solution", extract)));

        const article = await fetchWikipediaArticle(
            "https://en.wikipedia.org/wiki/Two-state_solution",
        );

        expect(article.title).toBe("Two-state solution");
    });

    it("calls the correct MediaWiki API endpoint", async () => {
        const mockFetch = vi.fn().mockResolvedValue(
            mockResponse(makeWikiApiResponse("Gun control", "Some text.")),
        );
        vi.stubGlobal("fetch", mockFetch);

        await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Gun_control");

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [calledUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(calledUrl).toContain("en.wikipedia.org/w/api.php");
        expect(calledUrl).toContain("action=query");
        expect(calledUrl).toContain("format=json");
        expect(calledUrl).toContain("prop=extracts");
    });

    it("includes a User-Agent header in the request", async () => {
        const mockFetch = vi.fn().mockResolvedValue(
            mockResponse(makeWikiApiResponse("Abortion debate", "Some text.")),
        );
        vi.stubGlobal("fetch", mockFetch);

        await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Abortion_debate");

        const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        const headers = options.headers as Record<string, string>;
        expect(headers["User-Agent"]).toMatch(/ConsensusEngine/);
    });

    it("passes exchars param (defaults to 12000)", async () => {
        const mockFetch = vi.fn().mockResolvedValue(
            mockResponse(makeWikiApiResponse("Test", "content.")),
        );
        vi.stubGlobal("fetch", mockFetch);

        await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Test");

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("exchars=12000");
    });

    it("passes a custom maxChars value", async () => {
        const mockFetch = vi.fn().mockResolvedValue(
            mockResponse(makeWikiApiResponse("Test", "content.")),
        );
        vi.stubGlobal("fetch", mockFetch);

        await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Test", 5000);

        const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("exchars=5000");
    });

    it("works with index.php?title= URL format", async () => {
        const extract = "Some content via index.php URL.";
        const mockFetch = vi.fn().mockResolvedValue(
            mockResponse(makeWikiApiResponse("Gun control", extract)),
        );
        vi.stubGlobal("fetch", mockFetch);

        const article = await fetchWikipediaArticle(
            "https://en.wikipedia.org/w/index.php?title=Gun_control",
        );

        expect(article.text).toBe(extract);
    });

    // ── Error paths ──────────────────────────────────────────────────────────

    it("throws when fetch returns a non-OK response", async () => {
        stubFetch(mockResponse({}, false, 404));

        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/wiki/Missing_Page"),
        ).rejects.toThrow("404");
    });

    it("throws when API response has no pages", async () => {
        stubFetch(mockResponse({ query: {} }));

        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/wiki/Test"),
        ).rejects.toThrow(/no pages/i);
    });

    it("throws when article is marked as missing", async () => {
        stubFetch(mockResponse(makeWikiApiResponse("Does Not Exist", "", true)));

        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/wiki/Does_Not_Exist"),
        ).rejects.toThrow(/not found/i);
    });

    it("throws when article extract is empty", async () => {
        stubFetch(mockResponse(makeWikiApiResponse("Empty Article", "   ")));

        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/wiki/Empty_Article"),
        ).rejects.toThrow(/empty extract/i);
    });

    it("throws when the URL has no recognisable article title", async () => {
        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/"),
        ).rejects.toThrow(/Could not extract article title/);
    });

    it("reports the article title in HTTP error messages", async () => {
        stubFetch(mockResponse({}, false, 503));

        await expect(
            fetchWikipediaArticle("https://en.wikipedia.org/wiki/Climate_change"),
        ).rejects.toThrow(/Climate change/);
    });

    it("trims whitespace from extracted text", async () => {
        const raw = "  Leading and trailing spaces.   ";
        stubFetch(mockResponse(makeWikiApiResponse("Test", raw)));

        const article = await fetchWikipediaArticle("https://en.wikipedia.org/wiki/Test");
        expect(article.text).toBe(raw.trim());
        expect(article.charCount).toBe(raw.trim().length);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fetchAllArticles
// ─────────────────────────────────────────────────────────────────────────────

describe("fetchAllArticles", () => {
    it("returns an empty Map for an empty URL list", async () => {
        const result = await fetchAllArticles([]);
        expect(result.size).toBe(0);
    });

    it("returns a Map keyed by the original URL", async () => {
        stubFetch(mockResponse(makeWikiApiResponse("Gun control", "Some text.")));

        const url = "https://en.wikipedia.org/wiki/Gun_control";
        const result = await fetchAllArticles([url]);

        expect(result.has(url)).toBe(true);
        expect(result.get(url)?.title).toBe("Gun control");
    });

    it("fetches all provided URLs", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn()
                .mockResolvedValueOnce(mockResponse(makeWikiApiResponse("Article One", "Text 1.")))
                .mockResolvedValueOnce(mockResponse(makeWikiApiResponse("Article Two", "Text 2."))),
        );

        const urls = [
            "https://en.wikipedia.org/wiki/Article_One",
            "https://en.wikipedia.org/wiki/Article_Two",
        ];
        const result = await fetchAllArticles(urls);
        expect(result.size).toBe(2);
    });

    it("continues past failing URLs and returns only successful ones", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn()
                .mockResolvedValueOnce(mockResponse(makeWikiApiResponse("Good Article", "Content.")))
                .mockRejectedValueOnce(new Error("Network error")),
        );
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await fetchAllArticles([
            "https://en.wikipedia.org/wiki/Good_Article",
            "https://en.wikipedia.org/wiki/Bad_Article",
        ]);

        expect(result.size).toBe(1);
        expect(result.has("https://en.wikipedia.org/wiki/Good_Article")).toBe(true);
        consoleSpy.mockRestore();
    });

    it("logs a warning for failed fetches", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("DNS failure")));
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        await fetchAllArticles(["https://en.wikipedia.org/wiki/Unreachable"]);

        expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch"));
        consoleSpy.mockRestore();
    });

    it("returns an empty Map when all fetches fail", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("All fail")));
        const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const result = await fetchAllArticles([
            "https://en.wikipedia.org/wiki/A",
            "https://en.wikipedia.org/wiki/B",
        ]);

        expect(result.size).toBe(0);
        consoleSpy.mockRestore();
    });
});
