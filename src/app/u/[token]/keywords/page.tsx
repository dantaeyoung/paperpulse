'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import UserHeader from '@/components/UserHeader';

interface User {
  name: string | null;
  email: string;
}

interface Keyword {
  id: string;
  keyword: string;
  is_active: boolean;
}

export default function KeywordsPage() {
  const params = useParams();
  const token = params.token as string;

  const [user, setUser] = useState<User | null>(null);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [token]);

  async function fetchData() {
    try {
      const [userRes, keywordsRes] = await Promise.all([
        fetch(`/api/users/${token}`),
        fetch(`/api/users/${token}/keywords`),
      ]);

      if (userRes.ok) {
        const userData = await userRes.json();
        setUser(userData.user);
      }

      if (keywordsRes.ok) {
        const keywordsData = await keywordsRes.json();
        setKeywords(keywordsData.keywords || []);
      } else {
        throw new Error('Failed to fetch keywords');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim() || saving) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${token}/keywords`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: newKeyword.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add keyword');
      }

      const data = await res.json();
      setKeywords([data.keyword, ...keywords]);
      setNewKeyword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add keyword');
    } finally {
      setSaving(false);
    }
  }

  async function toggleKeyword(id: string, isActive: boolean) {
    try {
      await fetch(`/api/users/${token}/keywords/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });

      setKeywords(keywords.map(k =>
        k.id === id ? { ...k, is_active: !isActive } : k
      ));
    } catch (err) {
      setError('Failed to update keyword');
    }
  }

  async function deleteKeyword(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      await fetch(`/api/users/${token}/keywords/${id}`, {
        method: 'DELETE',
      });

      setKeywords(keywords.filter(k => k.id !== id));
    } catch (err) {
      setError('Failed to delete keyword');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {user && <UserHeader token={token} initialName={user.name} email={user.email} />}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">키워드 관리</h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Add Keyword Form */}
        <form onSubmit={addKeyword} className="mb-8">
          <div className="flex gap-2">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="새 키워드 입력 (예: 가족치료)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
            />
            <button
              type="submit"
              disabled={saving || !newKeyword.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? '추가 중...' : '추가'}
            </button>
          </div>
        </form>

        {/* Keywords List */}
        <div className="bg-white rounded-lg shadow-sm">
          {keywords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              아직 키워드가 없습니다. 위에서 키워드를 추가해주세요.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {keywords.map((keyword) => (
                <li key={keyword.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleKeyword(keyword.id, keyword.is_active)}
                      className={`w-10 h-6 rounded-full relative transition-colors ${
                        keyword.is_active ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                          keyword.is_active ? 'left-5' : 'left-1'
                        }`}
                      />
                    </button>
                    <span className={keyword.is_active ? 'text-gray-900' : 'text-gray-400'}>
                      {keyword.keyword}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteKeyword(keyword.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-4 text-sm text-gray-500">
          활성화된 키워드와 일치하는 논문만 요약됩니다.
        </p>
      </div>
    </div>
  );
}
