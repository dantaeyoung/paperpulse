# Issue Trend Summary

## Purpose & Problem

Researchers want to understand **trends across multiple papers** in a journal issue, not just individual paper summaries. Currently, the system generates per-paper summaries, but users lack a holistic view of:

- Common research topics and themes
- Typical research subjects/populations
- Methodology trends (qualitative vs quantitative)
- Statistical analysis methods and sophistication levels

## Solution: Hybrid Summarization

Use a two-stage approach:
1. **Stage 1 (Gemini Flash)**: Extract key information from each paper (~45k tokens each)
2. **Stage 2 (Gemini Pro)**: Synthesize extractions into trend analysis (~10k tokens total)

**Cost target**: ~$0.09 per issue (well under $0.50 limit)

## User Stories

1. As a researcher, I want to see a trend summary for a journal issue so I can quickly understand the current research landscape
2. As a researcher, I want the summary to highlight methodology patterns so I can see what approaches are common in my field
3. As a researcher, I want to understand statistical sophistication levels so I can benchmark my own work

## Technical Design

### Stage 1: Paper Extraction (Flash)

For each paper in an issue, extract:

```typescript
interface PaperExtraction {
  paper_id: string;
  title: string;

  // Research focus
  research_topic: string;        // Main research question/topic
  research_subjects: {
    type: string;                // e.g., "대학생", "청소년", "상담사"
    sample_size?: number;
  };

  // Methodology
  methodology_type: "qualitative" | "quantitative" | "mixed";
  data_collection: string[];     // e.g., ["설문조사", "면접", "관찰"]

  // Statistical methods (if quantitative)
  statistical_methods?: string[]; // e.g., ["t-test", "ANOVA", "회귀분석", "SEM"]
  statistical_sophistication?: "basic" | "intermediate" | "advanced";

  // Key findings (brief)
  key_findings: string;
}
```

### Stage 2: Trend Synthesis (Pro)

Input: Array of PaperExtraction objects
Output: Natural language trend analysis in Korean

```typescript
interface IssueTrendSummary {
  id: string;
  issue_cache_id: string;        // Reference to issue_cache table
  scraper_key: string;
  issue_id: string;

  // Generated content
  summary_content: string;       // Full trend analysis (Korean)
  paper_count: number;

  // Metadata
  model_extraction: string;      // e.g., "gemini-1.5-flash"
  model_synthesis: string;       // e.g., "gemini-1.5-pro"
  tokens_used_extraction: number;
  tokens_used_synthesis: number;
  cost_estimate: number;

  created_at: timestamp;
}
```

### Database Schema

```sql
CREATE TABLE issue_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraper_key VARCHAR(50) NOT NULL,
  issue_id VARCHAR(100) NOT NULL,

  summary_content TEXT NOT NULL,
  extractions JSONB,            -- Store raw extractions for debugging
  paper_count INTEGER NOT NULL,

  model_extraction VARCHAR(50) DEFAULT 'gemini-1.5-flash',
  model_synthesis VARCHAR(50) DEFAULT 'gemini-1.5-pro',
  tokens_used_extraction INTEGER,
  tokens_used_synthesis INTEGER,
  cost_estimate DECIMAL(10, 4),

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(scraper_key, issue_id)
);
```

### API Endpoints

#### Generate Issue Summary
```
POST /api/issues/[scraper]/[issueId]/summary
```

Response:
```json
{
  "summary": "이번 호에 실린 12편의 논문을 분석한 결과...",
  "paper_count": 12,
  "cost": 0.09,
  "cached": false
}
```

#### Get Issue Summary (if exists)
```
GET /api/issues/[scraper]/[issueId]/summary
```

### Prompts

#### Stage 1: Extraction Prompt (Flash)
```
다음 학술논문을 분석하여 JSON 형식으로 핵심 정보를 추출해주세요:

1. research_topic: 주요 연구 주제/질문
2. research_subjects: 연구 대상 (유형과 표본 크기)
3. methodology_type: "qualitative", "quantitative", 또는 "mixed"
4. data_collection: 자료수집 방법들
5. statistical_methods: 사용된 통계분석 방법들 (해당시)
6. statistical_sophistication: "basic" (t-test, 빈도분석), "intermediate" (ANOVA, 회귀분석), "advanced" (SEM, HLM, 다층분석)
7. key_findings: 핵심 연구결과 (1-2문장)

논문:
{paper_text}
```

#### Stage 2: Synthesis Prompt (Pro)
```
아래는 {journal_name} {issue_info}에 실린 {count}편의 논문에서 추출한 정보입니다.

이 논문들을 종합 분석하여 다음 관점에서 연구 트렌드를 파악해주세요:

1. **연구 주제 트렌드**: 공통적으로 다루는 주제, 새롭게 부상하는 관심사
2. **연구 대상 경향**: 주로 연구되는 대상군, 표본 크기 경향
3. **방법론 트렌드**: 질적/양적/혼합 연구의 비율, 자료수집 방법의 경향
4. **통계분석 수준**: 사용되는 분석방법의 복잡성, 고급 기법 사용 여부

단순 나열이 아닌, 전체적인 흐름과 패턴을 해석하여 설명해주세요.
학술적이지만 이해하기 쉬운 한국어로 작성해주세요.

추출된 정보:
{extractions_json}
```

## UI Integration

### Issue Page (`/issues/[scraper]/[issueId]`)

A dedicated page per issue showing:

1. **Header**: Journal name, volume/issue info, paper count
2. **Trend Summary Section** (top):
   - If no summary: "트렌드 분석 생성" button
   - Button opens modal with editable prompt textarea
   - Shows loading state during generation (can take 1-2 min)
   - Once generated: displays summary with "다시 생성" option
3. **Papers List** (below):
   - List of all papers in the issue
   - Title, authors, brief info
   - Links to individual paper details

### Generation Modal

```
┌─────────────────────────────────────────────┐
│  트렌드 분석 생성                            │
├─────────────────────────────────────────────┤
│  분석 프롬프트:                              │
│  ┌─────────────────────────────────────────┐│
│  │ 이 논문들을 종합 분석하여 다음 관점에서   ││
│  │ 연구 트렌드를 파악해주세요:              ││
│  │                                         ││
│  │ 1. 연구 주제 트렌드                      ││
│  │ 2. 연구 대상 경향                        ││
│  │ 3. 방법론 트렌드                         ││
│  │ 4. 통계분석 수준                         ││
│  │ ...                                     ││
│  └─────────────────────────────────────────┘│
│                                             │
│  예상 비용: ~$0.09 (12 papers)              │
│                                             │
│  [취소]                    [생성하기]        │
└─────────────────────────────────────────────┘
```

## Decisions

1. **Trigger mechanism**: Manual button (v1), will evolve to automatic/digest later
2. **Scope**: Per-issue only (v1)
3. **User personalization**: Yes — consider user's `field_context` + support custom prompts
4. **Language**: All Korean (Gemini handles this well, no model change needed)
5. **Display**: Web page per issue showing papers + trend summary (will be emailed later)

## Open Questions

1. **Caching strategy**: How long to cache? Regenerate if papers updated?
2. **Error handling**: What if some papers fail extraction?

## Custom Prompt UX

- Textarea shown when user clicks "Generate Summary"
- Pre-filled with default template (the synthesis prompt)
- User can edit before generating
- Allows experimentation with different analysis angles

## Out of Scope (v1)

- Cross-issue/monthly trend analysis
- Cross-journal comparisons
- Historical trend tracking over time
- Visualization/charts of trends
- Export to PDF/document
- Email delivery (coming later)

## Success Criteria

1. Cost per issue summary ≤ $0.50
2. Summary captures meaningful trends (qualitative validation)
3. Generation completes within 2 minutes
4. Summary cached for subsequent views

---

*Status: IMPLEMENTED*

## Implementation Notes

### Files Created/Modified

1. **Database Migration**: `supabase/migrations/004_issue_summaries.sql`
2. **AI Service**: `src/lib/ai/issue-summary.ts` - Hybrid Flash+Pro summarization
3. **Types**: `src/lib/supabase/types.ts` - Added `issue_summaries` table type
4. **API Endpoint**: `src/app/api/issues/[scraper]/[issueId]/summary/route.ts`
   - GET: Retrieve existing summary
   - POST: Generate new summary
   - OPTIONS: Get default prompt
5. **UI Page**: `src/app/issues/[scraper]/[issueId]/page.tsx`

### Usage

1. Navigate to `/issues/{scraper}/{issueId}` (e.g., `/issues/counselors/catcode123`)
2. View papers in the issue
3. Click "트렌드 분석 생성" to open the generation modal
4. Optionally edit the prompt or add field context
5. Click "생성하기" to generate the trend analysis

### Branch

`feature/issue-trend-summary`
