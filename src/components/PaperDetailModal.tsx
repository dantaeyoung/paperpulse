'use client';

import { useState, useEffect } from 'react';

interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: string;
  volume: string;
  issue: string;
  paperNumber?: number;
  url: string;
  pdfUrl: string;
  isScraped: boolean;
  hasFullText: boolean;
  fullTextLength: number;
  localPdfUrl: string | null;
  // Optional fields that may exist on some paper types
  scraperKey?: string;
  issueId?: string;
  journal?: string;
}

interface PaperExtraction {
  research_topic: string;
  research_subjects: {
    type: string;
    sample_size?: number;
  };
  methodology_type: 'qualitative' | 'quantitative' | 'mixed';
  data_collection: string[];
  statistical_methods?: string[];
  statistical_sophistication?: 'basic' | 'intermediate' | 'advanced';
  key_findings: string;
}

interface PaperDetail extends Paper {
  fullText: string | null;
  journal?: string;
  extraction?: PaperExtraction | null;
}

interface PaperDetailModalProps {
  paper: Paper | null;
  journal?: string;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onPaperUpdated?: (paper: any) => void;
}

export default function PaperDetailModal({
  paper,
  journal,
  onClose,
  onPaperUpdated,
}: PaperDetailModalProps) {
  const [paperDetail, setPaperDetail] = useState<PaperDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch paper details when paper changes
  useEffect(() => {
    if (!paper) {
      setPaperDetail(null);
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setPaperDetail({ ...paper, fullText: null, journal });

      try {
        const res = await fetch(`/api/test/paper/${paper.id}`);
        const data = await res.json();
        if (data.paper) {
          setPaperDetail({
            ...paper,
            fullText: data.paper.fullText,
            hasFullText: data.paper.hasFullText,
            fullTextLength: data.paper.fullTextLength,
            localPdfUrl: data.paper.localPdfUrl,
            isScraped: data.paper.isScraped,
            journal: data.paper.journal || journal,
            extraction: data.paper.extraction || null,
          });
        }
      } catch (err) {
        console.error('Fetch paper detail error:', err);
      }

      setLoading(false);
    };

    fetchDetail();
  }, [paper, journal]);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleScrape = async () => {
    if (!paperDetail) return;

    setScraping(true);

    try {
      const res = await fetch(`/api/test/paper/${paperDetail.id}/scrape`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        // Refresh paper detail
        const detailRes = await fetch(`/api/test/paper/${paperDetail.id}`);
        const detailData = await detailRes.json();
        if (detailData.paper) {
          const updatedPaper: PaperDetail = {
            ...paperDetail,
            fullText: detailData.paper.fullText,
            hasFullText: detailData.paper.hasFullText,
            fullTextLength: detailData.paper.fullTextLength,
            localPdfUrl: detailData.paper.localPdfUrl,
            isScraped: true,
          };
          setPaperDetail(updatedPaper);

          // Notify parent of update
          if (onPaperUpdated) {
            onPaperUpdated({
              ...paperDetail,
              isScraped: true,
              hasFullText: data.extractedTextLength > 0,
              fullTextLength: data.extractedTextLength || 0,
              localPdfUrl: data.localPdfUrl || null,
            });
          }
        }
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }

    setScraping(false);
  };

  const handleAnalyze = async () => {
    if (!paperDetail) return;

    setAnalyzing(true);

    try {
      const res = await fetch(`/api/test/paper/${paperDetail.id}/analyze`, { method: 'POST' });
      const data = await res.json();

      if (data.success && data.extraction) {
        setPaperDetail({
          ...paperDetail,
          extraction: data.extraction,
        });

        // Notify parent of update
        if (onPaperUpdated) {
          onPaperUpdated({
            ...paperDetail,
            hasExtraction: true,
          });
        }
      } else if (data.error) {
        console.error('Analysis error:', data.error);
        alert(`Analysis failed: ${data.error}`);
      }
    } catch (err) {
      console.error('Analyze error:', err);
      alert('Analysis failed. Check console for details.');
    }

    setAnalyzing(false);
  };

  if (!paper) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 pb-4">
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold mb-2">{paperDetail?.title || paper.title}</h2>
              <div className="flex flex-wrap gap-2 text-sm text-gray-400">
                {(paperDetail?.journal || journal) && (
                  <>
                    <span>{paperDetail?.journal || journal}</span>
                    <span>•</span>
                  </>
                )}
                <span>{paper.year}년</span>
                <span>•</span>
                <span>제{paper.volume}권 제{paper.issue}호</span>
                {paper.paperNumber && (
                  <>
                    <span>•</span>
                    <span>#{paper.paperNumber}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Authors */}
          <div className="mb-4">
            <span className="text-gray-500 text-sm">Authors: </span>
            <span className="text-gray-300">{paper.authors.join(', ') || 'N/A'}</span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3 mb-6">
            {paperDetail?.localPdfUrl ? (
              <a
                href={paperDetail.localPdfUrl}
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

            {!paperDetail?.isScraped ? (
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded disabled:opacity-50"
              >
                {scraping ? '⏳ Scraping...' : '📥 Scrape Full Text'}
              </button>
            ) : paperDetail.fullTextLength <= 100 ? (
              <button
                onClick={handleScrape}
                disabled={scraping}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded disabled:opacity-50"
              >
                {scraping ? '⏳ Scraping...' : '🔄 Rescrape (previous failed)'}
              </button>
            ) : null}
          </div>

          {/* Status */}
          <div className="flex items-center gap-4 mb-6">
            <div className={`px-3 py-1 rounded text-sm ${paperDetail?.isScraped ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
              {paperDetail?.isScraped ? '✓ Scraped' : '○ Not Scraped'}
            </div>
            {paperDetail?.hasFullText && (
              <div className="px-3 py-1 rounded text-sm bg-blue-900 text-blue-300">
                {(paperDetail.fullTextLength / 1000).toFixed(1)}k characters
              </div>
            )}
            {/* AI Analysis Button/Status */}
            {paperDetail?.hasFullText && (
              paperDetail?.extraction ? (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="px-3 py-1 rounded text-sm bg-purple-900 text-purple-300 hover:bg-purple-800 transition-colors disabled:opacity-50"
                >
                  {analyzing ? '⏳ 분석 중...' : '🔄 재분석'}
                </button>
              ) : (
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="px-3 py-1 rounded text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
                >
                  {analyzing ? '⏳ 분석 중...' : '🤖 AI 분석 실행'}
                </button>
              )
            )}
          </div>

          {/* AI Extraction */}
          {paperDetail?.extraction && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3">🤖 AI 분석 결과</h3>
              <div className="bg-gray-900 rounded p-4 space-y-3">
                <div>
                  <span className="text-gray-500 text-sm">연구 주제: </span>
                  <span className="text-gray-200">{paperDetail.extraction.research_topic}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">연구 대상: </span>
                  <span className="text-gray-200">
                    {paperDetail.extraction.research_subjects.type}
                    {paperDetail.extraction.research_subjects.sample_size && (
                      <span className="text-gray-400"> (n={paperDetail.extraction.research_subjects.sample_size})</span>
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">연구 방법: </span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    paperDetail.extraction.methodology_type === 'quantitative' ? 'bg-blue-900 text-blue-300' :
                    paperDetail.extraction.methodology_type === 'qualitative' ? 'bg-green-900 text-green-300' :
                    'bg-yellow-900 text-yellow-300'
                  }`}>
                    {paperDetail.extraction.methodology_type === 'quantitative' ? '양적연구' :
                     paperDetail.extraction.methodology_type === 'qualitative' ? '질적연구' : '혼합연구'}
                  </span>
                </div>
                {paperDetail.extraction.data_collection.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-sm">자료수집: </span>
                    <span className="text-gray-300">{paperDetail.extraction.data_collection.join(', ')}</span>
                  </div>
                )}
                {paperDetail.extraction.statistical_methods && paperDetail.extraction.statistical_methods.length > 0 && (
                  <div>
                    <span className="text-gray-500 text-sm">통계분석: </span>
                    <span className="text-gray-300">{paperDetail.extraction.statistical_methods.join(', ')}</span>
                    {paperDetail.extraction.statistical_sophistication && (
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        paperDetail.extraction.statistical_sophistication === 'advanced' ? 'bg-purple-900 text-purple-300' :
                        paperDetail.extraction.statistical_sophistication === 'intermediate' ? 'bg-blue-900 text-blue-300' :
                        'bg-gray-700 text-gray-300'
                      }`}>
                        {paperDetail.extraction.statistical_sophistication}
                      </span>
                    )}
                  </div>
                )}
                <div className="pt-2 border-t border-gray-700">
                  <span className="text-gray-500 text-sm">핵심 결과: </span>
                  <p className="text-gray-200 mt-1">{paperDetail.extraction.key_findings}</p>
                </div>
              </div>
            </div>
          )}

          {/* Full text */}
          {loading ? (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin h-6 w-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              Loading details...
            </div>
          ) : paperDetail?.hasFullText && paperDetail.fullText ? (
            <div>
              <h3 className="text-lg font-semibold mb-3">Full Text</h3>
              <div className="bg-gray-900 rounded p-4 max-h-[400px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-300 font-mono">
                  {paperDetail.fullText}
                </pre>
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 rounded p-6 text-center text-gray-500">
              {paperDetail?.isScraped ? (
                <p>Full text was not extracted from this paper.</p>
              ) : (
                <p>Click &quot;Scrape Full Text&quot; to extract the content from the PDF.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
