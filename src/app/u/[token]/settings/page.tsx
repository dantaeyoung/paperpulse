'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  name: string | null;
  email: string;
  field_context: string | null;
  digest_day: number;
  digest_hour: number;
}

const DAYS = [
  { value: 0, label: '일요일' },
  { value: 1, label: '월요일' },
  { value: 2, label: '화요일' },
  { value: 3, label: '수요일' },
  { value: 4, label: '목요일' },
  { value: 5, label: '금요일' },
  { value: 6, label: '토요일' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00`,
}));

export default function SettingsPage() {
  const params = useParams();
  const token = params.token as string;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    field_context: '',
    digest_day: 1,
    digest_hour: 9,
  });

  useEffect(() => {
    fetchUser();
  }, [token]);

  async function fetchUser() {
    try {
      const res = await fetch(`/api/users/${token}`);
      if (!res.ok) throw new Error('Failed to fetch user');
      const data = await res.json();
      setUser(data.user);
      setForm({
        name: data.user.name || '',
        field_context: data.user.field_context || '',
        digest_day: data.user.digest_day,
        digest_hour: data.user.digest_hour,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/users/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || null,
          field_context: form.field_context || null,
          digest_day: form.digest_day,
          digest_hour: form.digest_hour,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">User not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href={`/u/${token}`} className="text-blue-600 hover:text-blue-800 text-sm">
            ← 대시보드로 돌아가기
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-6">설정</h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg mb-4">
            설정이 저장되었습니다.
          </div>
        )}

        <form onSubmit={saveSettings} className="bg-white rounded-lg shadow-sm p-6">
          <div className="space-y-6">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이름
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="홍길동"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Email (readonly) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                이메일
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                이메일 변경이 필요하시면 관리자에게 문의하세요.
              </p>
            </div>

            {/* Field Context */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                전문 분야 (선택)
              </label>
              <input
                type="text"
                value={form.field_context}
                onChange={(e) => setForm({ ...form, field_context: e.target.value })}
                placeholder="예: 가족치료 및 상담"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                AI가 논문을 요약할 때 참고합니다.
              </p>
            </div>

            {/* Digest Schedule */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                이메일 발송 시간
              </label>
              <div className="flex gap-4">
                <select
                  value={form.digest_day}
                  onChange={(e) => setForm({ ...form, digest_day: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
                <select
                  value={form.digest_hour}
                  onChange={(e) => setForm({ ...form, digest_hour: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {HOURS.map((hour) => (
                    <option key={hour.value} value={hour.value}>
                      {hour.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                한국 시간 (KST) 기준
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중...' : '설정 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
