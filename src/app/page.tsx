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
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <h1 className="text-2xl font-bold mb-8">논문 다이제스트</h1>

        {/* Navigation Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
            <div className="text-2xl mb-2">📚</div>
            <h2 className="font-semibold mb-1">학술지</h2>
            <p className="text-sm text-gray-400">호별 논문 탐색</p>
          </div>

          <Link
            href="/test/papers"
            className="bg-gray-900 rounded-lg p-6 border border-gray-800 hover:border-gray-600 transition-colors"
          >
            <div className="text-2xl mb-2">📄</div>
            <h2 className="font-semibold mb-1">전체 논문</h2>
            <p className="text-sm text-gray-400">수집된 모든 논문</p>
          </Link>
        </div>

        {/* Journal List */}
        <div className="bg-gray-900 rounded-lg border border-gray-800">
          <div className="p-4 border-b border-gray-800">
            <h2 className="font-semibold">등록된 학술지</h2>
          </div>

          {loading ? (
            <div className="p-4 text-gray-500">로딩 중...</div>
          ) : journals.length === 0 ? (
            <div className="p-4 text-gray-500">등록된 학술지가 없습니다</div>
          ) : (
            <div className="divide-y divide-gray-800">
              {journals.map((journal) => (
                <div key={journal.scraperKey} className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-medium">{journal.name}</div>
                    <div className="text-sm text-gray-500">
                      {journal.paperCount > 0 && `${journal.paperCount}편 수집`}
                    </div>
                  </div>
                  {journal.latestIssue ? (
                    <Link
                      href={`/issues/${journal.scraperKey}/${journal.latestIssue.id}`}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
                    >
                      {journal.latestIssue.volume}권 {journal.latestIssue.issue}호
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-600">캐시된 호 없음</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-600">
          구독자는 이메일의 링크로 대시보드에 접속하세요
        </div>
      </div>
    </div>
  );
}
