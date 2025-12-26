'use client';

import { useState, useEffect, useCallback } from 'react';

interface Source {
  id: string;
  name: string;
  type: string;
  url: string;
  config: { scraper?: string } | null;
  totalPapers: number;
  withFullText: number;
}

interface IssueInfo {
  id: string;
  volume: string;
  issue: string;
  year: string;
}

interface UnifiedArticle {
  id: string;
  title: string;
  authors: string[];
  year: string;
  volume: string;
  issue: string;
  url: string;
  pdfUrl: string;
  // Database status
  isScraped: boolean;
  dbPaperId: string | null;
  hasFullText: boolean;
  fullTextLength: number;
  localPdfUrl: string | null;
}

interface PaperDetail {
  id: string;
  title: string;
  authors: { name: string }[];
  volume: string;
  issue: string;
  url: string;
  full_text: string | null;
  sources: { name: string };
}

export default function ScraperDashboard() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Issue selection
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [availableIssues, setAvailableIssues] = useState<IssueInfo[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);

  // Unified articles view
  const [articles, setArticles] = useState<UnifiedArticle[]>([]);
  const [journalName, setJournalName] = useState<string>('');
  const [scrapingArticleId, setScrapingArticleId] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState<boolean>(false);

  // Client-side cache for instant switching between issues
  const [articlesCache, setArticlesCache] = useState<Map<string, { articles: UnifiedArticle[], journal: string }>>(new Map());

  // Detail modal
  const [selectedPaper, setSelectedPaper] = useState<PaperDetail | null>(null);

  // Fetch sources
  const fetchSources = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test/papers');
      const data = await res.json();
      setSources(data.sources || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Load issues for selected year
  const loadIssues = async (scraperKey: string, year: number) => {
    setLoading(true);
    setAvailableIssues([]);
    setSelectedIssueId(null);
    setArticles([]);

    try {
      const res = await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&year=${year}`);
      const data = await res.json();
      setAvailableIssues(data.issues || []);
    } catch (err) {
      console.error('Load issues error:', err);
    }
    setLoading(false);
  };

  // Load articles for selected issue (unified view)
  const loadArticles = async (scraperKey: string, issueId: string, refresh = false) => {
    const cacheKey = `${scraperKey}:${issueId}`;

    // Check client-side cache first (unless refresh requested)
    if (!refresh && articlesCache.has(cacheKey)) {
      const cached = articlesCache.get(cacheKey)!;
      setArticles(cached.articles);
      setJournalName(cached.journal);
      setFromCache(true);
      return;
    }

    setLoading(true);
    setArticles([]);

    try {
      const url = `/api/test/issue-articles?scraper=${scraperKey}&issue=${issueId}${refresh ? '&refresh=true' : ''}`;
      const res = await fetch(url);
      const data = await res.json();
      const newArticles = data.articles || [];
      const journal = data.journal || '';

      setArticles(newArticles);
      setJournalName(journal);
      setFromCache(data.fromCache || false);

      // Store in client-side cache
      setArticlesCache(prev => new Map(prev).set(cacheKey, { articles: newArticles, journal }));
    } catch (err) {
      console.error('Load articles error:', err);
    }
    setLoading(false);
  };

  // Scrape a single article
  const scrapeArticle = async (scraperKey: string, issueId: string, articleId: string) => {
    setScrapingArticleId(articleId);

    try {
      const res = await fetch(
        `/api/test/scrape-journal?scraper=${scraperKey}&issue=${issueId}&article=${articleId}&extract=true&save=true`
      );
      const data = await res.json();

      if (!data.error) {
        // Clear client cache for this issue so we get fresh scraped status
        const cacheKey = `${scraperKey}:${issueId}`;
        setArticlesCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(cacheKey);
          return newCache;
        });

        // Refresh the articles list to show updated status
        await loadArticles(scraperKey, issueId);
        // Also refresh source counts
        await fetchSources();
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }

    setScrapingArticleId(null);
  };

  // Fetch paper detail
  const fetchPaperDetail = async (paperId: string) => {
    const res = await fetch(`/api/test/papers?paper_id=${paperId}`);
    const data = await res.json();
    setSelectedPaper(data.paper);
  };

  const selectedSourceData = sources.find(s => s.id === selectedSource);
  const scraperKey = selectedSourceData?.config?.scraper;
  const scrapedCount = articles.filter(a => a.isScraped).length;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📚 Scraper Dashboard</h1>

        {/* Sources */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Sources</h2>
            <button
              onClick={() => fetchSources()}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>

          {/* Show setup option if no sources */}
          {sources.length === 0 && !loading && (
            <div className="p-6 bg-gray-800 rounded-lg text-center">
              <p className="text-gray-400 mb-4">No journal scrapers configured yet.</p>
              <button
                onClick={async () => {
                  await fetch('/api/test/papers?setup=counselors');
                  fetchSources();
                }}
                className="px-6 py-3 bg-green-600 rounded-lg hover:bg-green-700 font-semibold"
              >
                ➕ Setup 한국상담학회지 Scraper
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sources.map(source => (
              <div
                key={source.id}
                onClick={() => {
                  setSelectedSource(source.id);
                  setAvailableIssues([]);
                  setSelectedIssueId(null);
                  setArticles([]);
                }}
                className={`p-4 rounded-lg cursor-pointer transition ${
                  selectedSource === source.id
                    ? 'bg-blue-800 border-2 border-blue-500'
                    : 'bg-gray-800 hover:bg-gray-700'
                }`}
              >
                <h3 className="font-semibold text-lg">{source.name}</h3>
                <p className="text-gray-400 text-sm">{source.type}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  <span className="text-green-400">{source.totalPapers} papers</span>
                  <span className="text-yellow-400">{source.withFullText} with text</span>
                </div>
                {source.config?.scraper && (
                  <span className="inline-block mt-2 px-2 py-1 bg-purple-700 rounded text-xs">
                    scraper: {source.config.scraper}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Issue Selection */}
        {selectedSource && scraperKey && (
          <div className="mb-8 p-4 bg-gray-800 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">📅 Select Issue</h2>

            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Year:</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="bg-gray-700 text-white px-3 py-2 rounded"
                >
                  {Array.from({ length: new Date().getFullYear() - 1999 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => loadIssues(scraperKey, selectedYear)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Loading...' : '📅 Load Issues'}
              </button>
            </div>

            {/* Issue buttons */}
            {availableIssues.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableIssues.map(iss => (
                  <button
                    key={iss.id}
                    onClick={() => {
                      setSelectedIssueId(iss.id);
                      loadArticles(scraperKey, iss.id);
                    }}
                    className={`px-3 py-2 rounded ${
                      selectedIssueId === iss.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    제{iss.volume}권 제{iss.issue}호
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unified Articles Table */}
        {selectedIssueId && articles.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold">
                  📄 {journalName} - 제{articles[0]?.volume}권 제{articles[0]?.issue}호
                </h2>
                {fromCache && (
                  <span className="px-2 py-0.5 bg-gray-700 rounded text-xs text-gray-400">
                    cached
                  </span>
                )}
                <button
                  onClick={() => loadArticles(scraperKey!, selectedIssueId, true)}
                  disabled={loading}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs disabled:opacity-50"
                  title="Refresh from website"
                >
                  🔄 Refresh
                </button>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm">
                  <span className="text-green-400">{scrapedCount}</span>
                  <span className="text-gray-400"> / {articles.length} scraped</span>
                </span>
                {scrapedCount < articles.length && (
                  <button
                    onClick={async () => {
                      for (const article of articles) {
                        if (!article.isScraped) {
                          await scrapeArticle(scraperKey!, selectedIssueId, article.id);
                        }
                      }
                    }}
                    disabled={!!scrapingArticleId}
                    className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                  >
                    Scrape All Remaining
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
                    <th className="py-3 px-2 w-16">Year</th>
                    <th className="py-3 px-2 w-12">Vol</th>
                    <th className="py-3 px-2 w-12">No.</th>
                    <th className="py-3 px-2">제목</th>
                    <th className="py-3 px-2 w-40">저자</th>
                    <th className="py-3 px-2 w-32 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map(article => (
                    <tr
                      key={article.id}
                      onClick={() => article.dbPaperId && fetchPaperDetail(article.dbPaperId)}
                      className={`border-b border-gray-800 transition ${
                        article.isScraped ? 'hover:bg-gray-800 cursor-pointer' : ''
                      } ${selectedPaper?.id === article.dbPaperId ? 'bg-blue-900' : ''}`}
                    >
                      <td className="py-3 px-2 text-gray-400 text-sm">
                        {article.year || '-'}
                      </td>
                      <td className="py-3 px-2 text-gray-400 text-sm">
                        {article.volume || '-'}
                      </td>
                      <td className="py-3 px-2 text-gray-400 text-sm">
                        {article.issue || '-'}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium text-sm">{article.title}</div>
                      </td>
                      <td className="py-3 px-2 text-gray-400 text-sm">
                        {article.authors?.join(', ') || '-'}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {article.isScraped ? (
                          <div className="flex items-center justify-center gap-2">
                            {article.localPdfUrl && (
                              <a
                                href={article.localPdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                              >
                                📄 PDF
                              </a>
                            )}
                            <span className="text-green-400 text-sm">
                              ✓ {(article.fullTextLength / 1000).toFixed(1)}k
                            </span>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              scrapeArticle(scraperKey!, selectedIssueId, article.id);
                            }}
                            disabled={scrapingArticleId === article.id}
                            className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                          >
                            {scrapingArticleId === article.id ? '⏳ Scraping...' : '📥 Scrape'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading && articles.length === 0 && selectedIssueId && (
          <div className="text-center py-8 text-gray-400">Loading articles...</div>
        )}

        {/* Paper Detail Modal */}
        {selectedPaper && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="p-6 border-b border-gray-700">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold">{selectedPaper.title}</h2>
                    <p className="text-gray-400 mt-1">
                      {selectedPaper.authors?.map(a => a.name).join(', ')}
                    </p>
                    <p className="text-gray-500 text-sm mt-1">
                      {selectedPaper.sources?.name} · 제{selectedPaper.volume || '?'}권 제{selectedPaper.issue || '?'}호
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedPaper(null)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ✕
                  </button>
                </div>
                {selectedPaper.url && (
                  <a
                    href={selectedPaper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline text-sm mt-2 inline-block"
                  >
                    🔗 View original
                  </a>
                )}
              </div>
              <div className="p-6 overflow-auto flex-1">
                <h3 className="font-semibold mb-2">
                  Full Text {selectedPaper.full_text && `(${(selectedPaper.full_text.length / 1000).toFixed(1)}k chars)`}
                </h3>
                {selectedPaper.full_text ? (
                  <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono bg-gray-900 p-4 rounded">
                    {selectedPaper.full_text}
                  </pre>
                ) : (
                  <p className="text-gray-500">No full text extracted yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
