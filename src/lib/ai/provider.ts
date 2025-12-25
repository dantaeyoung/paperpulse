import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';

export interface AIProvider {
  summarize(text: string, fieldContext?: string): Promise<string>;
  getModelName(): string;
}

const SUMMARIZATION_PROMPT = (fieldContext?: string) => `
당신은 학술 논문 요약 전문가입니다.
${fieldContext ? `특히 ${fieldContext} 분야에 전문성을 가지고 있습니다.` : ''}
다음 학술 논문을 연구자와 실무자가 빠르게 이해할 수 있도록 한국어로 요약해주세요.

요약에는 다음 내용을 포함해주세요:
1. **연구 목적**: 이 연구가 해결하고자 하는 문제나 질문
2. **연구 방법**: 사용된 연구 방법론 (참여자 수, 분석 방법 등)
3. **주요 결과**: 핵심 발견 사항 2-3가지
4. **시사점**: 해당 분야 연구자나 실무자가 적용할 수 있는 점

길이: 300-400자
어조: 전문적이지만 이해하기 쉽게
`.trim();

// Helper function for delay
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: string = 'gemini-2.0-flash';
  private maxRetries = 3;
  private baseDelay = 2000;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }

  getModelName(): string {
    return this.model;
  }

  async summarize(text: string, fieldContext?: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: this.model });

    const prompt = `${SUMMARIZATION_PROMPT(fieldContext)}

---
${text}
`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const waitTime = this.baseDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying after ${waitTime}ms (attempt ${attempt + 1}/${this.maxRetries})`);
          await delay(waitTime);
        }

        const result = await model.generateContent(prompt);
        const response = result.response;
        return response.text();
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || '';

        // If it's a quota error, throw immediately
        if (errorMessage.includes('429') && errorMessage.includes('quota')) {
          throw new Error(`QUOTA_EXCEEDED: ${errorMessage}`);
        }

        console.error(`Gemini API error (attempt ${attempt + 1}):`, errorMessage);
      }
    }

    throw lastError || new Error('Failed to generate summary after retries');
  }
}

class OpenAIProvider implements AIProvider {
  private client: OpenAI;
  private model: string = 'gpt-4o-mini';

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  getModelName(): string {
    return this.model;
  }

  async summarize(text: string, fieldContext?: string): Promise<string> {
    const systemPrompt = SUMMARIZATION_PROMPT(fieldContext);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      max_tokens: 1000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }
}

// Fallback provider that tries Gemini first, then OpenAI
class FallbackProvider implements AIProvider {
  private gemini: GeminiProvider | null = null;
  private openai: OpenAIProvider | null = null;
  private lastUsedModel: string = '';

  constructor() {
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GeminiProvider();
    }
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAIProvider();
    }
  }

  getModelName(): string {
    return this.lastUsedModel;
  }

  async summarize(text: string, fieldContext?: string): Promise<string> {
    // Try Gemini first (free tier)
    if (this.gemini) {
      try {
        const result = await this.gemini.summarize(text, fieldContext);
        this.lastUsedModel = this.gemini.getModelName();
        return result;
      } catch (error) {
        const errorMessage = (error as Error).message || '';
        console.warn('Gemini failed:', errorMessage);

        // If quota exceeded and OpenAI available, fall back
        if (errorMessage.includes('QUOTA_EXCEEDED') && this.openai) {
          console.log('Falling back to OpenAI...');
        } else if (!this.openai) {
          throw error;
        }
      }
    }

    // Fall back to OpenAI
    if (this.openai) {
      const result = await this.openai.summarize(text, fieldContext);
      this.lastUsedModel = this.openai.getModelName();
      return result;
    }

    throw new Error('No AI provider available. Set GEMINI_API_KEY or OPENAI_API_KEY.');
  }
}

export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER || 'auto';

  switch (provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'auto':
    default:
      // Auto mode: try Gemini first, fall back to OpenAI
      return new FallbackProvider();
  }
}
