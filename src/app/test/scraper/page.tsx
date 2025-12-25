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

interface VolumeInfo {
  volume: string;
  issue: string;
  count: number;
}

interface Paper {
  id: string;
  external_id: string;
  title: string;
  authors: { name: string }[];
  volume: string;
  issue: string;
  published_at: string;
  hasFullText: boolean;
  fullTextLength: number;
  fullTextPreview: string | null;
  collected_at: string;
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

interface ScrapedArticle {
  id: string;
  title: string;
  authors: string[];
  pdfUrl: string;
}

export default function ScraperDashboard() {
  const [sources, setSources] = useState<Source[]>([]);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);

  // For scraping new articles
  const [availableIssues, setAvailableIssues] = useState<{ id: string; volume: string; issue: string; year: string }[]>([]);
  const [selectedScrapeIssue, setSelectedScrapeIssue] = useState<string | null>(null);
  const [articlesToScrape, setArticlesToScrape] = useState<ScrapedArticle[]>([]);
  const [scrapingArticleId, setScrapingArticleId] = useState<string | null>(null);

  // Fetch sources and papers
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = '/api/test/papers';
      const params = new URLSearchParams();
      if (selectedSource) params.set('source_id', selectedSource);
      if (selectedVolume) params.set('volume', selectedVolume);
      if (selectedIssue) params.set('issue', selectedIssue);
      if (params.toString()) url += '?' + params.toString();

      const res = await fetch(url);
      const data = await res.json();

      setSources(data.sources || []);
      setVolumes(data.volumes || []);
      setPapers(data.papers || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  }, [selectedSource, selectedVolume, selectedIssue]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch single paper detail
  const fetchPaperDetail = async (paperId: string) => {
    const res = await fetch(`/api/test/papers?paper_id=${paperId}`);
    const data = await res.json();
    setSelectedPaper(data.paper);
  };

  // Run scraper
  const runScraper = async (scraperKey: string, issueId?: string) => {
    setScraping(true);
    setScrapeLog(['Starting scraper...']);

    try {
      let url = `/api/test/scrape-journal?scraper=${scraperKey}`;
      if (issueId) {
        url += `&issue=${issueId}&extract=true&save=true`;
      } else {
        url += `&year=${new Date().getFullYear()}`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.logs) {
        setScrapeLog(data.logs);
      } else if (data.issues) {
        setScrapeLog([`Found ${data.issues.length} issues for ${data.year}`]);
      } else {
        setScrapeLog([JSON.stringify(data, null, 2)]);
      }

      // Refresh data after scraping
      await fetchData();
    } catch (err) {
      setScrapeLog([`Error: ${err instanceof Error ? err.message : 'Unknown'}`]);
    }
    setScraping(false);
  };

  const selectedSourceData = sources.find(s => s.id === selectedSource);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">📚 Scraper Dashboard</h1>

        {/* Sources */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Sources</h2>
            <button
              onClick={() => fetchData()}
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
                  fetchData();
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
                  setSelectedVolume(null);
                  setSelectedIssue(null);
                  setSelectedPaper(null);
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

        {/* Scraper Controls */}
        {selectedSourceData?.config?.scraper && (
          <div className="mb-8 p-4 bg-gray-800 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">🔧 Scrape New Articles</h2>

            {/* Step 1: Load Issues */}
            <div className="mb-4">
              <button
                onClick={async () => {
                  setScraping(true);
                  setScrapeLog(['Loading issues...']);
                  try {
                    const res = await fetch(`/api/test/scrape-journal?scraper=${selectedSourceData.config!.scraper}&year=${new Date().getFullYear()}`);
                    const data = await res.json();
                    setAvailableIssues(data.issues || []);
                    setScrapeLog([`Found ${data.issues?.length || 0} issues for ${data.year}`]);
                  } catch (err) {
                    setScrapeLog([`Error: ${err}`]);
                  }
                  setScraping(false);
                }}
                disabled={scraping}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {scraping ? 'Loading...' : '📅 Load Issues'}
              </button>
            </div>

            {/* Step 2: Select Issue */}
            {availableIssues.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Select Issue:</label>
                <div className="flex flex-wrap gap-2">
                  {availableIssues.map(iss => (
                    <button
                      key={iss.id}
                      onClick={async () => {
                        setSelectedScrapeIssue(iss.id);
                        setScraping(true);
                        setScrapeLog([`Loading articles from issue ${iss.id}...`]);
                        try {
                          const res = await fetch(`/api/test/scrape-journal?scraper=${selectedSourceData.config!.scraper}&issue=${iss.id}`);
                          const data = await res.json();
                          setArticlesToScrape(data.articles || []);
                          setScrapeLog([`Found ${data.articles?.length || 0} articles`]);
                        } catch (err) {
                          setScrapeLog([`Error: ${err}`]);
                        }
                        setScraping(false);
                      }}
                      className={`px-3 py-1 rounded ${
                        selectedScrapeIssue === iss.id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                    >
                      제{iss.volume}권 제{iss.issue}호
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Scrape Individual Articles */}
            {articlesToScrape.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Articles to Scrape:</label>
                <div className="space-y-2 max-h-60 overflow-auto">
                  {articlesToScrape.map(article => (
                    <div key={article.id} className="flex items-center justify-between p-2 bg-gray-700 rounded">
                      <div className="flex-1 mr-4">
                        <div className="text-sm">{article.title}</div>
                        <div className="text-xs text-gray-400">{article.authors?.join(', ')}</div>
                      </div>
                      <button
                        onClick={async () => {
                          setScrapingArticleId(article.id);
                          setScrapeLog(prev => [...prev, `Scraping: ${article.title.substring(0, 40)}...`]);
                          try {
                            // Scrape this single article with PDF extraction
                            const res = await fetch(
                              `/api/test/scrape-journal?scraper=${selectedSourceData.config!.scraper}&issue=${selectedScrapeIssue}&article=${article.id}&extract=true&save=true`
                            );
                            const data = await res.json();
                            if (data.error) {
                              setScrapeLog(prev => [...prev, `✗ Error: ${data.error}`]);
                            } else {
                              const savedArticle = data.articles?.find((a: ScrapedArticle) => a.id === article.id);
                              const textLen = savedArticle?.extractedTextLength || 0;
                              setScrapeLog(prev => [...prev, `✓ Saved! ${textLen > 0 ? `(${(textLen/1000).toFixed(1)}k chars)` : '(no text)'}`]);
                              // Refresh data
                              fetchData();
                            }
                          } catch (err) {
                            setScrapeLog(prev => [...prev, `✗ Failed: ${err}`]);
                          }
                          setScrapingArticleId(null);
                        }}
                        disabled={scrapingArticleId === article.id}
                        className="px-3 py-1 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 text-sm whitespace-nowrap"
                      >
                        {scrapingArticleId === article.id ? '⏳ Scraping...' : '📥 Scrape'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Log */}
            {scrapeLog.length > 0 && (
              <div className="mt-4 p-3 bg-black rounded font-mono text-sm max-h-40 overflow-auto">
                {scrapeLog.map((log, i) => (
                  <div key={i} className="text-gray-300">{log}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Volumes & Issues */}
        {selectedSource && volumes.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">📖 Volumes & Issues</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setSelectedVolume(null);
                  setSelectedIssue(null);
                }}
                className={`px-3 py-1 rounded ${
                  !selectedVolume ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                All
              </button>
              {volumes.map(v => (
                <button
                  key={`${v.volume}-${v.issue}`}
                  onClick={() => {
                    setSelectedVolume(v.volume);
                    setSelectedIssue(v.issue);
                    setSelectedPaper(null);
                  }}
                  className={`px-3 py-1 rounded ${
                    selectedVolume === v.volume && selectedIssue === v.issue
                      ? 'bg-blue-600'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  제{v.volume}권 제{v.issue}호 ({v.count}건)
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Papers Table */}
        {selectedSource && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              📄 Papers {papers.length > 0 && `(${papers.length})`}
            </h2>
            {papers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-gray-700 text-left text-sm text-gray-400">
                      <th className="py-3 px-2 w-16">Year</th>
                      <th className="py-3 px-2 w-16">Vol</th>
                      <th className="py-3 px-2 w-16">No.</th>
                      <th className="py-3 px-2">제목</th>
                      <th className="py-3 px-2 w-48">저자</th>
                      <th className="py-3 px-2 w-24 text-center">PDF</th>
                      <th className="py-3 px-2 w-20 text-right">Text</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map(paper => (
                      <tr
                        key={paper.id}
                        onClick={() => fetchPaperDetail(paper.id)}
                        className={`border-b border-gray-800 cursor-pointer transition hover:bg-gray-800 ${
                          selectedPaper?.id === paper.id ? 'bg-blue-900' : ''
                        }`}
                      >
                        <td className="py-3 px-2 text-gray-400 text-sm">
                          {paper.published_at?.substring(0, 4) || '-'}
                        </td>
                        <td className="py-3 px-2 text-gray-400 text-sm">
                          {paper.volume || '-'}
                        </td>
                        <td className="py-3 px-2 text-gray-400 text-sm">
                          {paper.issue || '-'}
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-medium text-sm">{paper.title}</div>
                        </td>
                        <td className="py-3 px-2 text-gray-400 text-sm">
                          {paper.authors?.map(a => a.name).join(', ') || '-'}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {paper.localPdfUrl ? (
                            <a
                              href={paper.localPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-block px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                            >
                              📄 PDF
                            </a>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-right text-sm">
                          {paper.hasFullText ? (
                            <span className="text-green-400">
                              ✓ {(paper.fullTextLength / 1000).toFixed(1)}k
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !loading && <p className="text-gray-500">No papers found. Try scraping some issues first.</p>
            )}
          </div>
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
