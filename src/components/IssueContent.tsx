'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import PaperDetailModal from '@/components/PaperDetailModal';

interface Article {
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
  storagePdfUrl: string | null;
  dbPaperId?: string | null;
}

interface IssueInfo {
  volume?: string;
  issue?: string;
  year?: string;
}

interface IssueSummary {
  id: string;
  content: string;
  paperCount: number;
  extractions: { paper_id: string; [key: string]: unknown }[];
  statistics?: IssueStatistics | null;
  citationMap?: { [key: string]: { paper_id: string; title: string } } | null;
  costEstimate: number;
  createdAt: string;
}

interface IssueStatistics {
  totalPapers: number;
  methodology: { quantitative: number; qualitative: number; mixed: number };
  sophistication: { basic: number; intermediate: number; advanced: number; unknown: number };
  sampleSize: { count: number; mean: number; min: number; max: number; total: number };
  researchSubjects: { type: string; count: number; percentage: number }[];
}

interface IssueContentProps {
  scraper: string;
  issueId: string;
  compact?: boolean; // For column view vs full page
}

export default function IssueContent({ scraper, issueId, compact = false }: IssueContentProps) {
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState('');
  const [issueInfo, setIssueInfo] = useState<IssueInfo>({});
  const [articles, setArticles] = useState<Article[]>([]);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [summaryExists, setSummaryExists] = useState(false);

  // Scraping state
  const [scrapingPapers, setScrapingPapers] = useState<Set<string>>(new Set());
  const [scrapeAllProgress, setScrapeAllProgress] = useState<{ current: number; total: number } | null>(null);

  // Paper detail modal
  const [selectedPaper, setSelectedPaper] = useState<Article | null>(null);

  useEffect(() => {
    fetchIssueData();
    fetchSummary();
  }, [scraper, issueId]);

  const fetchIssueData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/test/issue-articles?scraper=${scraper}&issue=${issueId}`);
      const data = await res.json();
      if (!data.error) {
        setJournal(data.journal || '');
        setIssueInfo(data.issueInfo || {});
        setArticles(data.articles || []);
      }
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch(`/api/issues/${scraper}/${issueId}/summary`);
      const data = await res.json();
      if (data.exists && data.summary) {
        setSummary(data.summary);
        setSummaryExists(true);
      }
    } catch (err) {
      console.error('Fetch summary error:', err);
    }
  };

  const scrapePaper = async (articleId: string) => {
    setScrapingPapers(prev => new Set(prev).add(articleId));
    try {
      const res = await fetch(`/api/papers/${articleId}/scrape`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setArticles(prev => prev.map(a =>
          a.id === articleId
            ? { ...a, isScraped: true, hasFullText: data.extractedTextLength > 0, fullTextLength: data.extractedTextLength || 0, storagePdfUrl: data.pdfUrl || null }
            : a
        ));
      }
    } catch (err) {
      console.error('Scrape error:', err);
    }
    setScrapingPapers(prev => {
      const next = new Set(prev);
      next.delete(articleId);
      return next;
    });
  };

  const scrapeAllUnscraped = async () => {
    const unscraped = articles.filter(a => !a.hasFullText);
    if (unscraped.length === 0) return;
    setScrapeAllProgress({ current: 0, total: unscraped.length });
    for (let i = 0; i < unscraped.length; i++) {
      setScrapeAllProgress({ current: i + 1, total: unscraped.length });
      await scrapePaper(unscraped[i].id);
      if (i < unscraped.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setScrapeAllProgress(null);
  };

  const papersWithFullText = articles.filter(a => a.hasFullText).length;
  const extractedPaperIds = new Set((summary?.extractions || []).map(e => e.paper_id));

  const renderWithCitations = (text: string): React.ReactNode => {
    if (!summary?.citationMap) return text;
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, index) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const citationNum = match[1];
        const citation = summary.citationMap?.[citationNum];
        if (citation) {
          const article = articles.find(a => a.dbPaperId === citation.paper_id);
          return (
            <sup
              key={index}
              className="text-purple-400 cursor-pointer hover:text-purple-300 mx-0.5"
              onClick={() => article && setSelectedPaper(article)}
              title={citation.title}
            >
              [{citationNum}]
            </sup>
          );
        }
      }
      return part;
    });
  };

  if (loading) {
    return <div className="p-4 text-gray-500">Loading...</div>;
  }

  return (
    <div className={compact ? 'h-full flex flex-col' : ''}>
      {/* Header */}
      <div className={compact ? 'p-3 border-b border-gray-800' : 'mb-6'}>
        <h2 className={`font-bold ${compact ? 'text-lg' : 'text-2xl'}`}>{journal}</h2>
        <p className="text-gray-400 text-sm">
          제{issueInfo.volume}권 제{issueInfo.issue}호 ({issueInfo.year})
        </p>
        {!compact && (
          <a href={`/issues/${scraper}/${issueId}`} className="text-blue-400 text-sm hover:text-blue-300">
            Open full page →
          </a>
        )}
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 gap-2 ${compact ? 'p-3 border-b border-gray-800' : 'mb-6'}`}>
        <div className="bg-gray-800 rounded p-3">
          <div className={`font-bold text-blue-400 ${compact ? 'text-xl' : 'text-2xl'}`}>{articles.length}</div>
          <div className="text-gray-400 text-xs">Papers</div>
        </div>
        <div className="bg-gray-800 rounded p-3">
          <div className={`font-bold text-green-400 ${compact ? 'text-xl' : 'text-2xl'}`}>{papersWithFullText}</div>
          <div className="text-gray-400 text-xs">With Text</div>
          {papersWithFullText < articles.length && (
            <button
              onClick={scrapeAllUnscraped}
              disabled={!!scrapeAllProgress}
              className="mt-1 text-xs px-2 py-0.5 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
            >
              {scrapeAllProgress ? `${scrapeAllProgress.current}/${scrapeAllProgress.total}` : 'Scrape All'}
            </button>
          )}
        </div>
      </div>

      {/* Summary */}
      {summaryExists && summary && (
        <div className={`${compact ? 'p-3 border-b border-gray-800' : 'bg-gray-800 rounded-lg p-4 mb-6'}`}>
          <h3 className="font-bold text-sm mb-2 text-purple-400">AI Summary</h3>
          {/* Statistics */}
          {summary.statistics && (
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
              <div className="bg-gray-900 rounded p-2">
                <div className="text-gray-500 uppercase text-[10px]">Method</div>
                <div>양적 {summary.statistics.methodology.quantitative} / 질적 {summary.statistics.methodology.qualitative}</div>
              </div>
              {summary.statistics.sampleSize.count > 0 && (
                <div className="bg-gray-900 rounded p-2">
                  <div className="text-gray-500 uppercase text-[10px]">Avg Sample</div>
                  <div>{summary.statistics.sampleSize.mean}</div>
                </div>
              )}
            </div>
          )}
          <div className={`prose prose-invert prose-sm max-w-none ${compact ? 'text-xs max-h-48 overflow-y-auto' : ''}`}>
            <ReactMarkdown
              components={{
                p: ({ children }) => {
                  const process = (c: React.ReactNode): React.ReactNode => typeof c === 'string' ? renderWithCitations(c) : c;
                  return <p className="mb-2 text-gray-300 leading-relaxed">{Array.isArray(children) ? children.map(process) : process(children)}</p>;
                },
                h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                li: ({ children }) => {
                  const process = (c: React.ReactNode): React.ReactNode => typeof c === 'string' ? renderWithCitations(c) : c;
                  return <li className="text-gray-300">{Array.isArray(children) ? children.map(process) : process(children)}</li>;
                },
              }}
            >
              {summary.content}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Papers List */}
      <div className={compact ? 'flex-1 overflow-y-auto' : 'bg-gray-800 rounded-lg p-4'}>
        <h3 className={`font-bold mb-2 ${compact ? 'px-3 pt-2 text-sm' : 'text-lg'}`}>
          Papers {!compact && `(${articles.length})`}
        </h3>
        <div className={compact ? '' : 'space-y-2'}>
          {articles.map((article, idx) => (
            <div
              key={article.id}
              onClick={() => setSelectedPaper(article)}
              className={`cursor-pointer hover:bg-gray-800/50 ${compact ? 'px-3 py-2 border-b border-gray-800/50' : 'p-3 bg-gray-900 rounded'}`}
            >
              <div className="flex items-start gap-2">
                <span className="text-gray-500 text-xs w-5 text-right flex-shrink-0">
                  {article.paperNumber || idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-blue-400 font-medium leading-snug ${compact ? 'text-xs' : 'text-sm'}`}>
                    {article.title}
                  </div>
                  <div className="text-gray-500 text-xs mt-0.5 truncate">
                    {article.authors.slice(0, 2).join(', ')}{article.authors.length > 2 && ' 외'}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {article.dbPaperId && extractedPaperIds.has(article.dbPaperId) && (
                    <span className="text-purple-400 text-xs" title="AI analyzed">🤖</span>
                  )}
                  {article.hasFullText ? (
                    <span className="text-green-400 text-[10px]">✓</span>
                  ) : scrapingPapers.has(article.id) ? (
                    <span className="text-blue-400 text-[10px] animate-pulse">...</span>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); scrapePaper(article.id); }}
                      className="text-gray-500 hover:text-blue-400 text-[10px]"
                    >
                      ○
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full page link for compact mode */}
      {compact && (
        <div className="p-3 border-t border-gray-800">
          <a
            href={`/issues/${scraper}/${issueId}`}
            className="block w-full text-center py-2 bg-purple-600 hover:bg-purple-700 rounded text-sm font-medium"
          >
            Open Full View
          </a>
        </div>
      )}

      <PaperDetailModal
        paper={selectedPaper}
        journal={journal}
        onClose={() => setSelectedPaper(null)}
        onPaperUpdated={(p) => setArticles(prev => prev.map(a => a.id === p.id ? p : a))}
      />
    </div>
  );
}
