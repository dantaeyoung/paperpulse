'use client';

import { useState, useEffect, use } from 'react';
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

interface PaperExtraction {
  paper_id: string;
  [key: string]: unknown;
}

interface CitationMap {
  [citationNumber: string]: {
    paper_id: string;
    title: string;
  };
}

interface IssueStatistics {
  totalPapers: number;
  methodology: {
    quantitative: number;
    qualitative: number;
    mixed: number;
  };
  dataCollection: { method: string; count: number; percentage: number }[];
  statisticalMethods: { method: string; count: number; percentage: number }[];
  sophistication: {
    basic: number;
    intermediate: number;
    advanced: number;
    unknown: number;
  };
  sampleSize: {
    count: number;
    mean: number;
    min: number;
    max: number;
    total: number;
  };
  researchSubjects: { type: string; count: number; percentage: number }[];
}

interface IssueSummary {
  id: string;
  content: string;
  paperCount: number;
  extractions: PaperExtraction[];
  statistics?: IssueStatistics | null;
  citationMap?: CitationMap | null;
  fieldContext?: string;
  customPrompt?: string;
  modelExtraction: string;
  modelSynthesis: string;
  tokensExtraction: number;
  tokensSynthesis: number;
  costEstimate: number;
  createdAt: string;
}

interface IssueInfo {
  volume?: string;
  issue?: string;
  year?: string;
}

interface AdjacentIssue {
  id: string;
  info: IssueInfo;
}

interface PageProps {
  params: Promise<{
    scraper: string;
    issueId: string;
  }>;
}

export default function IssuePage({ params }: PageProps) {
  const { scraper, issueId } = use(params);

  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState('');
  const [issueInfo, setIssueInfo] = useState<IssueInfo>({});
  const [articles, setArticles] = useState<Article[]>([]);
  const [summary, setSummary] = useState<IssueSummary | null>(null);
  const [summaryExists, setSummaryExists] = useState(false);
  const [prevIssue, setPrevIssue] = useState<AdjacentIssue | null>(null);
  const [nextIssue, setNextIssue] = useState<AdjacentIssue | null>(null);

  // Generation modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [fieldContext, setFieldContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');

  // Progress tracking
  const [progress, setProgress] = useState<{ current: number; total: number; paperTitle: string } | null>(null);

  // Scraping state
  const [scrapingPapers, setScrapingPapers] = useState<Set<string>>(new Set());
  const [scrapeAllProgress, setScrapeAllProgress] = useState<{ current: number; total: number } | null>(null);

  // Paper detail modal
  const [selectedPaper, setSelectedPaper] = useState<Article | null>(null);

  // Load issue data
  useEffect(() => {
    fetchIssueData();
    fetchSummary();
  }, [scraper, issueId]);

  // Close modal on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!generating) setShowGenerateModal(false);
        setSelectedPaper(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [generating]);

  const fetchIssueData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/test/issue-articles?scraper=${scraper}&issue=${issueId}`);
      const data = await res.json();

      if (data.error) {
        console.error('Error fetching issue:', data.error);
        return;
      }

      setJournal(data.journal || '');
      setIssueInfo(data.issueInfo || {});
      setArticles(data.articles || []);
      setPrevIssue(data.prevIssue || null);
      setNextIssue(data.nextIssue || null);
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
      } else {
        setSummary(null);
        setSummaryExists(false);
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
        // Update the article in state
        setArticles(prev => prev.map(a =>
          a.id === articleId
            ? {
                ...a,
                isScraped: true,
                hasFullText: data.extractedTextLength > 0,
                fullTextLength: data.extractedTextLength || 0,
                storagePdfUrl: data.pdfUrl || null,
              }
            : a
        ));
      } else {
        console.error('Scrape failed:', data.error);
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
      const article = unscraped[i];
      setScrapeAllProgress({ current: i + 1, total: unscraped.length });
      await scrapePaper(article.id);
      // Small delay between requests
      if (i < unscraped.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setScrapeAllProgress(null);
  };

  // Handle paper update from modal
  const handlePaperUpdated = (updatedPaper: Article) => {
    setArticles(prev => prev.map(a =>
      a.id === updatedPaper.id ? updatedPaper : a
    ));
  };

  const openGenerateModal = async () => {
    setGenerateError('');
    setProgress(null);

    // Fetch default prompt
    try {
      const res = await fetch(
        `/api/issues/${scraper}/${issueId}/summary?fieldContext=${encodeURIComponent(fieldContext)}`,
        { method: 'OPTIONS' }
      );
      const data = await res.json();
      if (data.defaultPrompt) {
        setCustomPrompt(data.defaultPrompt);
      }
    } catch (err) {
      console.error('Fetch default prompt error:', err);
    }

    setShowGenerateModal(true);
  };

  const generateSummary = async () => {
    setGenerating(true);
    setGenerateError('');
    setProgress(null);

    try {
      const res = await fetch(`/api/issues/${scraper}/${issueId}/summary/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customPrompt: customPrompt || undefined,
          fieldContext: fieldContext || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to start generation');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7);
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine?.startsWith('data: ')) {
              const data = JSON.parse(dataLine.slice(6));

              if (eventType === 'start') {
                setProgress({ current: 0, total: data.total, paperTitle: 'Starting...' });
              } else if (eventType === 'progress') {
                setProgress({ current: data.current, total: data.total, paperTitle: data.paperTitle });
              } else if (eventType === 'complete') {
                setSummary({
                  id: '',
                  content: data.summary.content,
                  paperCount: data.summary.paperCount,
                  extractions: [],
                  statistics: data.summary.statistics || null,
                  citationMap: data.summary.citationMap || null,
                  modelExtraction: '',
                  modelSynthesis: '',
                  tokensExtraction: 0,
                  tokensSynthesis: 0,
                  costEstimate: data.summary.costEstimate || 0,
                  createdAt: new Date().toISOString(),
                });
                setSummaryExists(true);
                setShowGenerateModal(false);
              } else if (eventType === 'error') {
                setGenerateError(data.message);
              }
            }
          }
        }
      }
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Unknown error');
    }

    setGenerating(false);
    setProgress(null);
  };

  const papersWithFullText = articles.filter(a => a.hasFullText).length;
  const issueInfoStr = `제${issueInfo.volume || '?'}권 제${issueInfo.issue || '?'}호 (${issueInfo.year || '?'})`;

  // Create a set of paper IDs that have AI extractions
  const extractedPaperIds = new Set(
    (summary?.extractions || []).map(e => e.paper_id)
  );

  const formatIssueLabel = (info: IssueInfo) => {
    if (info.volume && info.issue) {
      return `${info.volume}권 ${info.issue}호`;
    }
    return '';
  };

  // Preprocess content to fix citation formatting issues
  const preprocessContent = (content: string): string => {
    // Fix citations with newlines between them: [1]\n[2] -> [1][2]
    let fixed = content.replace(/\][\s\n]+\[/g, '][');

    // Fix citations inside bold markers: **text[1][2]** -> **text**[1][2]
    fixed = fixed.replace(/\*\*([^*]*?)(\[\d+\](?:\[\d+\])*)\*\*/g, '**$1**$2');

    // Fix citations inside italic markers: *text[1][2]* -> *text*[1][2]
    fixed = fixed.replace(/\*([^*]*?)(\[\d+\](?:\[\d+\])*)\*/g, '*$1*$2');

    return fixed;
  };

  // Render text with citation links
  const renderWithCitations = (text: string): React.ReactNode => {
    if (!summary?.citationMap) return text;

    // Split text by citation patterns like [1], [2], [1][2][3]
    const parts = text.split(/(\[\d+\])/g);

    return parts.map((part, index) => {
      const match = part.match(/^\[(\d+)\]$/);
      if (match) {
        const citationNum = match[1];
        const citation = summary.citationMap?.[citationNum];
        if (citation) {
          // Find the article in the list to open modal
          const article = articles.find(a => a.dbPaperId === citation.paper_id);
          return (
            <span key={index} className="relative inline-block group">
              <sup
                className="text-purple-400 cursor-pointer hover:text-purple-300 mx-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  if (article) {
                    setSelectedPaper(article);
                  }
                }}
              >
                [{citationNum}]
              </sup>
              <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 z-50 w-64 pointer-events-none">
                <span className="block text-sm text-white font-medium leading-tight mb-1">
                  {citation.title}
                </span>
                {article && (
                  <span className="block text-xs text-gray-400 leading-tight">
                    {article.authors.slice(0, 3).join(', ')}{article.authors.length > 3 ? ' 외' : ''}
                  </span>
                )}
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 border-r border-b border-gray-700 rotate-45"></span>
              </span>
            </span>
          );
        }
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-3 sm:p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <a
            href="/papers"
            className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
          >
            ← Back to All Papers
          </a>
          <h1 className="text-3xl font-bold">{journal || 'Loading...'}</h1>

          {/* Issue navigation */}
          <div className="flex items-center gap-4 mt-1">
            {prevIssue ? (
              <a
                href={`/issues/${scraper}/${prevIssue.id}`}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title={formatIssueLabel(prevIssue.info) || `Issue ${prevIssue.id}`}
              >
                <span className="text-xl">←</span>
                <span className="text-sm hidden sm:inline">{formatIssueLabel(prevIssue.info) || 'Prev'}</span>
              </a>
            ) : (
              <span className="text-gray-600 text-xl">←</span>
            )}

            <p className="text-gray-400 text-lg">{issueInfoStr}</p>

            {nextIssue ? (
              <a
                href={`/issues/${scraper}/${nextIssue.id}`}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
                title={formatIssueLabel(nextIssue.info) || `Issue ${nextIssue.id}`}
              >
                <span className="text-sm hidden sm:inline">{formatIssueLabel(nextIssue.info) || 'Next'}</span>
                <span className="text-xl">→</span>
              </a>
            ) : (
              <span className="text-gray-600 text-xl">→</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-400">{articles.length}</div>
            <div className="text-gray-400 text-sm">Total Papers</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">{papersWithFullText}</div>
            <div className="text-gray-400 text-sm">With Full Text</div>
            {articles.length > 0 && papersWithFullText < articles.length && (
              <button
                onClick={scrapeAllUnscraped}
                disabled={!!scrapeAllProgress}
                className="mt-2 text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
              >
                {scrapeAllProgress
                  ? `Scraping ${scrapeAllProgress.current}/${scrapeAllProgress.total}...`
                  : `Scrape All (${articles.length - papersWithFullText})`
                }
              </button>
            )}
          </div>
        </div>

        {/* Trend Summary Section */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">트렌드 분석</h2>
            <div className="flex items-center gap-3">
              {summaryExists ? (
                <button
                  onClick={openGenerateModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm"
                >
                  🔄 다시 생성
                </button>
              ) : papersWithFullText === 0 ? (
                <button
                  disabled
                  className="px-4 py-2 bg-gray-600 rounded opacity-50 cursor-not-allowed"
                >
                  📄 Scrape papers first
                </button>
              ) : papersWithFullText < articles.length ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={openGenerateModal}
                    disabled={!!scrapeAllProgress}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ⚠️ 부분 분석 생성 ({papersWithFullText}/{articles.length})
                  </button>
                  <span className="text-xs text-gray-400">
                    💡 먼저 위에서 &apos;Scrape All&apos; 클릭 권장
                  </span>
                </div>
              ) : (
                <button
                  onClick={openGenerateModal}
                  disabled={!!scrapeAllProgress}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✨ 트렌드 분석 생성 ({papersWithFullText})
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="text-gray-400 text-center py-8">Loading...</div>
          ) : summaryExists && summary ? (
            <div>
              {/* Statistics Section */}
              {summary.statistics && (
                <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Methodology Distribution */}
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs text-gray-500 uppercase mb-2">연구방법론</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-blue-400">양적</span>
                        <span className="text-white">{summary.statistics.methodology.quantitative}편 ({Math.round(summary.statistics.methodology.quantitative / summary.statistics.totalPapers * 100)}%)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-green-400">질적</span>
                        <span className="text-white">{summary.statistics.methodology.qualitative}편 ({Math.round(summary.statistics.methodology.qualitative / summary.statistics.totalPapers * 100)}%)</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-yellow-400">혼합</span>
                        <span className="text-white">{summary.statistics.methodology.mixed}편 ({Math.round(summary.statistics.methodology.mixed / summary.statistics.totalPapers * 100)}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Statistical Sophistication */}
                  <div className="bg-gray-900 rounded-lg p-4">
                    <h4 className="text-xs text-gray-500 uppercase mb-2">통계분석 수준</h4>
                    <div className="space-y-1">
                      {summary.statistics.sophistication.advanced > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-purple-400">고급</span>
                          <span className="text-white">{summary.statistics.sophistication.advanced}편</span>
                        </div>
                      )}
                      {summary.statistics.sophistication.intermediate > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-blue-400">중급</span>
                          <span className="text-white">{summary.statistics.sophistication.intermediate}편</span>
                        </div>
                      )}
                      {summary.statistics.sophistication.basic > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">기초</span>
                          <span className="text-white">{summary.statistics.sophistication.basic}편</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sample Size */}
                  {summary.statistics.sampleSize.count > 0 && (
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h4 className="text-xs text-gray-500 uppercase mb-2">표본 크기</h4>
                      <div className="text-2xl font-bold text-white">{summary.statistics.sampleSize.mean}</div>
                      <div className="text-xs text-gray-500">평균 (n={summary.statistics.sampleSize.count})</div>
                      <div className="text-xs text-gray-400 mt-1">
                        범위: {summary.statistics.sampleSize.min} ~ {summary.statistics.sampleSize.max}
                      </div>
                    </div>
                  )}

                  {/* Top Research Subjects */}
                  {summary.statistics.researchSubjects.length > 0 && (
                    <div className="bg-gray-900 rounded-lg p-4">
                      <h4 className="text-xs text-gray-500 uppercase mb-2">연구 대상</h4>
                      <div className="space-y-1">
                        {summary.statistics.researchSubjects.slice(0, 3).map((subject, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-300 truncate mr-2">{subject.type}</span>
                            <span className="text-white flex-shrink-0">{subject.count}편</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-white">{children}</h1>,
                    h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-2 text-white">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-200">{children}</h3>,
                    p: ({ children }) => {
                      // Process children to render citations
                      const processChildren = (child: React.ReactNode): React.ReactNode => {
                        if (typeof child === 'string') {
                          return renderWithCitations(child);
                        }
                        return child;
                      };
                      const processed = Array.isArray(children)
                        ? children.map(processChildren)
                        : processChildren(children);
                      return <p className="mb-3 text-gray-300 leading-relaxed">{processed}</p>;
                    },
                    ul: ({ children }) => <ul className="list-disc list-inside mb-3 text-gray-300 space-y-1">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal list-inside mb-3 text-gray-300 space-y-1">{children}</ol>,
                    li: ({ children }) => {
                      const processChildren = (child: React.ReactNode): React.ReactNode => {
                        if (typeof child === 'string') {
                          return renderWithCitations(child);
                        }
                        return child;
                      };
                      const processed = Array.isArray(children)
                        ? children.map(processChildren)
                        : processChildren(children);
                      return <li className="text-gray-300">{processed}</li>;
                    },
                    strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    em: ({ children }) => <em className="text-gray-200">{children}</em>,
                  }}
                >
                  {preprocessContent(summary.content)}
                </ReactMarkdown>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap gap-4 text-xs text-gray-500">
                <span>Generated: {new Date(summary.createdAt).toLocaleString('ko-KR')}</span>
                <span>Papers: {summary.paperCount}</span>
                <span>Cost: ${summary.costEstimate?.toFixed(4)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              {papersWithFullText === 0 ? (
                <div className="text-gray-500">
                  <p className="mb-2">No papers with full text available.</p>
                  <p className="text-sm">Please scrape some papers first.</p>
                </div>
              ) : (
                <div className="text-gray-400">
                  <p className="mb-2">No trend analysis yet.</p>
                  <p className="text-sm">Click &quot;트렌드 분석 생성&quot; to analyze {papersWithFullText} papers.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Papers List */}
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
          <h2 className="text-xl font-bold mb-4">Papers in this Issue</h2>

          {loading ? (
            <div className="text-gray-400 text-center py-8">Loading papers...</div>
          ) : articles.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No papers found.</div>
          ) : (
            <div className="space-y-3">
              {articles.map((article, idx) => (
                <div
                  key={article.id}
                  onClick={() => setSelectedPaper(article)}
                  className="p-3 bg-gray-900 rounded hover:bg-gray-800 transition-colors cursor-pointer"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-gray-500 text-sm w-6 text-right flex-shrink-0">
                      {article.paperNumber || idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-blue-400 hover:text-blue-300 font-medium">
                        {article.title}
                      </span>
                      <div className="text-gray-500 text-sm mt-1">
                        {article.authors.join(', ') || 'No authors'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 ml-8" onClick={(e) => e.stopPropagation()}>
                    {article.dbPaperId && extractedPaperIds.has(article.dbPaperId) && (
                      <span className="text-purple-400" title="AI 분석 완료">🤖</span>
                    )}
                    {article.hasFullText ? (
                      <span className="text-green-400 text-xs px-2 py-1 bg-green-900/30 rounded">
                        ✓ {(article.fullTextLength / 1000).toFixed(1)}k
                      </span>
                    ) : scrapingPapers.has(article.id) ? (
                      <span className="text-blue-400 text-xs px-2 py-1 bg-blue-900/30 rounded animate-pulse">
                        Scraping...
                      </span>
                    ) : article.isScraped ? (
                      <button
                        onClick={() => scrapePaper(article.id)}
                        className="text-yellow-400 text-xs px-2 py-1 bg-yellow-900/30 rounded hover:bg-yellow-900/50"
                      >
                        No text - Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => scrapePaper(article.id)}
                        className="text-blue-400 text-xs px-2 py-1 bg-blue-900/30 rounded hover:bg-blue-900/50"
                      >
                        Scrape
                      </button>
                    )}
                    {article.storagePdfUrl && (
                      <a
                        href={article.storagePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-900/30 rounded"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Generate Modal */}
        {showGenerateModal && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => !generating && setShowGenerateModal(false)}
          >
            <div
              className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">트렌드 분석 생성</h2>

                <div className="space-y-4">
                  {/* Field context */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      전문 분야 (선택사항)
                    </label>
                    <input
                      type="text"
                      value={fieldContext}
                      onChange={(e) => setFieldContext(e.target.value)}
                      disabled={generating}
                      placeholder="예: 상담심리학, 가족치료, 청소년상담"
                      className="w-full bg-gray-900 text-white px-4 py-2 rounded border border-gray-700 focus:border-purple-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>

                  {/* Custom prompt */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      분석 프롬프트
                    </label>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      disabled={generating}
                      rows={12}
                      className="w-full bg-gray-900 text-white px-4 py-3 rounded border border-gray-700 focus:border-purple-500 focus:outline-none font-mono text-sm disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      프롬프트를 수정하여 원하는 분석 관점을 지정할 수 있습니다.
                    </p>
                  </div>

                  {/* Progress indicator */}
                  {generating && progress && (
                    <div className="bg-purple-900/30 border border-purple-700 rounded p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-purple-300 text-sm">Processing...</span>
                        <span className="text-purple-300 text-sm">{progress.current} / {progress.total}</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(progress.current / progress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-purple-200 text-xs truncate">
                        {progress.paperTitle}
                      </p>
                    </div>
                  )}

                  {/* Cost estimate (hide when generating) */}
                  {!generating && (
                    <div className="bg-gray-900 rounded p-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">분석 대상 논문</span>
                        <span className="text-white">{papersWithFullText}편</span>
                      </div>
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-gray-400">예상 비용</span>
                        <span className="text-yellow-400">
                          ~${((papersWithFullText * 45000 * 0.10 / 1000000) + 0.02).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm mt-2">
                        <span className="text-gray-400">예상 시간</span>
                        <span className="text-gray-300">~{Math.ceil(papersWithFullText / 3) * 3 + 10}초</span>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {generateError && (
                    <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-300 text-sm">
                      {generateError}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setShowGenerateModal(false)}
                    disabled={generating}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={generateSummary}
                    disabled={generating || papersWithFullText === 0}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50 flex items-center gap-2"
                  >
                    {generating ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                        생성 중...
                      </>
                    ) : (
                      '생성하기'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Paper Detail Modal */}
        <PaperDetailModal
          paper={selectedPaper}
          journal={journal}
          onClose={() => setSelectedPaper(null)}
          onPaperUpdated={handlePaperUpdated}
        />
      </div>
    </div>
  );
}
