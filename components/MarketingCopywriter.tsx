
import React, { useState, useEffect } from 'react';
import type { Persona, ApiState, ProgramData } from '../types';
import { generateContentStream } from '../services/geminiService';
import OutputDisplay from './OutputDisplay';

interface MarketingCopywriterProps {
  persona: Persona;
  programData: ProgramData;
}

const CHANNELS = [
  '가정통신문/알림장 (학부모 대상)', '블로그/SNS (수강생 모집용)', '전단지/포스터 (오프라인)', 
  '문자/카톡 안내 메시지', '학교 홈페이지 공지', '학부모 설명회 대본'
];

const MarketingCopywriter: React.FC<MarketingCopywriterProps> = ({ persona, programData }) => {
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [inputs, setInputs] = useState({ benefit: '', channel: CHANNELS[0] });
  const [apiState, setApiState] = useState<ApiState>({ output: '', isLoading: false, error: null });

  useEffect(() => {
    if (programData.learningGoal && !inputs.benefit) {
      setInputs(prev => ({ ...prev, benefit: `이 수업을 통해 ${programData.learningGoal} 할 수 있습니다.` }));
    }
  }, [programData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiState({ output: '', isLoading: true, error: null });
    if (window.innerWidth < 1024) setIsInputVisible(false);

    const userInput = `[Topic: ${programData.topic}], [Target: ${programData.targetAudience}], [Benefit: ${inputs.benefit}], [Channel: ${inputs.channel}]`;
    
    try {
      const stream = generateContentStream(persona.systemPrompt, userInput);
      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk;
        setApiState(prev => ({ ...prev, output: fullText, isLoading: true }));
      }
      setApiState(prev => ({ ...prev, isLoading: false }));

    } catch (err: any) {
      setApiState({ output: '', isLoading: false, error: err.message });
    }
  };

  if (!programData.topic) {
    return (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-2xl border border-stone-200 shadow-lg m-4">
          <div className="bg-stone-100 w-20 h-20 rounded-full flex items-center justify-center mb-6">
               <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
          </div>
          <h3 className="text-2xl font-serif text-stone-800 mb-2">Curriculum Required</h3>
          <p className="text-stone-500">Step 1에서 수업 설계를 먼저 완료해주세요.</p>
        </div>
      );
  }

  const inputClass = "w-full bg-white border border-stone-300 rounded-md px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800 transition-colors shadow-sm font-sans text-sm";
  const labelClass = "block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2";

  return (
    <div className="relative">
       <div className="absolute -top-12 right-0 z-20">
          <button 
            onClick={() => setIsInputVisible(!isInputVisible)}
            className="flex items-center text-xs font-bold text-stone-500 bg-white px-3 py-2 rounded-lg shadow-sm border border-stone-200 hover:bg-stone-50"
          >
            {isInputVisible ? '입력창 숨기기' : '입력창 열기'}
             <svg className={`w-4 h-4 ml-2 transform transition-transform ${isInputVisible ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
       </div>

      <div className={`grid transition-all duration-500 gap-8 ${isInputVisible ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
       <div className={`lg:col-span-1 space-y-6 ${isInputVisible ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-xl sticky top-32">
          <h3 className="font-bold text-xl text-stone-900 mb-6">Promotion Strategy</h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-stone-50 p-4 rounded-lg border border-stone-200">
               <p className="text-stone-400 text-[10px] uppercase tracking-widest font-bold mb-1">Target Course</p>
               <p className="font-medium text-stone-800 text-lg">{programData.topic}</p>
            </div>

            <div>
              <label className={labelClass}>Channel (매체)</label>
              <div className="relative">
                <select 
                    value={inputs.channel} 
                    onChange={(e) => setInputs(prev => ({...prev, channel: e.target.value}))} 
                    className={`${inputClass} pr-8 truncate`}
                >
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-stone-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>

            <div>
              <label className={labelClass}>Key Benefit (소구점)</label>
              <textarea 
                value={inputs.benefit} 
                onChange={(e) => setInputs(prev => ({...prev, benefit: e.target.value}))} 
                className={inputClass}
                rows={5}
                placeholder="수강생이 얻을 수 있는 핵심 가치"
              ></textarea>
            </div>

            <button type="submit" disabled={apiState.isLoading && !apiState.output} className="mt-2 w-full flex items-center justify-center px-4 py-4 border border-transparent rounded-lg shadow-lg text-sm font-bold uppercase tracking-widest text-white bg-amber-600 hover:bg-amber-700 focus:outline-none disabled:bg-stone-300 transition-all">
              {apiState.isLoading ? '작성 중...' : '홍보 문구 생성 (Generate)'}
            </button>
          </form>
        </div>
      </div>

      <div className={isInputVisible ? 'lg:col-span-2' : 'lg:col-span-1'}>
        <OutputDisplay 
            apiState={apiState} 
            titleContext={`${programData.topic} 홍보안`}
            filePrefix="홍보안"
            isFullWidth={!isInputVisible}
        />
      </div>
    </div>
    </div>
  );
};

export default MarketingCopywriter;
