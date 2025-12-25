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
  const [volumes, setVolumes] = useState<VolumeInfo[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapeLog, setScrapeLog] = useState<string[]>([]);

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
            <h2 className="text-xl font-semibold mb-4">🔧 Scraper Controls</h2>
            <div className="flex gap-4 flex-wrap">
              <button
                onClick={() => runScraper(selectedSourceData.config!.scraper!)}
                disabled={scraping}
                className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {scraping ? 'Scraping...' : '📥 List Current Year Issues'}
              </button>
            </div>

            {scrapeLog.length > 0 && (
              <div className="mt-4 p-3 bg-black rounded font-mono text-sm max-h-60 overflow-auto">
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
                  Vol.{v.volume} No.{v.issue} ({v.count})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Papers List */}
        {selectedSource && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">
              📄 Papers {papers.length > 0 && `(${papers.length})`}
            </h2>
            <div className="space-y-2">
              {papers.map(paper => (
                <div
                  key={paper.id}
                  onClick={() => fetchPaperDetail(paper.id)}
                  className={`p-4 rounded-lg cursor-pointer transition ${
                    selectedPaper?.id === paper.id
                      ? 'bg-blue-800 border border-blue-500'
                      : 'bg-gray-800 hover:bg-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-medium">{paper.title}</h3>
                      <p className="text-gray-400 text-sm mt-1">
                        {paper.authors?.map(a => a.name).join(', ')}
                      </p>
                    </div>
                    <div className="text-right text-sm ml-4">
                      <div className="text-gray-500">
                        Vol.{paper.volume} No.{paper.issue}
                      </div>
                      {paper.hasFullText ? (
                        <span className="text-green-400">
                          ✓ {(paper.fullTextLength / 1000).toFixed(1)}k chars
                        </span>
                      ) : (
                        <span className="text-gray-500">No text</span>
                      )}
                    </div>
                  </div>
                  {paper.fullTextPreview && (
                    <p className="text-gray-500 text-sm mt-2 line-clamp-2">
                      {paper.fullTextPreview}...
                    </p>
                  )}
                </div>
              ))}
              {papers.length === 0 && !loading && (
                <p className="text-gray-500">No papers found. Try scraping some issues first.</p>
              )}
            </div>
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
                      {selectedPaper.sources?.name} · Vol.{selectedPaper.volume} No.{selectedPaper.issue}
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
