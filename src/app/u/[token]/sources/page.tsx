'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import UserHeader from '@/components/UserHeader';

interface User {
  name: string | null;
  email: string;
}

interface Journal {
  id: string;
  name: string;
  description: string | null;
  is_selected: boolean;
  is_custom: boolean;
}

export default function SourcesPage() {
  const params = useParams();
  const token = params.token as string;

  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newJournal, setNewJournal] = useState({ name: '', description: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetchJournals();
  }, [token]);

  async function fetchJournals() {
    try {
      const res = await fetch(`/api/users/${token}/journals`);
      if (!res.ok) throw new Error('Failed to fetch journals');
      const data = await res.json();
      setJournals(data.journals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load journals');
    } finally {
      setLoading(false);
    }
  }

  async function toggleJournal(journalId: string, currentlySelected: boolean) {
    setSaving(journalId);
    setError(null);

    try {
      const res = await fetch(`/api/users/${token}/journals/${journalId}`, {
        method: currentlySelected ? 'DELETE' : 'POST',
      });

      if (!res.ok) {
        throw new Error('Failed to update selection');
      }

      setJournals(journals.map(j =>
        j.id === journalId ? { ...j, is_selected: !currentlySelected } : j
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(null);
    }
  }

  async function addJournal(e: React.FormEvent) {
    e.preventDefault();
    if (!newJournal.name.trim() || adding) return;

    setAdding(true);
    setError(null);

    try {
      const res = await fetch(`/api/users/${token}/journals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newJournal),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add journal');
      }

      const data = await res.json();
      setJournals([...journals, data.journal]);
      setNewJournal({ name: '', description: '' });
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add journal');
    } finally {
      setAdding(false);
    }
  }

  async function deleteJournal(journalId: string) {
    if (!confirm('이 학술지를 삭제하시겠습니까?')) return;

    setSaving(journalId);
    setError(null);

    try {
      const res = await fetch(`/api/users/${token}/journals/${journalId}`, {
        method: 'DELETE',
        headers: { 'X-Delete-Journal': 'true' },
      });

      if (!res.ok) {
        throw new Error('Failed to delete journal');
      }

      setJournals(journals.filter(j => j.id !== journalId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const selectedCount = journals.filter(j => j.is_selected).length;
  const globalJournals = journals.filter(j => !j.is_custom);
  const customJournals = journals.filter(j => j.is_custom);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/u/${token}`} className="text-blue-600 hover:text-blue-800 text-sm">
            ← 대시보드로 돌아가기
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">학술지 선택</h1>
        <p className="text-gray-600 mb-6">
          논문을 수집할 학술지를 선택하세요. 선택한 학술지에서 키워드와 일치하는 새 논문이 발견되면 요약을 보내드립니다.
        </p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Global Journals */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="font-medium text-gray-900">기본 학술지</span>
            <span className="text-sm text-gray-500">
              {selectedCount}개 선택됨
            </span>
          </div>

          <ul className="divide-y divide-gray-100">
            {globalJournals.map((journal) => (
              <li key={journal.id} className="p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={journal.is_selected}
                      onChange={() => toggleJournal(journal.id, journal.is_selected)}
                      disabled={saving === journal.id}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {journal.name}
                      {saving === journal.id && (
                        <span className="ml-2 text-sm text-gray-400">저장 중...</span>
                      )}
                    </div>
                    {journal.description && (
                      <div className="text-sm text-gray-500 mt-0.5">
                        {journal.description}
                      </div>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>

          {globalJournals.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              기본 학술지가 없습니다.
            </div>
          )}
        </div>

        {/* Custom Journals */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <span className="font-medium text-gray-900">내가 추가한 학술지</span>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {showAddForm ? '취소' : '+ 학술지 추가'}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={addJournal} className="p-4 border-b border-gray-100 bg-gray-50">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    학술지 이름 *
                  </label>
                  <input
                    type="text"
                    value={newJournal.name}
                    onChange={(e) => setNewJournal({ ...newJournal, name: e.target.value })}
                    placeholder="예: 한국심리학회지"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    설명 (선택)
                  </label>
                  <input
                    type="text"
                    value={newJournal.description}
                    onChange={(e) => setNewJournal({ ...newJournal, description: e.target.value })}
                    placeholder="예: 심리학 관련 학술지"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={adding || !newJournal.name.trim()}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {adding ? '추가 중...' : '학술지 추가'}
                </button>
              </div>
            </form>
          )}

          <ul className="divide-y divide-gray-100">
            {customJournals.map((journal) => (
              <li key={journal.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={journal.is_selected}
                      onChange={() => toggleJournal(journal.id, journal.is_selected)}
                      disabled={saving === journal.id}
                      className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {journal.name}
                      {saving === journal.id && (
                        <span className="ml-2 text-sm text-gray-400">저장 중...</span>
                      )}
                    </div>
                    {journal.description && (
                      <div className="text-sm text-gray-500 mt-0.5">
                        {journal.description}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => deleteJournal(journal.id)}
                    disabled={saving === journal.id}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {customJournals.length === 0 && !showAddForm && (
            <div className="p-8 text-center text-gray-500">
              추가한 학술지가 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
