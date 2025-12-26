'use client';

import { useEffect, useState } from 'react';

interface Settings {
  extraction_prompt: string;
  synthesis_prompt: string;
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

const DEFAULT_SYNTHESIS_PROMPT = `아래는 학술지 호에 실린 논문들에서 추출한 정보와 계량적 분석 결과입니다.

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

Add an English translation of the report at the end.`;

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    extraction_prompt: DEFAULT_EXTRACTION_PROMPT,
    synthesis_prompt: DEFAULT_SYNTHESIS_PROMPT,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setSettings({
              extraction_prompt: data.settings.extraction_prompt || DEFAULT_EXTRACTION_PROMPT,
              synthesis_prompt: data.settings.synthesis_prompt || DEFAULT_SYNTHESIS_PROMPT,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = (field: keyof Settings) => {
    setSettings(prev => ({
      ...prev,
      [field]: field === 'extraction_prompt' ? DEFAULT_EXTRACTION_PROMPT : DEFAULT_SYNTHESIS_PROMPT,
    }));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className={`px-4 py-2 rounded font-medium transition-colors ${
            saved
              ? 'bg-green-600 text-white'
              : 'bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50'
          }`}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>

      <div className="space-y-8">
        {/* Extraction Prompt */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-semibold text-lg">Paper Extraction Prompt</h2>
              <p className="text-sm text-gray-500 mt-1">
                Used to extract structured data from individual papers (methodology, sample size, findings)
              </p>
            </div>
            <button
              onClick={() => handleReset('extraction_prompt')}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Reset to default
            </button>
          </div>
          <textarea
            value={settings.extraction_prompt}
            onChange={(e) => setSettings(prev => ({ ...prev, extraction_prompt: e.target.value }))}
            className="w-full h-64 bg-gray-800 border border-gray-700 rounded p-4 font-mono text-sm text-gray-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
          />
        </div>

        {/* Synthesis Prompt */}
        <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-semibold text-lg">Issue Synthesis Prompt</h2>
              <p className="text-sm text-gray-500 mt-1">
                Used to generate the overall issue trend summary from extracted paper data
              </p>
            </div>
            <button
              onClick={() => handleReset('synthesis_prompt')}
              className="text-sm text-gray-500 hover:text-gray-300"
            >
              Reset to default
            </button>
          </div>
          <textarea
            value={settings.synthesis_prompt}
            onChange={(e) => setSettings(prev => ({ ...prev, synthesis_prompt: e.target.value }))}
            className="w-full h-80 bg-gray-800 border border-gray-700 rounded p-4 font-mono text-sm text-gray-300 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none"
          />
        </div>

        {/* Info */}
        <div className="bg-gray-800/50 rounded-lg p-4 text-sm text-gray-400">
          <p className="font-medium text-gray-300 mb-2">Prompt Variables</p>
          <ul className="list-disc list-inside space-y-1">
            <li><code className="text-purple-400">extraction_prompt</code>: Appended with paper full text</li>
            <li><code className="text-purple-400">synthesis_prompt</code>: Prepended with journal/issue info and statistics</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
