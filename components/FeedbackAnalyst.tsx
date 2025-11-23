
import React, { useState, useRef, useEffect } from 'react';
import type { Persona, ApiState, ProgramData, SurveySchema, QuestionType } from '../types';
import { generateContent, generateContentStream } from '../services/geminiService';
import OutputDisplay from './OutputDisplay';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface FeedbackAnalystProps {
  persona: Persona;
  programData: ProgramData;
}

const QUESTION_TYPES: Record<QuestionType, string> = {
  SHORT_ANSWER: '📝 단답형 (Short Answer)',
  PARAGRAPH: '📄 서술형 (Paragraph)',
  MULTIPLE_CHOICE: '🔘 객관식 (Multiple Choice)',
  CHECKBOX: '☑️ 체크박스 (Checkboxes)',
  DROPDOWN: '▼ 드롭다운 (Dropdown)',
  LINEAR_SCALE: '📊 척도형 (Linear Scale)'
};

const FeedbackAnalyst: React.FC<FeedbackAnalystProps> = ({ persona, programData }) => {
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [mode, setMode] = useState<'Survey' | 'Analysis'>('Survey');
  const [feedbackInput, setFeedbackInput] = useState('');
  
  // Survey Builder State
  const [surveyData, setSurveyData] = useState<SurveySchema | null>(null);
  const [activeTab, setActiveTab] = useState<'Editor' | 'Interactive'>('Interactive');
  
  // Interactive Survey Answers State
  const [answers, setAnswers] = useState<Record<string, any>>({});
  
  // Analysis Source State
  const [analysisSource, setAnalysisSource] = useState<'Spreadsheet' | 'Excel'>('Spreadsheet');

  // API State
  const [apiState, setApiState] = useState<ApiState>({ output: '', isLoading: false, error: null });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved answers from localStorage
  useEffect(() => {
      const savedAnswers = localStorage.getItem('eduMaster_survey_answers');
      if (savedAnswers) {
          try {
              setAnswers(JSON.parse(savedAnswers));
          } catch(e) {}
      }
  }, []);

  // Save answers to localStorage
  const handleAnswerChange = (qId: string, value: any) => {
      const newAnswers = { ...answers, [qId]: value };
      setAnswers(newAnswers);
      localStorage.setItem('eduMaster_survey_answers', JSON.stringify(newAnswers));
  };

  // --- HANDLERS ---

  const handleGenerate = async () => {
    setApiState({ output: '', isLoading: true, error: null });
    // Only reset data if we are starting fresh, not if we are switching tabs
    if(!surveyData) setSurveyData(null);
    
    if (window.innerWidth < 1024) setIsInputVisible(false);

    try {
        if (mode === 'Survey') {
            // If data exists, user might be asking to RE-generate, so we clear
            if(surveyData) {
                if(!window.confirm("기존 설문지 내용이 초기화됩니다. 새로 생성하시겠습니까?")) {
                    setApiState(prev => ({ ...prev, isLoading: false }));
                    return;
                }
                setSurveyData(null);
            }

            const userInput = `[Action: Create Survey Draft], [Topic: ${programData.topic}], [Target: ${programData.targetAudience}]`;
            // Expecting JSON
            const response = await generateContent(persona.systemPrompt, userInput);
            
            try {
                // Clean markdown code blocks if present
                const jsonStr = response.replace(/```json/g, '').replace(/```/g, '').trim();
                const parsed: SurveySchema = JSON.parse(jsonStr);
                setSurveyData(parsed);
                setActiveTab('Interactive'); // Auto-switch to Interactive
            } catch (e) {
                console.error("JSON Parse Error", e);
                setApiState({ output: response, isLoading: false, error: "데이터 형식이 올바르지 않습니다. 텍스트 모드로 표시합니다." });
            }
            setApiState(prev => ({ ...prev, isLoading: false }));

        } else {
            // Analysis Mode (Stream)
            const userInput = `[Action: Analyze Feedback], [Topic: ${programData.topic}], [Data: ${feedbackInput}]`;
            const stream = generateContentStream(persona.systemPrompt, userInput);
            let fullText = '';
            for await (const chunk of stream) {
                fullText += chunk;
                setApiState(prev => ({ ...prev, output: fullText, isLoading: true }));
            }
            setApiState(prev => ({ ...prev, isLoading: false }));
        }
    } catch (err: any) {
        setApiState({ output: '', isLoading: false, error: err.message });
    }
  };

  // --- NEW FEATURES FOR STEP 4 ---

  const handleSaveDraft = () => {
      // Logic handled in handleAnswerChange, but this provides explicit feedback
      localStorage.setItem('eduMaster_survey_answers', JSON.stringify(answers));
      alert("✅ 응답이 임시 저장되었습니다.\n나중에 다시 방문해도 내용이 유지됩니다.");
  };

  const handleDownloadPDF = async () => {
      const element = document.getElementById('survey-print-area');
      if (!element) return;
      
      const prevDisplay = (document.querySelector('.survey-actions') as HTMLElement)?.style.display;
      if(document.querySelector('.survey-actions') as HTMLElement) (document.querySelector('.survey-actions') as HTMLElement).style.display = 'none';

      try {
          const canvas = await html2canvas(element, { 
              scale: 2,
              backgroundColor: '#ffffff'
          });
          const imgData = canvas.toDataURL('image/png');
          
          const pdf = new jsPDF('p', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          
          // Split pages if long content (simple version: just one long page scale or multiple pages)
          // For this version, we'll fit width and let height expand, or add pages.
          // Simple single page fit for short surveys, or multi-page for long.
          
          if (pdfHeight > pdf.internal.pageSize.getHeight()) {
             // Multi-page logic could be added here, but for simplicity in demo:
             // We will create a PDF with custom height to fit all content
             const customPdf = new jsPDF('p', 'mm', [pdfWidth, pdfHeight + 20]);
             customPdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
             customPdf.save(`${programData.topic}_설문지.pdf`);
          } else {
             pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
             pdf.save(`${programData.topic}_설문지.pdf`);
          }

      } catch (e) {
          console.error(e);
          alert("PDF 생성 중 오류가 발생했습니다.");
      } finally {
          if(document.querySelector('.survey-actions') as HTMLElement) (document.querySelector('.survey-actions') as HTMLElement).style.display = '';
      }
  };

  const handlePrint = () => {
      window.print();
  };

  const handleResetSurvey = () => {
      if(window.confirm("모든 응답 내용을 초기화하시겠습니까?")) {
          setAnswers({});
          localStorage.removeItem('eduMaster_survey_answers');
      }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        let text = '';
        data.forEach(row => { row.forEach(cell => { if (cell) text += `${cell}\n`; }); });
        setFeedbackInput(prev => prev + text);
        setMode('Analysis'); 
      } catch (error) { alert("파일 읽기 실패."); }
    };
    reader.readAsBinaryString(file);
  };

  // --- RENDER HELPERS ---
  
  const renderInteractiveQuestion = (q: any, idx: number) => {
      const qId = q.id || `q_${idx}`;
      const value = answers[qId];

      return (
        <div key={qId} className="question bg-white p-6 rounded-xl border border-stone-200 shadow-sm mb-6 break-inside-avoid">
          <div className="mb-4">
            <h4 className="text-lg font-bold text-stone-900">
                {idx + 1}. {q.title} {q.required && <span className="text-red-500" title="필수 항목">*</span>}
            </h4>
          </div>
          
          <div className="mt-2">
              {q.type === 'SHORT_ANSWER' && (
                  <input 
                      type="text" 
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow"
                      placeholder="답변을 입력하세요"
                      value={value || ''}
                      onChange={(e) => handleAnswerChange(qId, e.target.value)}
                  />
              )}
              
              {q.type === 'PARAGRAPH' && (
                  <textarea 
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-shadow resize-none h-32"
                      placeholder="상세한 답변을 입력하세요"
                      value={value || ''}
                      onChange={(e) => handleAnswerChange(qId, e.target.value)}
                  />
              )}
              
              {q.type === 'MULTIPLE_CHOICE' && (
                  <div className="space-y-3">
                      {q.options?.map((opt: string, i: number) => (
                          <label key={i} className="flex items-center p-3 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors">
                              <input 
                                  type="radio" 
                                  name={qId} 
                                  value={opt}
                                  checked={value === opt}
                                  onChange={(e) => handleAnswerChange(qId, e.target.value)}
                                  className="w-4 h-4 text-amber-600 focus:ring-amber-500 border-stone-300"
                              />
                              <span className="ml-3 text-stone-700 font-medium">{opt}</span>
                          </label>
                      ))}
                  </div>
              )}
              
              {q.type === 'CHECKBOX' && (
                  <div className="space-y-3">
                      {q.options?.map((opt: string, i: number) => {
                          const checked = Array.isArray(value) && value.includes(opt);
                          return (
                              <label key={i} className="flex items-center p-3 rounded-lg border border-stone-100 hover:bg-stone-50 cursor-pointer transition-colors">
                                  <input 
                                      type="checkbox" 
                                      value={opt}
                                      checked={checked}
                                      onChange={(e) => {
                                          const currentArr = Array.isArray(value) ? [...value] : [];
                                          if (e.target.checked) {
                                              currentArr.push(opt);
                                          } else {
                                              const idx = currentArr.indexOf(opt);
                                              if (idx > -1) currentArr.splice(idx, 1);
                                          }
                                          handleAnswerChange(qId, currentArr);
                                      }}
                                      className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 border-stone-300"
                                  />
                                  <span className="ml-3 text-stone-700 font-medium">{opt}</span>
                              </label>
                          );
                      })}
                  </div>
              )}
              
              {q.type === 'DROPDOWN' && (
                  <select 
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none"
                      value={value || ''}
                      onChange={(e) => handleAnswerChange(qId, e.target.value)}
                  >
                      <option value="">선택하세요</option>
                      {q.options?.map((opt: string, i: number) => (
                          <option key={i} value={opt}>{opt}</option>
                      ))}
                  </select>
              )}

              {q.type === 'LINEAR_SCALE' && (
                   <div className="flex flex-col sm:flex-row justify-between items-center w-full px-4 py-4 bg-stone-50 rounded-lg">
                       <span className="text-xs font-bold text-stone-500 mb-2 sm:mb-0">매우 그렇지 않다 (1)</span>
                       <div className="flex gap-4 sm:gap-8">
                           {[1,2,3,4,5].map(n => (
                               <label key={n} className="flex flex-col items-center cursor-pointer group">
                                   <span className="mb-2 text-sm font-bold text-stone-400 group-hover:text-amber-600 transition-colors">{n}</span>
                                   <input 
                                       type="radio" 
                                       name={qId} 
                                       value={n}
                                       checked={Number(value) === n}
                                       onChange={() => handleAnswerChange(qId, n)}
                                       className="w-5 h-5 text-amber-600 focus:ring-amber-500 border-stone-300"
                                   />
                               </label>
                           ))}
                       </div>
                       <span className="text-xs font-bold text-stone-500 mt-2 sm:mt-0">매우 그렇다 (5)</span>
                   </div>
              )}
          </div>
      </div>
    );
  };

  return (
    <div className="relative">
       <div className="absolute -top-12 right-0 z-20 no-print">
          <button 
            onClick={() => setIsInputVisible(!isInputVisible)}
            aria-label="메뉴 토글"
            className="flex items-center text-xs font-bold text-stone-500 bg-white px-3 py-2 rounded-lg shadow-sm border border-stone-200 hover:bg-stone-50"
          >
            {isInputVisible ? '메뉴 숨기기' : '메뉴 열기'}
             <svg className={`w-4 h-4 ml-2 transform transition-transform ${isInputVisible ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
       </div>

       <div className={`grid transition-all duration-500 gap-8 ${isInputVisible ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        
        {/* LEFT PANEL: CONTROLS */}
        <div className={`lg:col-span-1 ${isInputVisible ? 'block' : 'hidden'} no-print`}>
            <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-xl space-y-6 sticky top-24 max-h-[85vh] overflow-y-auto">
                <div>
                    <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">Step 4. 평가 및 피드백</label>
                    <div className="flex bg-stone-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setMode('Survey')}
                            className={`flex-1 py-2.5 text-sm rounded-md font-bold transition-all duration-200 ${mode === 'Survey' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                            설문지 생성
                        </button>
                        <button 
                            onClick={() => setMode('Analysis')}
                            className={`flex-1 py-2.5 text-sm rounded-md font-bold transition-all duration-200 ${mode === 'Analysis' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                        >
                            결과 분석
                        </button>
                    </div>
                </div>

                {mode === 'Survey' ? (
                    <div className="text-sm text-stone-600 bg-amber-50 p-4 rounded-xl border border-amber-100 leading-relaxed">
                        <p className="mb-3 font-bold text-amber-800">🚀 스마트 설문 도구</p>
                        <p className="mb-2">AI가 수업 목표에 맞는 최적의 설문지를 자동 설계합니다.</p>
                        <ul className="list-disc ml-4 mt-2 text-xs text-stone-500 space-y-1">
                            <li><strong>웹 설문:</strong> 즉시 응답 가능한 인터랙티브 폼</li>
                            <li><strong>PDF 다운로드:</strong> 배포용 PDF 파일 생성</li>
                            <li><strong>자동 저장:</strong> 응답 내용 안전하게 보관</li>
                        </ul>
                    </div>
                ) : (
                    <div>
                        <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">데이터 소스 선택</label>
                        <div className="flex space-x-2 mb-4">
                             <button 
                                 onClick={() => setAnalysisSource('Spreadsheet')}
                                 className={`flex-1 py-2 px-2 text-xs rounded border transition-colors ${analysisSource === 'Spreadsheet' ? 'bg-green-50 border-green-200 text-green-800 font-bold' : 'bg-white border-stone-200 text-stone-500'}`}
                             >
                                 Text / Link
                             </button>
                             <button 
                                 onClick={() => setAnalysisSource('Excel')}
                                 className={`flex-1 py-2 px-2 text-xs rounded border transition-colors ${analysisSource === 'Excel' ? 'bg-blue-50 border-blue-200 text-blue-800 font-bold' : 'bg-white border-stone-200 text-stone-500'}`}
                             >
                                 Upload Excel
                             </button>
                        </div>

                        <div className="relative">
                            {analysisSource === 'Spreadsheet' ? (
                                <div className="space-y-2">
                                    <textarea
                                        value={feedbackInput}
                                        onChange={(e) => setFeedbackInput(e.target.value)}
                                        placeholder="설문 결과 텍스트나 스프레드시트 데이터를 여기에 붙여넣으세요..."
                                        className="w-full p-4 bg-white border border-stone-300 rounded-xl text-sm h-32 focus:outline-none focus:ring-1 focus:ring-green-500"
                                    ></textarea>
                                </div>
                            ) : (
                                <div className="h-48 border-2 border-dashed border-stone-300 rounded-xl flex flex-col items-center justify-center bg-stone-50 hover:bg-white transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-stone-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    <span className="text-sm font-bold text-stone-600">Excel 파일 업로드</span>
                                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls,.csv" className="hidden" />
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <button 
                    onClick={handleGenerate}
                    disabled={apiState.isLoading}
                    className="w-full py-4 px-6 border border-transparent rounded-lg shadow-lg text-sm font-bold uppercase tracking-widest text-white bg-stone-900 hover:bg-stone-800 focus:outline-none disabled:bg-stone-300 transition-all transform hover:-translate-y-1"
                >
                    {apiState.isLoading ? (
                         <span className="flex items-center justify-center">
                              <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              생성 중...
                          </span>
                    ) : (mode === 'Survey' ? (surveyData ? '🔄 설문지 다시 설계' : '✨ 설문지 설계 시작') : '데이터 분석 시작')}
                </button>
            </div>
        </div>

        {/* RIGHT PANEL: WORKSPACE */}
        <div className={isInputVisible ? 'lg:col-span-2' : 'lg:col-span-1'}>
            
            {/* 1. ANALYSIS OUTPUT */}
            {mode === 'Analysis' && (
                <OutputDisplay 
                    apiState={apiState} 
                    titleContext={`${programData.topic} 분석 리포트`}
                    filePrefix="결과분석"
                    isFullWidth={!isInputVisible}
                />
            )}

            {/* 2. SURVEY LOADING */}
            {mode === 'Survey' && apiState.isLoading && (
                 <div className="h-full flex flex-col items-center justify-center bg-white rounded-2xl shadow-lg min-h-[400px]">
                     <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-stone-800 mb-4"></div>
                     <p className="text-stone-500 font-medium">AI가 수업 목표를 분석하여 설문지를 설계합니다...</p>
                 </div>
            )}

            {/* 3. SURVEY BUILDER / PREVIEW */}
            {mode === 'Survey' && !apiState.isLoading && surveyData && (
                <div className="flex flex-col h-full space-y-4">
                    
                    {/* VIEW CONTROLS (Hidden in Print) */}
                    <div className="bg-white p-2 rounded-xl shadow-sm border border-stone-200 flex flex-wrap gap-2 justify-between items-center no-print sticky top-0 z-10">
                        <div className="flex space-x-2 overflow-x-auto">
                            <button 
                                onClick={() => setActiveTab('Editor')}
                                className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'Editor' ? 'bg-stone-100 text-stone-900 ring-2 ring-stone-200' : 'text-stone-400 hover:text-stone-600'}`}
                            >
                                ✏️ 편집 (Edit)
                            </button>
                            <button 
                                onClick={() => setActiveTab('Interactive')}
                                className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-colors ${activeTab === 'Interactive' ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-200' : 'text-stone-400 hover:text-stone-600'}`}
                            >
                                📋 설문조사 (Form)
                            </button>
                        </div>
                    </div>

                    {/* CONTENT AREA */}
                    <div id="survey-print-area" className={`bg-white p-6 md:p-10 rounded-2xl border shadow-sm min-h-[600px] ${activeTab === 'Interactive' ? 'border-amber-200 survey-section' : 'border-stone-200'}`}>
                        
                        {/* Survey Header */}
                        <div className="mb-8 border-b border-stone-100 pb-6">
                            <h1 className="text-3xl md:text-4xl font-bold text-stone-900 mb-4">{surveyData.title}</h1>
                            <p className="text-lg text-stone-600 leading-relaxed">{surveyData.description}</p>
                        </div>

                        {/* EDITOR TAB */}
                        {activeTab === 'Editor' && (
                            <div className="space-y-6">
                                {surveyData.questions.map((q, idx) => (
                                    <div key={idx} className="bg-stone-50 p-4 rounded-lg border border-stone-200 relative group">
                                        <div className="flex flex-col gap-3">
                                            <div className="flex justify-between gap-4">
                                                <input 
                                                    value={q.title}
                                                    onChange={(e) => {
                                                        const newData = {...surveyData};
                                                        newData.questions[idx].title = e.target.value;
                                                        setSurveyData(newData);
                                                    }}
                                                    className="flex-grow font-bold text-lg text-stone-800 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-amber-500 focus:outline-none"
                                                />
                                                <select 
                                                    value={q.type}
                                                    onChange={(e) => {
                                                        const newData = {...surveyData};
                                                        newData.questions[idx].type = e.target.value as QuestionType;
                                                        setSurveyData(newData);
                                                    }}
                                                    className="text-xs h-8 font-bold text-stone-500 bg-white border border-stone-200 rounded px-2"
                                                >
                                                    {Object.entries(QUESTION_TYPES).map(([key, label]) => (
                                                        <option key={key} value={key}>{label}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Options Editor */}
                                            {(q.type === 'MULTIPLE_CHOICE' || q.type === 'CHECKBOX' || q.type === 'DROPDOWN') && (
                                                <div className="pl-4 space-y-2">
                                                    {q.options?.map((opt, oIdx) => (
                                                        <div key={oIdx} className="flex items-center">
                                                            <span className="text-stone-400 mr-2">○</span>
                                                            <input 
                                                                value={opt}
                                                                onChange={(e) => {
                                                                    const newData = {...surveyData};
                                                                    if(newData.questions[idx].options) newData.questions[idx].options![oIdx] = e.target.value;
                                                                    setSurveyData(newData);
                                                                }}
                                                                className="flex-grow text-sm bg-transparent border-b border-transparent hover:border-stone-300 focus:border-amber-500 focus:outline-none"
                                                            />
                                                            <button 
                                                                onClick={() => {
                                                                    const newData = {...surveyData};
                                                                    newData.questions[idx].options = newData.questions[idx].options?.filter((_, i) => i !== oIdx);
                                                                    setSurveyData(newData);
                                                                }}
                                                                className="text-stone-300 hover:text-red-500 ml-2 p-1"
                                                            >×</button>
                                                        </div>
                                                    ))}
                                                    <button 
                                                        onClick={() => {
                                                            const newData = {...surveyData};
                                                            if(!newData.questions[idx].options) newData.questions[idx].options = [];
                                                            newData.questions[idx].options!.push(`옵션 ${newData.questions[idx].options!.length + 1}`);
                                                            setSurveyData(newData);
                                                        }}
                                                        className="text-xs text-amber-600 hover:underline font-bold ml-5 mt-1"
                                                    >
                                                        + 옵션 추가
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {/* Tools */}
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button 
                                                onClick={() => {
                                                    const newData = {...surveyData};
                                                    newData.questions = newData.questions.filter((_, i) => i !== idx);
                                                    setSurveyData(newData);
                                                }}
                                                className="p-1.5 bg-white rounded shadow-sm text-stone-400 hover:text-red-500"
                                                title="삭제"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                
                                <button 
                                    onClick={() => {
                                        const newData = {...surveyData};
                                        newData.questions.push({
                                            id: Date.now().toString(),
                                            title: "새로운 질문",
                                            type: 'SHORT_ANSWER',
                                            required: true,
                                            options: []
                                        });
                                        setSurveyData(newData);
                                    }}
                                    className="w-full py-3 border-2 border-dashed border-stone-300 rounded-lg text-stone-500 font-bold hover:bg-stone-50 hover:border-stone-400 transition-colors"
                                >
                                    + 질문 추가하기
                                </button>
                            </div>
                        )}

                        {/* INTERACTIVE / PRINT TAB */}
                        {activeTab === 'Interactive' && (
                            <div className="max-w-3xl mx-auto">
                                {surveyData.questions.map((q, idx) => renderInteractiveQuestion(q, idx))}
                                
                                <div className="mt-10 survey-actions flex flex-wrap justify-center gap-4 border-t border-stone-100 pt-8 no-print">
                                    <button 
                                        onClick={handleSaveDraft}
                                        className="px-6 py-3 bg-white border border-stone-300 text-stone-700 font-bold rounded-lg shadow-sm hover:bg-stone-50 transition-colors"
                                    >
                                        💾 임시저장
                                    </button>
                                    <button 
                                        onClick={handleDownloadPDF}
                                        className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg shadow-lg transition-colors"
                                    >
                                        📄 PDF 다운로드
                                    </button>
                                    <button 
                                        onClick={handlePrint}
                                        className="px-6 py-3 bg-stone-800 hover:bg-stone-900 text-white font-bold rounded-lg shadow-lg transition-colors"
                                    >
                                        🖨️ 인쇄하기
                                    </button>
                                    <button 
                                        onClick={handleResetSurvey}
                                        className="px-6 py-3 bg-stone-200 hover:bg-stone-300 text-stone-600 font-bold rounded-lg transition-colors"
                                    >
                                        🔄 초기화
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}

            {/* 4. INITIAL EMPTY STATE */}
            {mode === 'Survey' && !surveyData && !apiState.isLoading && (
                 <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-stone-200 rounded-2xl min-h-[400px] bg-stone-50/50">
                     <div className="text-6xl mb-4 grayscale opacity-50">📝</div>
                     <p className="text-xl font-bold text-stone-400">설문지를 설계해 주세요</p>
                     <p className="text-sm text-stone-400 mt-2">왼쪽 메뉴에서 '설문지 생성' 버튼을 눌러주세요.</p>
                 </div>
            )}
        </div>
       </div>
    </div>
  );
};

export default FeedbackAnalyst;
