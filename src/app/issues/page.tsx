'use client';

import { useEffect, useState } from 'react';

interface CachedIssue {
  issue_id: string;
  journal_name: string;
  issue_info: {
    year?: string;
    volume?: string;
    issue?: string;
  };
  article_count: number;
  has_summary: boolean;
  cached_at: string;
}

interface JournalGroup {
  scraperKey: string;
  name: string;
  issues: CachedIssue[];
}

interface CachedArticle {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  volume?: string;
  issue?: string;
  paperNumber?: number;
  url?: string;
  pdfUrl?: string;
}

export default function IssuesPage() {
  const [journals, setJournals] = useState<JournalGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [articles, setArticles] = useState<CachedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [fetchingJournal, setFetchingJournal] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<string>('');

  async function fetchIssues() {
    try {
      const res = await fetch('/api/issues');
      if (res.ok) {
        const data = await res.json();
        setJournals(data.journals || []);
      }
    } catch (err) {
      console.error('Failed to fetch issues:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchIssues();
  }, []);

  // Fetch articles when an issue is selected
  useEffect(() => {
    if (!selectedJournal || !selectedIssue) {
      setArticles([]);
      return;
    }

    async function fetchArticles() {
      setLoadingArticles(true);
      try {
        const res = await fetch(`/api/test/issue-articles?scraper=${selectedJournal}&issue=${selectedIssue}`);
        if (res.ok) {
          const data = await res.json();
          setArticles(data.articles || []);
        }
      } catch (err) {
        console.error('Failed to fetch articles:', err);
      } finally {
        setLoadingArticles(false);
      }
    }
    fetchArticles();
  }, [selectedJournal, selectedIssue]);

  async function handleFetchJournalIssues(scraperKey: string) {
    setFetchingJournal(scraperKey);
    setFetchProgress('Loading issue list...');

    // Clear existing issues for this journal immediately
    setJournals(prev => prev.map(j =>
      j.scraperKey === scraperKey ? { ...j, issues: [] } : j
    ));

    try {
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 10;

      const res = await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&year=${currentYear}&startYear=${startYear}&refresh=true`);
      if (!res.ok) {
        throw new Error('Failed to fetch issue list');
      }

      const data = await res.json();
      const issuesToFetch = data.issues || [];

      for (let i = 0; i < issuesToFetch.length; i++) {
        const issue = issuesToFetch[i];
        setFetchProgress(`${i + 1}/${issuesToFetch.length}`);

        await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&issue=${issue.id}`);

        setJournals(prev => prev.map(j => {
          if (j.scraperKey !== scraperKey) return j;
          const exists = j.issues.some(existing => existing.issue_id === issue.id);
          if (exists) return j;
          return {
            ...j,
            issues: [...j.issues, {
              issue_id: issue.id,
              journal_name: j.name,
              issue_info: { year: issue.year, volume: issue.volume, issue: issue.issue },
              article_count: 0,
              has_summary: false,
              cached_at: new Date().toISOString(),
            }].sort((a, b) => {
              const yearDiff = parseInt(b.issue_info.year || '0', 10) - parseInt(a.issue_info.year || '0', 10);
              if (yearDiff !== 0) return yearDiff;
              const volDiff = parseInt(b.issue_info.volume || '0', 10) - parseInt(a.issue_info.volume || '0', 10);
              if (volDiff !== 0) return volDiff;
              return parseInt(b.issue_info.issue || '0', 10) - parseInt(a.issue_info.issue || '0', 10);
            }),
          };
        }));

        if (i < issuesToFetch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setFetchProgress('');
      await fetchIssues();
    } catch (err) {
      console.error('Failed to fetch journal issues:', err);
      setFetchProgress('Error');
      await fetchIssues();
    } finally {
      setFetchingJournal(null);
      setTimeout(() => setFetchProgress(''), 2000);
    }
  }

  const selectedJournalData = journals.find(j => j.scraperKey === selectedJournal);
  const selectedIssueData = selectedJournalData?.issues.find(i => i.issue_id === selectedIssue);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white">Journal Browser</h1>
      </div>

      {/* Three column layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Journals */}
        <div className="w-64 border-r border-gray-800 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Journals
          </div>
          <div className="flex-1 overflow-y-auto">
            {journals.map((journal) => (
              <button
                key={journal.scraperKey}
                onClick={() => {
                  setSelectedJournal(journal.scraperKey);
                  setSelectedIssue(null);
                }}
                className={`w-full text-left px-3 py-2 border-b border-gray-800/50 transition-colors ${
                  selectedJournal === journal.scraperKey
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800/50'
                }`}
              >
                <div className="font-medium text-sm truncate">{journal.name}</div>
                <div className={`text-xs ${selectedJournal === journal.scraperKey ? 'text-blue-200' : 'text-gray-500'}`}>
                  {journal.issues.length} issues
                  {fetchingJournal === journal.scraperKey && fetchProgress && (
                    <span className="ml-2">({fetchProgress})</span>
                  )}
                </div>
              </button>
            ))}
          </div>
          {/* Refetch button at bottom */}
          {selectedJournal && (
            <div className="p-2 border-t border-gray-800">
              <button
                onClick={() => handleFetchJournalIssues(selectedJournal)}
                disabled={fetchingJournal === selectedJournal}
                className="w-full px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-wait text-gray-300 rounded text-xs font-medium transition-colors"
              >
                {fetchingJournal === selectedJournal ? 'Fetching...' : 'Refetch Issues'}
              </button>
            </div>
          )}
        </div>

        {/* Column 2: Issues */}
        <div className="w-72 border-r border-gray-800 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Issues {selectedJournalData && `(${selectedJournalData.issues.length})`}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedJournal ? (
              <div className="p-4 text-sm text-gray-500">Select a journal</div>
            ) : selectedJournalData?.issues.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">
                No issues cached. Click &quot;Refetch Issues&quot; below.
              </div>
            ) : (
              selectedJournalData?.issues.map((issue) => (
                <button
                  key={issue.issue_id}
                  onClick={() => setSelectedIssue(issue.issue_id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-800/50 transition-colors ${
                    selectedIssue === issue.issue_id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  <div className="font-medium text-sm">
                    Vol.{issue.issue_info.volume} No.{issue.issue_info.issue}
                  </div>
                  <div className={`text-xs ${selectedIssue === issue.issue_id ? 'text-blue-200' : 'text-gray-500'}`}>
                    {issue.issue_info.year} · {issue.article_count} articles
                    {issue.has_summary && ' · AI Summary'}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Column 3: Articles */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3 py-2 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>
              Articles {selectedIssueData && `(${articles.length})`}
            </span>
            {selectedIssue && (
              <a
                href={`/issues/${selectedJournal}/${selectedIssue}`}
                className="text-blue-400 hover:text-blue-300 normal-case font-normal"
              >
                Open full view →
              </a>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selectedIssue ? (
              <div className="p-4 text-sm text-gray-500">Select an issue</div>
            ) : loadingArticles ? (
              <div className="p-4 text-sm text-gray-500">Loading articles...</div>
            ) : articles.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">No articles found</div>
            ) : (
              articles.map((article, idx) => (
                <div
                  key={article.id}
                  className="px-4 py-3 border-b border-gray-800/50 hover:bg-gray-800/30"
                >
                  <div className="text-sm font-medium text-white leading-snug">
                    {article.paperNumber && (
                      <span className="text-gray-500 mr-2">{article.paperNumber}.</span>
                    )}
                    {article.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {article.authors?.join(', ')}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
