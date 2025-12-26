'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface UserHeaderProps {
  token: string;
  initialName?: string | null;
  email: string;
}

export default function UserHeader({ token, initialName, email }: UserHeaderProps) {
  const pathname = usePathname();
  const [name, setName] = useState(initialName || '');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const saveName = async () => {
    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/users/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null }),
      });

      if (res.ok) {
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to save name:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveName();
    } else if (e.key === 'Escape') {
      setName(initialName || '');
      setIsEditing(false);
    }
  };

  const navItems = [
    { href: `/u/${token}`, label: '대시보드', exact: true },
    { href: `/u/${token}/keywords`, label: '키워드' },
    { href: `/u/${token}/sources`, label: '학술지' },
    { href: `/u/${token}/settings`, label: '설정' },
  ];

  const isActive = (item: { href: string; exact?: boolean }) => {
    if (item.exact) {
      return pathname === item.href;
    }
    return pathname === item.href || pathname?.startsWith(item.href + '/');
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* User Name / Identity */}
          <div className="flex items-center gap-3">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={saveName}
                  placeholder="이름 입력"
                  className="px-2 py-1 border border-blue-300 rounded text-sm font-medium w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={saving}
                />
                {saving && (
                  <span className="text-xs text-gray-400">저장 중...</span>
                )}
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 group"
                title="클릭하여 이름 수정"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-sm">
                  {(name || email).charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="font-medium text-gray-900 group-hover:text-blue-600 flex items-center gap-1">
                    {name || '이름 설정'}
                    <svg className="w-3 h-3 text-gray-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </div>
                  <div className="text-xs text-gray-500">{email}</div>
                </div>
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  isActive(item)
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
