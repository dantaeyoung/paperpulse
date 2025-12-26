import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4">
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
    </div>
  );
}
