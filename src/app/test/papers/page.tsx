'use client';

import { useState, useEffect, useMemo } from 'react';

interface Paper {
  id: string;
  scraperKey: string;
  journal: string;
  year: string;
  volume: string;
  issue: string;
  paperNumber?: number;
  title: string;
  authors: string[];
  url: string;
  pdfUrl: string;
  isScraped: boolean;
  hasFullText: boolean;
  fullTextLength: number;
  localPdfUrl: string | null;
}

interface PaperDetail extends Paper {
  fullText: string | null;
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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [currentProcessingYear, setCurrentProcessingYear] = useState<number | null>(null);
  const [currentProcessingIssue, setCurrentProcessingIssue] = useState<number | null>(null);
  const [lastFetchedIssueKey, setLastFetchedIssueKey] = useState<string | null>(null);
  const [checkingNew, setCheckingNew] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Paper detail modal
  const [selectedPaper, setSelectedPaper] = useState<PaperDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [scrapingDetail, setScrapingDetail] = useState(false);

  // Check scrape status on load and poll while running
  const checkScrapeStatus = async () => {
    try {
      const res = await fetch('/api/test/scrape-all?status=true');
      const data = await res.json();

      if (data.status === 'running') {
        setBulkScraping(true);
        setBulkProgress(data.progress || 'Compiling...');

        // Parse year and issue from progress message like "Year 2024: Issue 3/6 (Vol.25 No.3)"
        const yearMatch = data.progress?.match(/Year (\d{4})/);
        const issueMatch = data.progress?.match(/No\.(\d+)/);
        if (yearMatch) {
          setCurrentProcessingYear(parseInt(yearMatch[1], 10));
        }
        if (issueMatch) {
          setCurrentProcessingIssue(parseInt(issueMatch[1], 10));
        }
        return true; // Still running
      } else {
        setBulkScraping(false);
        setCurrentProcessingYear(null);
        setCurrentProcessingIssue(null);
        if (data.status === 'completed' && data.result) {
          setBulkProgress(`Done! ${data.result.totalIssues} issues, ${data.result.totalArticles} papers`);
        } else if (data.status === 'error') {
          setBulkProgress(data.progress || 'Error occurred');
        }
        return false; // Not running
      }
    } catch (err) {
      console.error('Status check error:', err);
      return false;
    }
  };

  useEffect(() => {
    fetchPapers();
    checkScrapeStatus();
  }, []);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPaper(null);
        setShowConfirmModal(false);
        setShowCancelModal(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Poll for status while scraping
  useEffect(() => {
    if (!bulkScraping) return;

    const interval = setInterval(async () => {
      const stillRunning = await checkScrapeStatus();

      if (!stillRunning) {
        clearInterval(interval);
        // Final merge when done
        mergePaperUpdates();
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [bulkScraping]);

  // Trigger merge when processing moves to a new issue
  useEffect(() => {
    if (!bulkScraping || currentProcessingYear === null || currentProcessingIssue === null) return;

    const currentKey = `${currentProcessingYear}-${currentProcessingIssue}`;

    // If we've moved to a new issue, merge updates for the completed one
    if (lastFetchedIssueKey !== null && lastFetchedIssueKey !== currentKey) {
      mergePaperUpdates();
    }

    setLastFetchedIssueKey(currentKey);
  }, [bulkScraping, currentProcessingYear, currentProcessingIssue]);

  // Check if a paper's issue has been processed/verified
  // We process from newest to oldest: highest year first, within each year highest issue first
  const isPaperVerified = (paper: Paper): boolean => {
    if (!bulkScraping) return true; // Not scraping, all are "verified"
    if (currentProcessingYear === null) return true;

    const paperYear = parseInt(paper.year, 10);
    const paperIssue = parseInt(paper.issue, 10);

    if (isNaN(paperYear)) return true;

    // Papers from years already fully processed (years > current)
    if (paperYear > currentProcessingYear) return true;

    // Papers from years not yet started (years < current)
    if (paperYear < currentProcessingYear) return false;

    // Same year - check issue number (we go from highest to lowest issue)
    if (isNaN(paperIssue) || currentProcessingIssue === null) return false;

    // Issues >= current are done or in progress
    return paperIssue >= currentProcessingIssue;
  };

  // Start the compilation after confirmation
  const startCompilation = async () => {
    setShowConfirmModal(false);
    setBulkScraping(true);
    setBulkProgress('Starting compilation...');
    setCurrentProcessingYear(null);
    setCurrentProcessingIssue(null);
    setLastFetchedIssueKey(null);

    try {
      // This will start the scrape - we'll poll for status separately
      const res = await fetch('/api/test/scrape-all?scraper=counselors&start=2000');
      const data = await res.json();

      if (data.status === 'running') {
        // Already running (from another tab maybe) - just poll
        return;
      }

      if (data.success) {
        setBulkProgress(`Done! ${data.totalIssues} issues, ${data.totalArticles} papers`);
        await fetchPapers();
        setBulkScraping(false);
      } else if (data.error) {
        setBulkProgress(`Error: ${data.error}`);
        setBulkScraping(false);
      }
    } catch (err) {
      console.error('Compilation error:', err);
      setBulkProgress('Error: Failed to compile');
      setBulkScraping(false);
    }
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

  // Silently merge updated papers without affecting scroll or triggering loading state
  const mergePaperUpdates = async () => {
    try {
      const res = await fetch('/api/test/all-papers');
      const data = await res.json();
      const newPapers: Paper[] = data.papers || [];

      // Create a map of new papers by ID for quick lookup
      const newPapersMap = new Map(newPapers.map(p => [p.id, p]));

      // Update existing papers in place, preserving array order
      setPapers(prevPapers => {
        const existingIds = new Set(prevPapers.map(p => p.id));

        // Update existing papers with new data
        const updatedPapers = prevPapers.map(p => {
          const newData = newPapersMap.get(p.id);
          return newData || p;
        });

        // Add any brand new papers at the beginning (they're newest)
        const brandNewPapers = newPapers.filter(p => !existingIds.has(p.id));

        return [...brandNewPapers, ...updatedPapers];
      });

      setStats({
        total: data.totalPapers || 0,
        scraped: data.scrapedCount || 0,
        withFullText: data.withFullTextCount || 0,
      });
    } catch (err) {
      console.error('Merge error:', err);
    }
  };

  // Cancel the running compilation
  const cancelCompilation = async () => {
    setShowCancelModal(false);
    try {
      await fetch('/api/test/scrape-all/cancel', { method: 'POST' });
      setBulkScraping(false);
      setBulkProgress('Cancelled');
      setCurrentProcessingYear(null);
      setCurrentProcessingIssue(null);
      setLastFetchedIssueKey(null);
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  // Check for new issues only (quick check)
  const checkForNewIssues = async () => {
    setCheckingNew(true);
    setBulkProgress('Checking for new issues...');

    try {
      const res = await fetch('/api/test/check-new-issues?scraper=counselors');
      const data = await res.json();

      if (data.newIssuesCount > 0) {
        setBulkProgress(`Found ${data.newIssuesCount} new issue(s) with ${data.newArticlesCount} papers!`);
        await fetchPapers();
      } else {
        setBulkProgress('No new issues found.');
      }

      // Clear message after a few seconds
      setTimeout(() => {
        setBulkProgress('');
      }, 5000);
    } catch (err) {
      console.error('Check new issues error:', err);
      setBulkProgress('Error checking for new issues');
    }

    setCheckingNew(false);
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

  // Open paper detail modal
  const openPaperModal = async (paper: Paper) => {
    setLoadingDetail(true);
    setSelectedPaper({ ...paper, fullText: null });

    try {
      const res = await fetch(`/api/test/paper/${paper.id}`);
      const data = await res.json();
      if (data.paper) {
        setSelectedPaper(data.paper);
      }
    } catch (err) {
      console.error('Fetch paper detail error:', err);
    }

    setLoadingDetail(false);
  };

  // Scrape paper from modal
  const scrapeFromModal = async () => {
    if (!selectedPaper) return;

    setScrapingDetail(true);

    try {
      const res = await fetch(`/api/test/paper/${selectedPaper.id}/scrape`, { method: 'POST' });
      const data = await res.json();

      if (!data.error) {
        // Refresh paper detail
        const detailRes = await fetch(`/api/test/paper/${selectedPaper.id}`);
        const detailData = await detailRes.json();
        if (detailData.paper) {
          setSelectedPaper(detailData.paper);
        }
        // Also refresh the papers list to update status
        mergePaperUpdates();
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }

    setScrapingDetail(false);
  };

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
              onClick={checkForNewIssues}
              disabled={bulkScraping || loading || checkingNew}
              className="px-4 py-2 bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
              title="Quick check for new issues published since last check"
            >
              {checkingNew ? '⏳ Checking...' : '🔍 Check for new papers'}
            </button>
            {bulkScraping ? (
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
                title="Cancel the running compilation"
              >
                ⏹ Cancel
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmModal(true)}
                disabled={loading || checkingNew}
                className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50"
                title="Re-fetch all issues from 2000-present and update the cache"
              >
                🔄 Re-Compile all
              </button>
            )}
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
                  <th className="py-3 px-2 w-14">Issue</th>
                  <th className="py-3 px-2 w-10">#</th>
                  <th className="py-3 px-2">Title</th>
                  <th className="py-3 px-2 w-40">Authors</th>
                  <th className="py-3 px-2 w-28 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredPapers.map((paper, idx) => (
                  <tr
                    key={`${paper.id}-${idx}`}
                    onClick={() => openPaperModal(paper)}
                    className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-opacity duration-300 ${
                      isPaperVerified(paper) ? 'opacity-100' : 'opacity-40'
                    }`}
                  >
                    <td className="py-2 px-2 text-gray-400">{paper.year || '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{paper.volume || '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{paper.issue || '-'}</td>
                    <td className="py-2 px-2 text-gray-400">{paper.paperNumber || '-'}</td>
                    <td className="py-2 px-2">
                      <span className="hover:text-blue-400">
                        {paper.title}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-gray-400 truncate max-w-[160px]" title={paper.authors.join(', ')}>
                      {paper.authors.join(', ') || '-'}
                    </td>
                    <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
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
                {bulkScraping && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center">
                      <div className="flex items-center justify-center gap-3 text-gray-400">
                        <div className="animate-spin h-5 w-5 border-2 border-purple-500 border-t-transparent rounded-full"></div>
                        <span>Compiling papers... {bulkProgress}</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
              <h2 className="text-xl font-bold mb-4">Re-Compile Paper List?</h2>
              <p className="text-gray-300 mb-6">
                This will re-fetch the list of all papers from 2000 to present.
                This process will take approximately 10 minutes.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={startCompilation}
                  className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700"
                >
                  Yes, Re-Compile
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md mx-4">
              <h2 className="text-xl font-bold mb-4">Cancel Compilation?</h2>
              <p className="text-gray-300 mb-6">
                This will stop the current compilation. Any issues already processed will remain cached.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
                >
                  Continue Compiling
                </button>
                <button
                  onClick={cancelCompilation}
                  className="px-4 py-2 bg-red-600 rounded hover:bg-red-700"
                >
                  Yes, Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Paper Detail Modal */}
        {selectedPaper && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPaper(null)}
          >
            <div
              className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-2">{selectedPaper.title}</h2>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-400">
                      <span>{selectedPaper.journal}</span>
                      <span>•</span>
                      <span>{selectedPaper.year}년</span>
                      <span>•</span>
                      <span>제{selectedPaper.volume}권 제{selectedPaper.issue}호</span>
                      {selectedPaper.paperNumber && (
                        <>
                          <span>•</span>
                          <span>#{selectedPaper.paperNumber}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedPaper(null)}
                    className="text-gray-400 hover:text-white text-2xl leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-6">
                {/* Authors */}
                <div className="mb-4">
                  <span className="text-gray-500 text-sm">Authors: </span>
                  <span className="text-gray-300">{selectedPaper.authors.join(', ') || 'N/A'}</span>
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 mb-6">
                  {selectedPaper.localPdfUrl ? (
                    <a
                      href={selectedPaper.localPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium"
                    >
                      📄 View PDF
                    </a>
                  ) : selectedPaper.pdfUrl ? (
                    <a
                      href={selectedPaper.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded font-medium"
                    >
                      📄 Download PDF (External)
                    </a>
                  ) : null}

                  <a
                    href={selectedPaper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
                  >
                    🔗 Original Page
                  </a>

                  {!selectedPaper.isScraped && (
                    <button
                      onClick={scrapeFromModal}
                      disabled={scrapingDetail}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
                    >
                      {scrapingDetail ? '⏳ Scraping...' : '📥 Scrape Full Text'}
                    </button>
                  )}
                </div>

                {/* Status */}
                <div className="flex items-center gap-4 mb-6">
                  <div className={`px-3 py-1 rounded text-sm ${selectedPaper.isScraped ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                    {selectedPaper.isScraped ? '✓ Scraped' : '○ Not Scraped'}
                  </div>
                  {selectedPaper.hasFullText && (
                    <div className="px-3 py-1 rounded text-sm bg-blue-900 text-blue-300">
                      {(selectedPaper.fullTextLength / 1000).toFixed(1)}k characters
                    </div>
                  )}
                </div>

                {/* Full text */}
                {loadingDetail ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Loading details...
                  </div>
                ) : selectedPaper.hasFullText && selectedPaper.fullText ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Full Text</h3>
                    <div className="bg-gray-900 rounded p-4 max-h-[400px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono">
                        {selectedPaper.fullText}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 rounded p-6 text-center text-gray-500">
                    {selectedPaper.isScraped ? (
                      <p>Full text was not extracted from this paper.</p>
                    ) : (
                      <p>Click "Scrape Full Text" to extract the content from the PDF.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
