'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface JournalInfo {
  scraperKey: string;
  name: string;
  latestIssue?: {
    id: string;
    volume: string;
    issue: string;
    year: string;
  };
  paperCount: number;
}

export default function Home() {
  const [journals, setJournals] = useState<JournalInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJournals() {
      try {
        const res = await fetch('/api/journals');
        if (res.ok) {
          const data = await res.json();
          setJournals(data.journals || []);
        }
      } catch (err) {
        console.error('Failed to fetch journals:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchJournals();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <Link
          href="/papers"
          className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-purple-500/50 transition-colors"
        >
          <div className="text-2xl mb-2">📄</div>
          <h2 className="font-semibold mb-1 text-white">All Papers</h2>
          <p className="text-sm text-gray-400">Browse all collected papers</p>
        </Link>

        <Link
          href="/issues"
          className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-purple-500/50 transition-colors"
        >
          <div className="text-2xl mb-2">📚</div>
          <h2 className="font-semibold mb-1 text-white">Journal Issues</h2>
          <p className="text-sm text-gray-400">Browse by issue with AI summaries</p>
        </Link>
      </div>

      {/* Journal List */}
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h2 className="font-semibold text-white">Registered Journals</h2>
        </div>

        {loading ? (
          <div className="p-4 text-gray-500">Loading...</div>
        ) : journals.length === 0 ? (
          <div className="p-4 text-gray-500">No journals registered</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {journals.map((journal) => (
              <div key={journal.scraperKey} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-white">{journal.name}</div>
                  <div className="text-sm text-gray-400">
                    {journal.paperCount > 0 && `${journal.paperCount} papers collected`}
                  </div>
                </div>
                {journal.latestIssue ? (
                  <Link
                    href={`/issues/${journal.scraperKey}/${journal.latestIssue.id}`}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
                  >
                    Vol.{journal.latestIssue.volume} No.{journal.latestIssue.issue}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-600">No cached issues</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-600">
        Subscribers access their dashboard via email link
      </div>
    </div>
  );
}
