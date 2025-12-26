'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import UserHeader from '@/components/UserHeader';

interface User {
  id: string;
  name: string | null;
  email: string;
  field_context: string | null;
  digest_day: number;
  digest_hour: number;
}

interface Keyword {
  id: string;
  keyword: string;
  is_active: boolean;
}

interface Journal {
  id: string;
  name: string;
  description: string | null;
  is_selected: boolean;
}

interface Summary {
  id: string;
  content: string;
  created_at: string;
  paper: {
    title: string;
    url: string;
    journal_name: string | null;
    published_at: string | null;
  };
}

interface SearchResult {
  keyword: string;
  journal: string;
  found: number;
  matched: number;
  saved: number;
  papers: { title: string; journal: string; url: string }[];
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function DashboardPage() {
  const params = useParams();
  const token = params.token as string;

  const [user, setUser] = useState<User | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [userRes, keywordsRes, journalsRes, summariesRes] = await Promise.all([
          fetch(`/api/users/${token}`),
          fetch(`/api/users/${token}/keywords`),
          fetch(`/api/users/${token}/journals`),
          fetch(`/api/users/${token}/summaries?limit=5`),
        ]);

        if (!userRes.ok) {
          throw new Error('User not found');
        }

        const userData = await userRes.json();
        const keywordsData = await keywordsRes.json();
        const journalsData = await journalsRes.json();
        const summariesData = await summariesRes.json();

        setUser(userData.user);
        setKeywords(keywordsData.keywords || []);
        setJournals(journalsData.journals || []);
        setSummaries(summariesData.summaries || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [token]);

  async function handleSearch() {
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);

    try {
      const res = await fetch(`/api/test/search?token=${token}`);
      const data = await res.json();

      if (data.error) {
        setSearchError(data.error);
      } else {
        setSearchResults(data.results || []);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{error || 'User not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UserHeader token={token} initialName={user.name} email={user.email} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Welcome Message */}
        <div className="mb-8">
          <p className="text-gray-600">
            매주 {DAYS[user.digest_day]}요일 {user.digest_hour}시에 논문 요약을 받아보세요
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-blue-600">{keywords.filter(k => k.is_active).length}</div>
            <div className="text-sm text-gray-500">활성 키워드</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-green-600">{journals.filter(j => j.is_selected).length}</div>
            <div className="text-sm text-gray-500">선택한 학술지</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm">
            <div className="text-2xl font-bold text-purple-600">{summaries.length}</div>
            <div className="text-sm text-gray-500">최근 요약</div>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link
            href={`/u/${token}/keywords`}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="font-semibold text-gray-900 mb-2">키워드 관리</h2>
            <p className="text-sm text-gray-600">검색할 키워드를 추가하거나 수정하세요</p>
          </Link>

          <Link
            href={`/u/${token}/sources`}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="font-semibold text-gray-900 mb-2">학술지 선택</h2>
            <p className="text-sm text-gray-600">논문을 수집할 학술지를 선택하세요</p>
          </Link>

          <Link
            href={`/u/${token}/settings`}
            className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <h2 className="font-semibold text-gray-900 mb-2">설정</h2>
            <p className="text-sm text-gray-600">이메일 발송 시간을 변경하세요</p>
          </Link>
        </div>

        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-sm mb-8">
          <div className="p-4 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-gray-900">KCI 키워드 검색</h2>
                <p className="text-sm text-gray-500 mt-1">
                  활성 키워드로 KCI에서 논문을 검색합니다
                </p>
              </div>
              <button
                onClick={handleSearch}
                disabled={searching || keywords.filter(k => k.is_active).length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {searching ? '검색 중...' : '검색 실행'}
              </button>
            </div>
          </div>

          {searchError && (
            <div className="p-4 bg-red-50 text-red-600">
              {searchError}
            </div>
          )}

          {searchResults && (
            <div className="divide-y divide-gray-100">
              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  선택한 학술지에서 키워드와 일치하는 논문이 없습니다
                </div>
              ) : (
                searchResults.map((result, i) => (
                  <div key={i} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-gray-900">
                          &quot;{result.keyword}&quot;
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          in {result.journal}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">
                        {result.found}건 중 {result.matched}건 일치, {result.saved}건 저장
                      </span>
                    </div>
                    {result.papers.length > 0 ? (
                      <ul className="space-y-2">
                        {result.papers.slice(0, 5).map((paper, j) => (
                          <li key={j} className="text-sm">
                            <a
                              href={paper.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              {paper.title.length > 80 ? paper.title.substring(0, 80) + '...' : paper.title}
                            </a>
                          </li>
                        ))}
                        {result.papers.length > 5 && (
                          <li className="text-sm text-gray-500">
                            ... 외 {result.papers.length - 5}건
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">일치하는 논문 없음</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Recent Summaries */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <h2 className="font-semibold text-gray-900">최근 논문 요약</h2>
            <Link
              href={`/u/${token}/summaries`}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              전체 보기 →
            </Link>
          </div>

          {summaries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              아직 요약된 논문이 없습니다. 다음 주간 다이제스트를 기다려주세요!
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {summaries.map((summary) => (
                <div key={summary.id} className="p-4">
                  <a
                    href={summary.paper.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    {summary.paper.title}
                  </a>
                  <p className="text-xs text-gray-500 mt-1">
                    {summary.paper.journal_name} · {summary.paper.published_at}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 line-clamp-2">
                    {summary.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
