import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

// Model constants
export const MODELS = {
  GEMINI_FLASH: 'gemini-2.0-flash',
  OPENAI: 'gpt-4o-mini',
} as const;

// Cost per 1M tokens
const PRICING = {
  [MODELS.GEMINI_FLASH]: { input: 0.10, output: 0.40 },
  [MODELS.OPENAI]: { input: 0.15, output: 0.60 },
};

export interface PaperExtraction {
  paper_id: string;
  title: string;
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

export interface ExtractionResult {
  extraction: PaperExtraction;
  tokens_used: number;
}

export interface SynthesisResult {
  summary: string;
  tokens_used: number;
}

export interface IssueStatistics {
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
    count: number; // papers with sample size
    mean: number;
    min: number;
    max: number;
    total: number;
  };
  researchSubjects: { type: string; count: number; percentage: number }[];
}

export interface CitationMap {
  [citationNumber: string]: {
    paper_id: string;
    title: string;
  };
}

export interface IssueSummaryResult {
  summary: string;
  extractions: PaperExtraction[];
  statistics: IssueStatistics;
  citationMap: CitationMap;
  paper_count: number;
  tokens_extraction: number;
  tokens_synthesis: number;
  cost_estimate: number;
  failed_papers: string[];
  model_used: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function computeIssueStatistics(extractions: PaperExtraction[]): IssueStatistics {
  const total = extractions.length;

  // Methodology distribution
  const methodology = {
    quantitative: extractions.filter(e => e.methodology_type === 'quantitative').length,
    qualitative: extractions.filter(e => e.methodology_type === 'qualitative').length,
    mixed: extractions.filter(e => e.methodology_type === 'mixed').length,
  };

  // Data collection methods (count frequency)
  const dataCollectionCounts = new Map<string, number>();
  for (const e of extractions) {
    for (const method of e.data_collection || []) {
      const normalized = method.trim().toLowerCase();
      dataCollectionCounts.set(normalized, (dataCollectionCounts.get(normalized) || 0) + 1);
    }
  }
  const dataCollection = Array.from(dataCollectionCounts.entries())
    .map(([method, count]) => ({
      method,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10

  // Statistical methods (count frequency)
  const statMethodCounts = new Map<string, number>();
  for (const e of extractions) {
    for (const method of e.statistical_methods || []) {
      const normalized = method.trim().toLowerCase();
      statMethodCounts.set(normalized, (statMethodCounts.get(normalized) || 0) + 1);
    }
  }
  const statisticalMethods = Array.from(statMethodCounts.entries())
    .map(([method, count]) => ({
      method,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10

  // Statistical sophistication
  const sophistication = {
    basic: extractions.filter(e => e.statistical_sophistication === 'basic').length,
    intermediate: extractions.filter(e => e.statistical_sophistication === 'intermediate').length,
    advanced: extractions.filter(e => e.statistical_sophistication === 'advanced').length,
    unknown: extractions.filter(e => !e.statistical_sophistication).length,
  };

  // Sample sizes
  const sampleSizes = extractions
    .map(e => e.research_subjects?.sample_size)
    .filter((s): s is number => typeof s === 'number' && s > 0);

  const sampleSize = {
    count: sampleSizes.length,
    mean: sampleSizes.length > 0 ? Math.round(sampleSizes.reduce((a, b) => a + b, 0) / sampleSizes.length) : 0,
    min: sampleSizes.length > 0 ? Math.min(...sampleSizes) : 0,
    max: sampleSizes.length > 0 ? Math.max(...sampleSizes) : 0,
    total: sampleSizes.reduce((a, b) => a + b, 0),
  };

  // Research subjects (count frequency)
  const subjectCounts = new Map<string, number>();
  for (const e of extractions) {
    const subjectType = e.research_subjects?.type?.trim();
    if (subjectType) {
      subjectCounts.set(subjectType, (subjectCounts.get(subjectType) || 0) + 1);
    }
  }
  const researchSubjects = Array.from(subjectCounts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Top 10

  return {
    totalPapers: total,
    methodology,
    dataCollection,
    statisticalMethods,
    sophistication,
    sampleSize,
    researchSubjects,
  };
}

function formatStatisticsForPrompt(stats: IssueStatistics): string {
  const lines: string[] = [];
  const total = stats.totalPapers;

  lines.push(`## 계량적 분석 결과 (${total}편 기준)\n`);

  // Methodology
  lines.push('### 연구방법론 분포');
  lines.push(`- 양적연구: ${stats.methodology.quantitative}편 (${Math.round(stats.methodology.quantitative / total * 100)}%)`);
  lines.push(`- 질적연구: ${stats.methodology.qualitative}편 (${Math.round(stats.methodology.qualitative / total * 100)}%)`);
  lines.push(`- 혼합연구: ${stats.methodology.mixed}편 (${Math.round(stats.methodology.mixed / total * 100)}%)`);
  lines.push('');

  // Data collection
  if (stats.dataCollection.length > 0) {
    lines.push('### 자료수집 방법 (중복 포함)');
    for (const dc of stats.dataCollection.slice(0, 5)) {
      lines.push(`- ${dc.method}: ${dc.count}편 (${dc.percentage}%)`);
    }
    lines.push('');
  }

  // Statistical sophistication
  const sophTotal = stats.sophistication.basic + stats.sophistication.intermediate + stats.sophistication.advanced;
  if (sophTotal > 0) {
    lines.push('### 통계분석 수준');
    if (stats.sophistication.advanced > 0) {
      lines.push(`- 고급 (SEM, HLM, 다층분석): ${stats.sophistication.advanced}편 (${Math.round(stats.sophistication.advanced / total * 100)}%)`);
    }
    if (stats.sophistication.intermediate > 0) {
      lines.push(`- 중급 (회귀분석, ANOVA, 요인분석): ${stats.sophistication.intermediate}편 (${Math.round(stats.sophistication.intermediate / total * 100)}%)`);
    }
    if (stats.sophistication.basic > 0) {
      lines.push(`- 기초 (t-test, 상관분석, 빈도분석): ${stats.sophistication.basic}편 (${Math.round(stats.sophistication.basic / total * 100)}%)`);
    }
    lines.push('');
  }

  // Statistical methods
  if (stats.statisticalMethods.length > 0) {
    lines.push('### 주요 통계기법 (중복 포함)');
    for (const sm of stats.statisticalMethods.slice(0, 5)) {
      lines.push(`- ${sm.method}: ${sm.count}편`);
    }
    lines.push('');
  }

  // Sample sizes
  if (stats.sampleSize.count > 0) {
    lines.push('### 표본 크기');
    lines.push(`- 표본 정보 있는 논문: ${stats.sampleSize.count}편`);
    lines.push(`- 평균 표본크기: ${stats.sampleSize.mean}명`);
    lines.push(`- 범위: ${stats.sampleSize.min}명 ~ ${stats.sampleSize.max}명`);
    lines.push('');
  }

  // Research subjects
  if (stats.researchSubjects.length > 0) {
    lines.push('### 연구 대상');
    for (const rs of stats.researchSubjects.slice(0, 5)) {
      lines.push(`- ${rs.type}: ${rs.count}편 (${rs.percentage}%)`);
    }
  }

  return lines.join('\n');
}

const EXTRACTION_PROMPT = `다음 학술논문을 분석하여 JSON 형식으로 핵심 정보를 추출해주세요.

반드시 아래 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):

{
  "research_topic": "주요 연구 주제/질문",
  "research_subjects": {
    "type": "연구 대상 유형 (예: 대학생, 청소년, 상담사)",
    "sample_size": 숫자 또는 null
  },
  "methodology_type": "qualitative" | "quantitative" | "mixed",
  "data_collection": ["자료수집 방법들"],
  "statistical_methods": ["사용된 통계분석 방법들"] 또는 null,
  "statistical_sophistication": "basic" | "intermediate" | "advanced" | null,
  "key_findings": "핵심 연구결과 1-2문장"
}

통계분석 수준 기준:
- basic: t-test, 빈도분석, 카이제곱, 상관분석
- intermediate: ANOVA, 회귀분석, 요인분석
- advanced: SEM, HLM, 다층분석, 잠재성장모형

논문:
`;

const DEFAULT_SYNTHESIS_PROMPT = (journalName: string, issueInfo: string, count: number, fieldContext?: string) => `
${fieldContext ? `당신은 ${fieldContext} 분야 전문가입니다.` : ''}

아래는 ${journalName} ${issueInfo}에 실린 ${count}편의 논문에서 추출한 정보와 계량적 분석 결과입니다.

이 자료를 바탕으로 다음 관점에서 연구 트렌드를 해석해주세요:

1. **연구 주제 트렌드**: 공통적으로 다루는 주제, 새롭게 부상하는 관심사
2. **연구 대상 경향**: 주로 연구되는 대상군의 특징과 함의
3. **방법론적 특징**: 제공된 통계를 활용하여 방법론적 경향 해석 (예: "양적연구가 X%로 우세하며...")
4. **통계분석 수준**: 분석기법의 정교화 정도, 고급 기법 사용 경향의 의미

## 인용 규칙 (매우 중요!)
- 특정 논문을 언급할 때는 반드시 대괄호 숫자로 인용하세요: [1], [2], [3] 등
- 여러 논문을 함께 인용할 때: [1][3][5] 형식으로 한 줄에 연속으로 작성 (줄바꿈 없이!)
- 인용은 반드시 마크다운 서식(**굵게**, *기울임*) 바깥에 배치하세요
  - 올바른 예: **양적 연구가 67%**[2][3][7]로 우세하다
  - 잘못된 예: **양적 연구가 67%[2][3][7]로 우세하다**
- 예시: "구조방정식을 활용한 연구[2][5][7]가 증가하는 추세이다"
- 모든 주요 주장에 해당 논문을 인용해주세요

중요: 아래 "계량적 분석 결과"의 수치를 직접 인용하여 구체적으로 서술해주세요.

단순 나열이 아닌, 전체적인 흐름과 패턴을 해석하여 설명해주세요.
학술적이지만 이해하기 쉬운 한국어로 작성해주세요.

Add an English translation of the report at the end.
`.trim();

export class IssueSummaryService {
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private maxRetries = 3;
  private baseDelay = 2000;
  private useOpenAI = false;
  private modelUsed: string = MODELS.GEMINI_FLASH;

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    if (process.env.OPENAI_API_KEY) {
      this.openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    if (!this.geminiClient && !this.openaiClient) {
      throw new Error('Either GEMINI_API_KEY or OPENAI_API_KEY is required');
    }
  }

  private async generateWithGemini(prompt: string): Promise<{ text: string; tokens: number }> {
    if (!this.geminiClient) throw new Error('Gemini client not available');

    const model = this.geminiClient.getGenerativeModel({ model: MODELS.GEMINI_FLASH });
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying Gemini after ${waitTime}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await delay(waitTime);
        }

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        const inputTokens = Math.ceil(prompt.length / 4);
        const outputTokens = Math.ceil(text.length / 4);

        return { text, tokens: inputTokens + outputTokens };
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';

        if (errorMessage.includes('429') || errorMessage.includes('quota')) {
          throw new Error(`QUOTA_EXCEEDED: ${errorMessage}`);
        }

        console.error(`Gemini API error (attempt ${attempt + 1}):`, errorMessage);
      }
    }

    throw lastError || new Error('Failed to generate with Gemini after retries');
  }

  private async generateWithOpenAI(prompt: string): Promise<{ text: string; tokens: number }> {
    if (!this.openaiClient) throw new Error('OpenAI client not available');

    const response = await this.openaiClient.chat.completions.create({
      model: MODELS.OPENAI,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const text = response.choices[0]?.message?.content || '';
    const tokens = response.usage?.total_tokens || Math.ceil((prompt.length + text.length) / 4);

    return { text, tokens };
  }

  private async generate(prompt: string): Promise<{ text: string; tokens: number }> {
    // If already switched to OpenAI (due to quota), use OpenAI
    if (this.useOpenAI) {
      this.modelUsed = MODELS.OPENAI;
      return this.generateWithOpenAI(prompt);
    }

    // Try Gemini first
    if (this.geminiClient) {
      try {
        this.modelUsed = MODELS.GEMINI_FLASH;
        return await this.generateWithGemini(prompt);
      } catch (error) {
        const errorMessage = (error as Error).message || '';

        // If quota exceeded and OpenAI available, switch to OpenAI
        if (errorMessage.includes('QUOTA_EXCEEDED') && this.openaiClient) {
          console.log('Gemini quota exceeded, falling back to OpenAI...');
          this.useOpenAI = true;
          this.modelUsed = MODELS.OPENAI;
          return this.generateWithOpenAI(prompt);
        }

        throw error;
      }
    }

    // No Gemini, use OpenAI
    if (this.openaiClient) {
      this.modelUsed = MODELS.OPENAI;
      return this.generateWithOpenAI(prompt);
    }

    throw new Error('No AI provider available');
  }

  async extractPaperInfo(
    paperId: string,
    title: string,
    text: string
  ): Promise<ExtractionResult> {
    const prompt = EXTRACTION_PROMPT + text;
    const { text: responseText, tokens } = await this.generate(prompt);

    let extraction: PaperExtraction;
    try {
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const parsed = JSON.parse(jsonStr.trim());
      extraction = {
        paper_id: paperId,
        title,
        ...parsed,
      };
    } catch {
      console.error('Failed to parse extraction JSON:', responseText);
      extraction = {
        paper_id: paperId,
        title,
        research_topic: 'Parse error - could not extract',
        research_subjects: { type: 'unknown' },
        methodology_type: 'mixed',
        data_collection: [],
        key_findings: 'Extraction failed',
      };
    }

    return { extraction, tokens_used: tokens };
  }

  async synthesizeTrends(
    extractions: PaperExtraction[],
    statistics: IssueStatistics,
    journalName: string,
    issueInfo: string,
    customPrompt?: string,
    fieldContext?: string
  ): Promise<{ summary: string; tokens_used: number; citationMap: CitationMap }> {
    const basePrompt = customPrompt || DEFAULT_SYNTHESIS_PROMPT(
      journalName,
      issueInfo,
      extractions.length,
      fieldContext
    );

    // Build citation map and numbered paper list
    const citationMap: CitationMap = {};
    const numberedPapers: string[] = [];

    extractions.forEach((extraction, index) => {
      const citationNum = index + 1;
      citationMap[citationNum.toString()] = {
        paper_id: extraction.paper_id,
        title: extraction.title,
      };
      numberedPapers.push(
        `[${citationNum}] ${extraction.title}\n` +
        `    - 연구주제: ${extraction.research_topic}\n` +
        `    - 연구대상: ${extraction.research_subjects?.type || 'N/A'}${extraction.research_subjects?.sample_size ? ` (n=${extraction.research_subjects.sample_size})` : ''}\n` +
        `    - 방법론: ${extraction.methodology_type}\n` +
        `    - 주요결과: ${extraction.key_findings}`
      );
    });

    // Include computed statistics and numbered papers in prompt
    const statsText = formatStatisticsForPrompt(statistics);
    const papersText = '## 논문 목록 (인용 시 번호 사용)\n\n' + numberedPapers.join('\n\n');

    const prompt = basePrompt + '\n\n' + statsText + '\n\n' + papersText;
    const { text, tokens } = await this.generate(prompt);

    return { summary: text, tokens_used: tokens, citationMap };
  }

  async generateIssueSummary(
    papers: Array<{ id: string; title: string; text: string }>,
    journalName: string,
    issueInfo: string,
    customPrompt?: string,
    fieldContext?: string,
    onProgress?: (current: number, total: number, paperTitle: string) => void
  ): Promise<IssueSummaryResult> {
    const extractions: PaperExtraction[] = [];
    const failedPapers: string[] = [];
    let totalExtractionTokens = 0;

    console.log(`Extracting info from ${papers.length} papers...`);

    // Process in parallel batches of 3 (paid tier has higher rate limits)
    const BATCH_SIZE = 3;
    for (let i = 0; i < papers.length; i += BATCH_SIZE) {
      const batch = papers.slice(i, i + BATCH_SIZE);

      // Report progress for first paper in batch
      if (onProgress) {
        onProgress(i + 1, papers.length, batch[0].title);
      }

      console.log(`Processing papers ${i + 1}-${Math.min(i + BATCH_SIZE, papers.length)} of ${papers.length}...`);

      const results = await Promise.allSettled(
        batch.map(paper => this.extractPaperInfo(paper.id, paper.title, paper.text))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const paper = batch[j];

        if (result.status === 'fulfilled') {
          extractions.push(result.value.extraction);
          totalExtractionTokens += result.value.tokens_used;
        } else {
          console.error(`Failed to extract paper ${paper.id}:`, result.reason);
          failedPapers.push(paper.id);
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < papers.length) {
        await delay(500);
      }
    }

    if (extractions.length === 0) {
      throw new Error('All paper extractions failed');
    }

    // Compute statistics from extractions
    console.log(`Computing statistics from ${extractions.length} extractions...`);
    const statistics = computeIssueStatistics(extractions);

    console.log(`Synthesizing trends from ${extractions.length} extractions...`);
    const synthesis = await this.synthesizeTrends(
      extractions,
      statistics,
      journalName,
      issueInfo,
      customPrompt,
      fieldContext
    );

    const pricing = PRICING[this.modelUsed as keyof typeof PRICING] || PRICING[MODELS.GEMINI_FLASH];
    const extractionCost = (totalExtractionTokens / 1_000_000) * pricing.input;
    const synthesisCost = (synthesis.tokens_used / 1_000_000) * (pricing.input + pricing.output) / 2;

    return {
      summary: synthesis.summary,
      extractions,
      statistics,
      citationMap: synthesis.citationMap,
      paper_count: papers.length,
      tokens_extraction: totalExtractionTokens,
      tokens_synthesis: synthesis.tokens_used,
      cost_estimate: extractionCost + synthesisCost,
      failed_papers: failedPapers,
      model_used: this.modelUsed,
    };
  }

  getDefaultSynthesisPrompt(
    journalName: string,
    issueInfo: string,
    count: number,
    fieldContext?: string
  ): string {
    return DEFAULT_SYNTHESIS_PROMPT(journalName, issueInfo, count, fieldContext);
  }
}

// Create fresh instance per request to avoid stale state issues
export function getIssueSummaryService(): IssueSummaryService {
  return new IssueSummaryService();
}
