'use client';

import { useEffect, useState } from 'react';
import IssueContent from '@/components/IssueContent';

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
  const [selectedJournal, setSelectedJournal] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [fetchingJournal, setFetchingJournal] = useState<string | null>(null);
  const [fetchProgress, setFetchProgress] = useState<string>('');

  // Mobile pane state: 0 = journals, 1 = issues, 2 = content
  const [mobilePane, setMobilePane] = useState(0);

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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Handle journal selection - on mobile, slide to issues pane
  const handleSelectJournal = (scraperKey: string) => {
    setSelectedJournal(scraperKey);
    setSelectedIssue(null);
    setMobilePane(1); // Slide to issues
  };

  // Handle issue selection - on mobile, slide to content pane
  const handleSelectIssue = (issueId: string) => {
    setSelectedIssue(issueId);
    setMobilePane(2); // Slide to content
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header - Desktop */}
      <div className="hidden md:block px-4 py-3 border-b border-gray-800">
        <h1 className="text-lg font-semibold text-white">Journal Browser</h1>
      </div>

      {/* Header - Mobile with back button */}
      <div className="md:hidden px-4 py-3 border-b border-gray-800 flex items-center gap-3">
        {mobilePane > 0 && (
          <button
            onClick={() => setMobilePane(mobilePane - 1)}
            className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span>←</span>
            <span className="text-sm">
              {mobilePane === 1 ? 'Journals' : 'Issues'}
            </span>
          </button>
        )}
        <h1 className="text-lg font-semibold text-white flex-1">
          {mobilePane === 0 && 'Journals'}
          {mobilePane === 1 && (selectedJournalData?.name || 'Issues')}
          {mobilePane === 2 && `Vol.${selectedJournalData?.issues.find(i => i.issue_id === selectedIssue)?.issue_info.volume || '?'}`}
        </h1>
      </div>

      {/* Three column layout - Desktop */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Column 1: Journals */}
        <div className="w-64 border-r border-gray-800 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-800 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Journals
          </div>
          <div className="flex-1 overflow-y-auto">
            {journals.map((journal) => (
              <button
                key={journal.scraperKey}
                onClick={() => handleSelectJournal(journal.scraperKey)}
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
                  onClick={() => handleSelectIssue(issue.issue_id)}
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

        {/* Column 3: Issue Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {selectedJournal && selectedIssue ? (
            <IssueContent
              key={`${selectedJournal}-${selectedIssue}`}
              scraper={selectedJournal}
              issueId={selectedIssue}
              compact={true}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Select an issue
            </div>
          )}
        </div>
      </div>

      {/* Mobile sliding panes */}
      <div className="md:hidden flex-1 overflow-hidden relative">
        <div
          className="absolute inset-0 flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${mobilePane * 100}%)` }}
        >
          {/* Mobile Pane 1: Journals */}
          <div className="w-full flex-shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {journals.map((journal) => (
                <button
                  key={journal.scraperKey}
                  onClick={() => handleSelectJournal(journal.scraperKey)}
                  className="w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors text-gray-300 hover:bg-gray-800/50 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{journal.name}</div>
                    <div className="text-xs text-gray-500">
                      {journal.issues.length} issues
                      {fetchingJournal === journal.scraperKey && fetchProgress && (
                        <span className="ml-2">({fetchProgress})</span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-500">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Pane 2: Issues */}
          <div className="w-full flex-shrink-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              {selectedJournalData?.issues.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  No issues cached.
                </div>
              ) : (
                selectedJournalData?.issues.map((issue) => (
                  <button
                    key={issue.issue_id}
                    onClick={() => handleSelectIssue(issue.issue_id)}
                    className="w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors text-gray-300 hover:bg-gray-800/50 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-medium">
                        Vol.{issue.issue_info.volume} No.{issue.issue_info.issue}
                      </div>
                      <div className="text-xs text-gray-500">
                        {issue.issue_info.year} · {issue.article_count} articles
                        {issue.has_summary && ' · AI Summary'}
                      </div>
                    </div>
                    <span className="text-gray-500">→</span>
                  </button>
                ))
              )}
            </div>
            {/* Refetch button */}
            {selectedJournal && (
              <div className="p-3 border-t border-gray-800">
                <button
                  onClick={() => handleFetchJournalIssues(selectedJournal)}
                  disabled={fetchingJournal === selectedJournal}
                  className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-wait text-gray-300 rounded text-sm font-medium transition-colors"
                >
                  {fetchingJournal === selectedJournal ? 'Fetching...' : 'Refetch Issues'}
                </button>
              </div>
            )}
          </div>

          {/* Mobile Pane 3: Issue Content */}
          <div className="w-full flex-shrink-0 flex flex-col overflow-hidden">
            {selectedJournal && selectedIssue ? (
              <IssueContent
                key={`mobile-${selectedJournal}-${selectedIssue}`}
                scraper={selectedJournal}
                issueId={selectedIssue}
                compact={true}
                showNavigation={false}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Select an issue
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
