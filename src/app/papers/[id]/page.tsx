'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface PaperDetail {
  id: string;
  scraperKey: string;
  journal: string;
  year: string;
  volume: string;
  issue: string;
  title: string;
  authors: string[];
  url: string;
  pdfUrl: string;
  isScraped: boolean;
  hasFullText: boolean;
  fullTextLength: number;
  fullText: string | null;
  localPdfUrl: string | null;
}

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const paperId = params.id as string;

  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (paperId) {
      fetchPaper();
    }
  }, [paperId]);

  const fetchPaper = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/papers/${paperId}`);
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setPaper(data.paper);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError('Failed to load paper');
    }

    setLoading(false);
  };

  const scrapePaper = async () => {
    if (!paper) return;

    setScraping(true);

    try {
      // Get the issue ID (catcode) for this paper
      const res = await fetch(`/api/papers/${paperId}/scrape`, { method: 'POST' });
      const data = await res.json();

      if (!data.error) {
        // Refresh paper data
        await fetchPaper();
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }

    setScraping(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6 flex items-center justify-center">
        <div className="text-gray-400">Loading paper...</div>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.back()}
            className="mb-6 text-gray-400 hover:text-white"
          >
            ← Back
          </button>
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-red-400">{error || 'Paper not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="mb-6 text-gray-400 hover:text-white flex items-center gap-2"
        >
          ← Back to papers
        </button>

        {/* Paper header */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold mb-3">{paper.title}</h1>

          <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4">
            <span>{paper.journal}</span>
            <span>•</span>
            <span>{paper.year}년</span>
            <span>•</span>
            <span>제{paper.volume}권 제{paper.issue}호</span>
          </div>

          <div className="mb-4">
            <span className="text-gray-500 text-sm">Authors: </span>
            <span className="text-gray-300">{paper.authors.join(', ') || 'N/A'}</span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {paper.localPdfUrl ? (
              <a
                href={paper.localPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-medium"
              >
                📄 View PDF
              </a>
            ) : paper.pdfUrl ? (
              <a
                href={paper.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded font-medium"
              >
                📄 Download PDF (External)
              </a>
            ) : null}

            <a
              href={paper.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded"
            >
              🔗 Original Page
            </a>

            {!paper.isScraped && (
              <button
                onClick={scrapePaper}
                disabled={scraping}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
              >
                {scraping ? '⏳ Scraping...' : '📥 Scrape Full Text'}
              </button>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className={`px-3 py-1 rounded text-sm ${paper.isScraped ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
              {paper.isScraped ? '✓ Scraped' : '○ Not Scraped'}
            </div>
            {paper.hasFullText && (
              <div className="px-3 py-1 rounded text-sm bg-blue-900 text-blue-300">
                {(paper.fullTextLength / 1000).toFixed(1)}k characters
              </div>
            )}
          </div>
        </div>

        {/* Full text */}
        {paper.hasFullText && paper.fullText ? (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Full Text</h2>
            <div className="bg-gray-900 rounded p-4 max-h-[600px] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono">
                {paper.fullText}
              </pre>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-6 text-center text-gray-500">
            {paper.isScraped ? (
              <p>Full text was not extracted from this paper.</p>
            ) : (
              <p>Click "Scrape Full Text" to extract the content from the PDF.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
