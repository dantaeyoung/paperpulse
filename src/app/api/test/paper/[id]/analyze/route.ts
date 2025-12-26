import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const DEFAULT_EXTRACTION_PROMPT = `다음 학술논문을 분석하여 JSON 형식으로 핵심 정보를 추출해주세요.

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

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: paperId } = await params;
  const supabase = createServerClient();

  try {
    // Get paper with full text - try external_id first (used for cached articles)
    let paper = null;

    // Try external_id first
    const { data: paperByExternal } = await supabase
      .from('papers')
      .select('id, title, full_text, abstract')
      .eq('external_id', paperId)
      .single();

    if (paperByExternal) {
      paper = paperByExternal;
    } else {
      // Fall back to UUID id
      const { data: paperById } = await supabase
        .from('papers')
        .select('id, title, full_text, abstract')
        .eq('id', paperId)
        .single();
      paper = paperById;
    }

    if (!paper) {
      return NextResponse.json({ error: 'Paper not found' }, { status: 404 });
    }

    const textToAnalyze = paper.full_text || paper.abstract;
    if (!textToAnalyze) {
      return NextResponse.json({
        error: 'Paper has no text to analyze. Scrape the PDF first.',
      }, { status: 400 });
    }

    // Get custom prompt if set
    const { data: customPromptSetting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'extraction_prompt')
      .single();

    const extractionPrompt = customPromptSetting?.value || DEFAULT_EXTRACTION_PROMPT;

    // Initialize Gemini
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // Generate extraction
    const prompt = `${extractionPrompt}

제목: ${paper.title}

${textToAnalyze.substring(0, 15000)}`; // Limit text length

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON from response
    let extraction;
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extraction = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse extraction:', parseError);
      return NextResponse.json({
        error: 'Failed to parse AI response',
        raw_response: responseText,
      }, { status: 500 });
    }

    // Store extraction in papers table using the actual UUID
    const { error: updateError } = await supabase
      .from('papers')
      .update({ extraction })
      .eq('id', paper.id);

    if (updateError) {
      console.error('Failed to save extraction:', updateError);
      // Continue anyway - we can still return the result
    }

    return NextResponse.json({
      success: true,
      extraction,
      paper_id: paper.id,
    });

  } catch (error) {
    console.error('Analyze paper error:', error);
    return NextResponse.json({
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown',
    }, { status: 500 });
  }
}
