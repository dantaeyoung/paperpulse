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
    try {
      const currentYear = new Date().getFullYear();
      const res = await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&year=${currentYear}`);
      if (res.ok) {
        const data = await res.json();
        // Fetch each issue to populate the cache
        for (const issue of data.issues || []) {
          await fetch(`/api/test/scrape-journal?scraper=${scraperKey}&issue=${issue.id}`);
        }
        // Refresh the page data
        await fetchIssues();
      }
    } catch (err) {
      console.error('Failed to fetch journal issues:', err);
    } finally {
      setFetchingJournal(null);
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
                {journal.issues.length === 0 && (
                  <button
                    onClick={() => handleFetchJournalIssues(journal.scraperKey)}
                    disabled={fetchingJournal === journal.scraperKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-wait text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {fetchingJournal === journal.scraperKey ? 'Fetching...' : 'Fetch Issues'}
                  </button>
                )}
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
