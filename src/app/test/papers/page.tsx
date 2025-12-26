'use client';

import { useState, useEffect, useMemo } from 'react';

interface Paper {
  id: string;
  scraperKey: string;
  journal: string;
  year: string;
  volume: string;
  issue: string;
  title: string;
  authors: string[];
  url: string;
  pdfUrl: string;
  isScraped: boolean;
  hasFullText: boolean;
  fullTextLength: number;
  localPdfUrl: string | null;
}

export default function AllPapersPage() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, scraped: 0, withFullText: 0 });

  // Filters
  const [yearFilter, setYearFilter] = useState<string>('');
  const [volumeFilter, setVolumeFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, scraped, unscraped

  // Scraping
  const [scrapingId, setScrapingId] = useState<string | null>(null);
  const [bulkScraping, setBulkScraping] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string>('');

  useEffect(() => {
    fetchPapers();
  }, []);

  // Scrape all issues to populate the cache
  const scrapeAllIssues = async () => {
    setBulkScraping(true);
    setBulkProgress('Starting bulk scrape...');

    try {
      const res = await fetch('/api/test/scrape-all?scraper=counselors&start=2000');
      const data = await res.json();

      if (data.success) {
        setBulkProgress(`Done! ${data.totalIssues} issues, ${data.totalArticles} papers cached.`);
        // Refresh the papers list
        await fetchPapers();
      } else {
        setBulkProgress(`Error: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Bulk scrape error:', err);
      setBulkProgress('Error: Failed to scrape');
    }

    setBulkScraping(false);
  };

  const fetchPapers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/test/all-papers');
      const data = await res.json();
      setPapers(data.papers || []);
      setStats({
        total: data.totalPapers || 0,
        scraped: data.scrapedCount || 0,
        withFullText: data.withFullTextCount || 0,
      });
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  };

  // Get unique years and volumes for filters
  const years = useMemo(() => {
    const uniqueYears = [...new Set(papers.map(p => p.year).filter(Boolean))];
    return uniqueYears.sort((a, b) => parseInt(b) - parseInt(a));
  }, [papers]);

  const volumes = useMemo(() => {
    const uniqueVolumes = [...new Set(papers.map(p => p.volume).filter(Boolean))];
    return uniqueVolumes.sort((a, b) => parseInt(b) - parseInt(a));
  }, [papers]);

  // Filter papers
  const filteredPapers = useMemo(() => {
    return papers.filter(paper => {
      if (yearFilter && paper.year !== yearFilter) return false;
      if (volumeFilter && paper.volume !== volumeFilter) return false;
      if (statusFilter === 'scraped' && !paper.isScraped) return false;
      if (statusFilter === 'unscraped' && paper.isScraped) return false;
      if (searchFilter) {
        const search = searchFilter.toLowerCase();
        const matchesTitle = paper.title.toLowerCase().includes(search);
        const matchesAuthor = paper.authors.some(a => a.toLowerCase().includes(search));
        if (!matchesTitle && !matchesAuthor) return false;
      }
      return true;
    });
  }, [papers, yearFilter, volumeFilter, searchFilter, statusFilter]);

  // Scrape a single paper
  const scrapePaper = async (paper: Paper) => {
    setScrapingId(paper.id);

    try {
      // We need to figure out the issue ID from the paper's volume/issue
      // For counselors scraper, we can derive catcode from year
      const year = parseInt(paper.year);
      const issueNum = parseInt(paper.issue);
      // catcode = (year - 2000) * 6 + issueNum + some offset... this is complex
      // Let's just use the scrape-journal endpoint with article ID directly

      const res = await fetch(
        `/api/test/scrape-journal?scraper=${paper.scraperKey}&issue=${paper.id.split('-')[0] || paper.id}&article=${paper.id}&extract=true&save=true`
      );
      const data = await res.json();

      if (!data.error) {
        // Refresh the papers list
        await fetchPapers();
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }

    setScrapingId(null);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">📚 All Papers</h1>
          <div className="flex items-center gap-3">
            {bulkProgress && (
              <span className="text-sm text-gray-400">{bulkProgress}</span>
            )}
            <button
              onClick={scrapeAllIssues}
              disabled={bulkScraping || loading}
              className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50"
              title="Fetch all issues from 2000-present and cache them"
            >
              {bulkScraping ? '⏳ Scraping...' : '📥 Scrape All Issues'}
            </button>
            <button
              onClick={fetchPapers}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-400">{stats.total}</div>
            <div className="text-gray-400 text-sm">Total Papers</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">{stats.scraped}</div>
            <div className="text-gray-400 text-sm">Scraped</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-yellow-400">{stats.withFullText}</div>
            <div className="text-gray-400 text-sm">With Full Text</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Year</label>
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
              >
                <option value="">All Years</option>
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Volume (권)</label>
              <select
                value={volumeFilter}
                onChange={(e) => setVolumeFilter(e.target.value)}
                className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
              >
                <option value="">All Volumes</option>
                {volumes.map(vol => (
                  <option key={vol} value={vol}>제{vol}권</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-gray-700 text-white px-3 py-2 rounded text-sm"
              >
                <option value="all">All</option>
                <option value="scraped">Scraped Only</option>
                <option value="unscraped">Not Scraped</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-400 mb-1">Search</label>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search title or author..."
                className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
              />
            </div>
          </div>
          <div className="mt-3 text-sm text-gray-400">
            Showing {filteredPapers.length} of {papers.length} papers
          </div>
        </div>

        {/* Papers Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading papers...</div>
        ) : papers.length === 0 ? (
          <div className="text-center py-12 bg-gray-800 rounded-lg">
            <p className="text-gray-400 mb-4">No papers found in cache.</p>
            <p className="text-gray-500 text-sm">
              Go to <a href="/test/scraper" className="text-blue-400 hover:underline">/test/scraper</a> and load some issues first.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="py-3 px-2 w-16">Year</th>
                  <th className="py-3 px-2 w-14">Vol</th>
                  <th className="py-3 px-2 w-14">No.</th>
                  <th className="py-3 px-2">Title</th>
                  <th className="py-3 px-2 w-40">Authors</th>
                  <th className="py-3 px-2 w-28 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPapers.map((paper, idx) => (
                  <tr
                    key={`${paper.id}-${idx}`}
                    className="border-b border-gray-800 hover:bg-gray-800/50"
                  >
                    <td className="py-2 px-2 text-gray-400">{paper.year || '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{paper.volume || '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{paper.issue || '-'}</td>
                    <td className="py-2 px-2">
                      <a
                        href={paper.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-blue-400"
                      >
                        {paper.title}
                      </a>
                    </td>
                    <td className="py-2 px-2 text-gray-400 truncate max-w-[160px]" title={paper.authors.join(', ')}>
                      {paper.authors.join(', ') || '-'}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {paper.isScraped ? (
                        <div className="flex items-center justify-center gap-2">
                          {paper.localPdfUrl && (
                            <a
                              href={paper.localPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-0.5 bg-red-600 hover:bg-red-700 rounded text-xs"
                            >
                              PDF
                            </a>
                          )}
                          <span className="text-green-400 text-xs">
                            ✓ {(paper.fullTextLength / 1000).toFixed(1)}k
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={() => scrapePaper(paper)}
                          disabled={scrapingId === paper.id}
                          className="px-2 py-0.5 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50 text-xs"
                        >
                          {scrapingId === paper.id ? '⏳...' : '📥 Scrape'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
