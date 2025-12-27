'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function IssuesPage() {
  const [journals, setJournals] = useState<JournalGroup[]>([]);
  const [loading, setLoading] = useState(true);
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

  async function handleFetchJournalIssues(scraperKey: string) {
    setFetchingJournal(scraperKey);
    setFetchProgress('Loading issue list...');

    // Clear existing issues for this journal immediately
    setJournals(prev => prev.map(j =>
      j.scraperKey === scraperKey ? { ...j, issues: [] } : j
    ));

    try {
      // Fetch issues from 2015 to current year (~10 years of issues)
      const currentYear = new Date().getFullYear();
      const startYear = currentYear - 10;

      // Single API call with year range
      const res = await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&year=${currentYear}&startYear=${startYear}&refresh=true`);
      if (!res.ok) {
        throw new Error('Failed to fetch issue list');
      }

      const data = await res.json();
      const issuesToFetch = data.issues || [];

      // Fetch each issue with delay to avoid rate limiting
      for (let i = 0; i < issuesToFetch.length; i++) {
        const issue = issuesToFetch[i];
        setFetchProgress(`Fetching issue ${i + 1}/${issuesToFetch.length} (Vol.${issue.volume} No.${issue.issue})...`);

        await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&issue=${issue.id}`);

        // Add the fetched issue to the display immediately
        setJournals(prev => prev.map(j => {
          if (j.scraperKey !== scraperKey) return j;
          // Add new issue if not already present
          const exists = j.issues.some(existing => existing.issue_id === issue.id);
          if (exists) return j;
          return {
            ...j,
            issues: [...j.issues, {
              issue_id: issue.id,
              journal_name: j.name,
              issue_info: { year: issue.year, volume: issue.volume, issue: issue.issue },
              article_count: 0, // Will be updated on final refresh
              has_summary: false,
              cached_at: new Date().toISOString(),
            }].sort((a, b) => {
              // Sort by year desc, volume desc, issue desc
              const yearDiff = parseInt(b.issue_info.year || '0', 10) - parseInt(a.issue_info.year || '0', 10);
              if (yearDiff !== 0) return yearDiff;
              const volDiff = parseInt(b.issue_info.volume || '0', 10) - parseInt(a.issue_info.volume || '0', 10);
              if (volDiff !== 0) return volDiff;
              return parseInt(b.issue_info.issue || '0', 10) - parseInt(a.issue_info.issue || '0', 10);
            }),
          };
        }));

        // Add 1 second delay between requests to avoid rate limiting
        if (i < issuesToFetch.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      setFetchProgress('Done!');
      // Final refresh to get accurate article counts
      await fetchIssues();
    } catch (err) {
      console.error('Failed to fetch journal issues:', err);
      setFetchProgress('Error fetching issues');
      // Refresh to restore any cached data
      await fetchIssues();
    } finally {
      setFetchingJournal(null);
      setTimeout(() => setFetchProgress(''), 2000);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-gray-500">Loading issues...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6 text-white">Journal Issues</h1>

      {journals.length === 0 ? (
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-8 text-center text-gray-500">
          No journals found. Check that scrapers are registered.
        </div>
      ) : (
        <div className="space-y-8">
          {journals.map((journal) => (
            <div key={journal.scraperKey} className="bg-gray-900 rounded-lg border border-gray-800">
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-lg text-white">{journal.name}</h2>
                  <p className="text-sm text-gray-500">{journal.issues.length} issues cached</p>
                </div>
                <div className="flex items-center gap-3">
                  {fetchingJournal === journal.scraperKey && fetchProgress && (
                    <span className="text-sm text-gray-400">{fetchProgress}</span>
                  )}
                  <button
                    onClick={() => handleFetchJournalIssues(journal.scraperKey)}
                    disabled={fetchingJournal === journal.scraperKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-wait text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {fetchingJournal === journal.scraperKey
                      ? 'Fetching...'
                      : journal.issues.length === 0
                        ? 'Fetch Issues'
                        : 'Refetch'}
                  </button>
                </div>
              </div>
              {journal.issues.length === 0 ? (
                <div className="p-4 text-gray-500 text-sm">
                  No issues cached yet. Click &quot;Fetch Issues&quot; to get the latest issues.
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {journal.issues.map((issue) => (
                    <Link
                      key={issue.issue_id}
                      href={`/issues/${journal.scraperKey}/${issue.issue_id}`}
                      className="flex items-center justify-between p-4 hover:bg-gray-800/50 transition-colors"
                    >
                      <div>
                        <div className="font-medium text-white">
                          Vol.{issue.issue_info.volume} No.{issue.issue_info.issue}
                          <span className="text-gray-400 ml-2">({issue.issue_info.year})</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          {issue.article_count} articles
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {issue.has_summary && (
                          <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs">
                            AI Summary
                          </span>
                        )}
                        <span className="text-gray-500">→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
