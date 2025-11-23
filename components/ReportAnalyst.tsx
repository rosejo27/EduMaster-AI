
import React, { useState, useEffect } from 'react';
import type { Persona, ApiState, ProgramData, MaterialCache } from '../types';
import { generateContentStream, generateContent } from '../services/geminiService';
import OutputDisplay from './OutputDisplay';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import PptxGenJS from 'pptxgenjs';
import { parse } from 'marked';

interface ReportAnalystProps {
  persona: Persona;
  programData: ProgramData;
  onUpdateProgram: (data: Partial<ProgramData>) => void;
}

const MATERIALS = [
  { id: 'lesson_plan', name: '수업 지도안 (Lesson Plan)' },
  { id: 'script', name: '강의 스크립트/대본' },
  { id: 'ppt_outline', name: '수업 PPT 구성안' },
  { id: 'worksheet', name: '학습 활동지/워크시트' },
  { id: 'quiz', name: '이해 점검 퀴즈/테스트' },
  { id: 'checklist', name: '수업 준비물 및 체크리스트' },
];

const QUIZ_COUNTS = ['5문제', '10문제', '20문제'];
const WORKSHEET_COUNTS = ['3문항 (간단)', '5문항 (기본)', '10문항 (상세)'];

const ReportAnalyst: React.FC<ReportAnalystProps> = ({ persona, programData, onUpdateProgram }) => {
  const [isInputVisible, setIsInputVisible] = useState(true);
  const [selectedMaterial, setSelectedMaterial] = useState(MATERIALS[0].id);
  
  // Global Cache (Synced from Props)
  const materialCache = programData.materialCache || {};
  
  // Options
  const [questionCount, setQuestionCount] = useState(QUIZ_COUNTS[1]); 
  const [worksheetCount, setWorksheetCount] = useState(WORKSHEET_COUNTS[1]);
  const [customCount, setCustomCount] = useState('');

  const [apiState, setApiState] = useState<ApiState>({ output: '', isLoading: false, error: null });
  const [currentTitle, setCurrentTitle] = useState('');
  
  const [batchProgress, setBatchProgress] = useState<{total: number, current: number, isGenerating: boolean} | null>(null);

  // Effect to switch content when material is selected
  useEffect(() => {
    const materialName = MATERIALS.find(m => m.id === selectedMaterial)?.name || '자료';
    const shortName = materialName.split(' (')[0];
    setCurrentTitle(`${programData.topic} - ${shortName}`);

    if (materialCache[selectedMaterial]) {
        // Load from cache
        setApiState({ output: materialCache[selectedMaterial], isLoading: false, error: null });
    } else {
        // Reset if not cached
        setApiState({ output: '', isLoading: false, error: null });
    }
  }, [selectedMaterial, programData.topic, materialCache]);

  const getCountString = (type: string) => {
      const val = type === 'quiz' ? questionCount : worksheetCount;
      if (val === '직접 입력') {
          const num = parseInt(customCount);
          if (isNaN(num) || num < 1) return '5문항'; // Fallback
          return `${num}문항`;
      }
      return val;
  };

  const handleCustomCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = parseInt(e.target.value);
      if (val > 50) val = 50; // Max 50
      if (val < 1) val = 1;
      setCustomCount(e.target.value);
  };

  const handleSubmit = async () => {
    setApiState({ output: '', isLoading: true, error: null });
    // Do not auto-hide on desktop for better UX with sticky sidebar, unless user wants to
    // Removed the auto-hide logic here to let user control it via the toggle button

    const materialName = MATERIALS.find(m => m.id === selectedMaterial)?.name || '자료';
    const shortName = materialName.split(' (')[0];

    // --- Context Construction for Volume Control ---
    let context = `Topic: ${programData.topic}, Target: ${programData.targetAudience}, Students: ${programData.studentCount}, Goal: ${programData.learningGoal}`;
    
    // Inject Detailed Schedule if available
    if (programData.schedule) {
        context += `, Duration: ${programData.schedule.durationWeeks}주, Sessions: ${programData.schedule.totalSessions}회, TotalHours: ${programData.schedule.totalHours}시간`;
    } else {
        context += `, Duration: ${programData.duration}`;
    }
    
    let extraPrompt = '';
    if (selectedMaterial === 'quiz') {
        extraPrompt = `[Question Count: ${getCountString('quiz')}]`;
    } else if (selectedMaterial === 'worksheet') {
        extraPrompt = `[Question Count: ${getCountString('worksheet')}]`;
    }

    const userInput = `[Material Type: ${materialName}], [Course Context: ${context}] ${extraPrompt}`;

    try {
      const stream = generateContentStream(persona.systemPrompt, userInput);
      
      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk;
        setApiState(prev => ({ ...prev, output: fullText, isLoading: true }));
      }
      
      // Save to Global Cache on completion for persistence
      onUpdateProgram({ 
          materialCache: { 
              ...materialCache, 
              [selectedMaterial]: fullText 
          } 
      });
      
      setApiState(prev => ({ ...prev, isLoading: false }));

    } catch (err: any) {
      console.error("Generation Error:", err);
      setApiState({ output: '', isLoading: false, error: err.message || "자료 생성 중 문제가 발생했습니다." });
    }
  };

  // Helper to delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // --- BATCH DOWNLOAD LOGIC ---
  const handleBatchDownload = async () => {
    if (!programData.topic) return;
    
    setBatchProgress({ total: MATERIALS.length, current: 0, isGenerating: true });
    const zip = new JSZip();
    const folder = zip.folder(`${programData.topic.replace(/\s+/g,'_')}_수업자료`);

    try {
        // Create a temporary cache copy so we don't mutate state inside the loop unexpectedly
        const currentCache = { ...materialCache };
        let hasNewUpdates = false;

        for (let i = 0; i < MATERIALS.length; i++) {
            const material = MATERIALS[i];
            setBatchProgress(prev => ({ ...prev!, current: i + 1 }));
            
            const materialName = material.name;
            let content = currentCache[material.id];

            if (!content) {
                const context = `Topic: ${programData.topic}, Target: ${programData.targetAudience}, Duration: ${programData.duration}`;
                let extra = '';
                if (material.id === 'quiz') extra = `[Question Count: 10문제]`; 
                if (material.id === 'worksheet') extra = `[Question Count: 5문항]`;
                
                const userInput = `[Material Type: ${materialName}], [Course Context: ${context}] ${extra}`;
                content = await generateContent(persona.systemPrompt, userInput);
                
                // Update local cache copy
                currentCache[material.id] = content;
                hasNewUpdates = true;
            }
            
            // 2. Convert to File based on Type
            const cleanTitle = `${i+1}_${material.id}_${programData.topic.substring(0, 10)}`;
            
            if (material.id === 'ppt_outline') {
                const pptx = new PptxGenJS();
                pptx.layout = 'LAYOUT_16x9';
                
                // Constants for layout (same as OutputDisplay)
                const MARGIN_X = 0.5;
                const START_Y = 1.2;
                const MAX_Y = 6.5;
                const LINE_HEIGHT = 0.5;

                // Cover Slide
                const cover = pptx.addSlide();
                cover.addText(programData.topic, { x:0.5, y:2, w:'90%', fontSize:32, bold:true, align:'center' });
                cover.addText("수업 자료 (Generated by EduMaster.AI)", { x:0.5, y:3.5, w:'90%', fontSize:18, color:'666666', align:'center' });

                const slides = content.split(/^(?=#\s*Slide|#\s*슬라이드|Slide\s+\d+)/gmi);
                
                slides.forEach(slideContent => {
                    const trimmed = slideContent.trim();
                    if (trimmed.length < 5) return;

                    const lines = trimmed.split('\n');
                    let originalTitle = lines[0].replace(/^[#]+\s*/, '').replace(/^Slide\s\d+:/i, '').replace(/^슬라이드\s\d+:/i, '').trim();
                    if (!originalTitle) originalTitle = "내용";

                    const createSlide = (titleSuffix = "") => {
                        const s = pptx.addSlide();
                        s.addText(originalTitle + titleSuffix, { x:0.5, y:0.5, w:'90%', fontSize:24, bold:true, color:'363636' });
                        return s;
                    }

                    let currentSlide = createSlide();
                    let currentY = START_Y;
                    let tableRows: any[][] = [];

                    const flushTable = () => {
                        if (tableRows.length > 0) {
                            const tableHeight = tableRows.length * 0.5;
                            
                            if (currentY + tableHeight > MAX_Y) {
                                currentSlide = createSlide(" (Continued)");
                                currentY = START_Y;
                            }

                            const formattedRows = tableRows.map(row => row.map(cell => ({ text: cell })));
                            currentSlide.addTable(formattedRows, { x:0.5, y:currentY, w:'90%', fontSize:12 });
                            currentY += tableHeight + 0.5;
                            tableRows = [];
                        }
                    };

                    lines.slice(1).forEach(line => {
                        const cleanLine = line.trim().replace(/\*\*/g, '');
                        if (!cleanLine) return;
                        
                        if (cleanLine.startsWith('|')) {
                             if(cleanLine.includes('---')) return;
                             const row = cleanLine.split('|').slice(1, -1).map(c => c.trim());
                             tableRows.push(row);
                        } else {
                             flushTable();
                             const isBullet = cleanLine.startsWith('-') || cleanLine.startsWith('*');
                             
                             if (currentY > MAX_Y) {
                                 currentSlide = createSlide(" (Continued)");
                                 currentY = START_Y;
                             }

                             currentSlide.addText(cleanLine.replace(/^[-*]\s/, ''), { 
                                 x:0.5, y:currentY, w:'90%', h:0.5, 
                                 fontSize:16, color:'555555', bullet: isBullet 
                             });
                             currentY += 0.5;
                        }
                    });
                    flushTable();
                });
                
                const pptBlob = await pptx.write({ outputType: 'blob' }) as Blob;
                folder?.file(`${cleanTitle}.pptx`, pptBlob);

            } else {
                const htmlBody = parse(content);
                const htmlContent = `
                    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'>
                    <head>
                        <meta charset='utf-8'>
                        <title>${cleanTitle}</title>
                        <style>
                            body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; line-height: 1.6; }
                            h1 { font-size: 16pt; color: #111; margin-bottom: 10px; }
                            h2 { font-size: 14pt; color: #333; margin-top: 20px; margin-bottom: 10px; background-color: #f5f5f5; padding: 5px; }
                            table { border-collapse: collapse; width: 100%; margin: 15px 0; }
                            td, th { border: 1px solid #999; padding: 8px; }
                            th { background-color: #eee; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <h1>${programData.topic} - ${materialName}</h1>
                        ${htmlBody}
                    </body>
                    </html>
                `;
                
                const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
                const ext = material.id === 'checklist' ? 'xls' : 'doc'; 
                folder?.file(`${cleanTitle}.${ext === 'xls' ? 'doc' : 'doc'}`, blob);
            }

            await delay(500);
        }

        // Update global state if we generated new things
        if (hasNewUpdates) {
            onUpdateProgram({ materialCache: currentCache });
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        saveAs(zipBlob, `${programData.topic}_수업자료_패키지.zip`);

    } catch (e) {
        console.error("Batch Error", e);
        alert("일괄 다운로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
        setBatchProgress(null);
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
        <h3 className="text-2xl font-serif text-stone-800 mb-2">Plan Required</h3>
        <p className="text-stone-500">Step 1에서 수업 설계를 먼저 완료해주세요.</p>
      </div>
    );
  }
  
  return (
    <div className="relative">
       {/* Visibility Toggle Button - Visible on ALL screens now per user request */}
       <div className="absolute -top-12 right-0 z-20">
          <button 
            onClick={() => setIsInputVisible(!isInputVisible)}
            className="flex items-center text-xs font-bold text-stone-500 bg-white px-3 py-2 rounded-lg shadow-sm border border-stone-200 hover:bg-stone-50"
          >
            {isInputVisible ? '입력 메뉴 숨기기' : '입력 메뉴 보기'}
             <svg className={`w-4 h-4 ml-2 transform transition-transform ${isInputVisible ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
       </div>

      <div className={`grid transition-all duration-500 gap-8 ${isInputVisible ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* Sticky Sidebar Container */}
        <div className={`lg:col-span-1 ${isInputVisible ? 'block' : 'hidden'}`}>
          <div className="bg-white rounded-2xl shadow-xl border border-stone-100 p-6 sticky top-24 max-h-[85vh] overflow-y-auto scrollbar-thin scrollbar-thumb-stone-300 scrollbar-track-transparent">
            <div className="mb-8 pb-6 border-b border-stone-100">
              <div className="flex items-center space-x-2 mb-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Active Project</span>
              </div>
              <h3 className="text-xl font-bold text-stone-900 leading-tight">{programData.topic}</h3>
              <p className="text-sm text-stone-500 mt-1 line-clamp-2">{programData.targetAudience} • {programData.duration}</p>
            </div>

            <h4 className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-4">Select Material</h4>
            <div className="space-y-3">
              {MATERIALS.map((mat) => {
                const isGenerated = !!materialCache[mat.id];
                const isSelected = selectedMaterial === mat.id;
                
                return (
                  <button
                    key={mat.id}
                    onClick={() => setSelectedMaterial(mat.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 border flex items-center justify-between group ${
                      isSelected
                        ? 'bg-stone-900 text-white border-stone-900 shadow-lg scale-[1.02]'
                        : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    <div className="flex items-center">
                        {isGenerated && !isSelected && (
                             <span className="mr-2 text-green-500 font-bold">✓</span>
                        )}
                        {mat.name.split(' (')[0]}
                    </div>
                    
                    {isSelected ? (
                        <span className="text-[10px] bg-stone-700 px-2 py-1 rounded text-stone-200">선택됨</span>
                    ) : isGenerated ? (
                        <span className="text-stone-400 text-xs">완료</span>
                    ) : (
                        <span className="text-stone-300 group-hover:text-stone-400 text-lg">+</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* DYNAMIC OPTIONS AREA */}
            <div className="mt-6 space-y-4 animate-fade-in">
                {/* QUIZ COUNT */}
                {selectedMaterial === 'quiz' && (
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-inner">
                        <label className="text-xs font-bold text-stone-500 block mb-3 uppercase tracking-wider">📝 퀴즈 문제 수</label>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {QUIZ_COUNTS.map(count => (
                                <button
                                    key={count}
                                    onClick={() => setQuestionCount(count)}
                                    className={`text-xs py-2 rounded border transition-all ${
                                        questionCount === count 
                                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold shadow-sm' 
                                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                    }`}
                                >
                                    {count}
                                </button>
                            ))}
                        </div>
                        <button
                             onClick={() => setQuestionCount('직접 입력')}
                             className={`text-xs py-2 px-3 w-full rounded border transition-all mb-2 ${
                                 questionCount === '직접 입력' 
                                 ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' 
                                 : 'bg-white text-stone-600 border-stone-200'
                             }`}
                        >
                            직접 입력 (Custom)
                        </button>
                        {questionCount === '직접 입력' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <input 
                                    type="number" 
                                    min="1" max="50"
                                    placeholder="문항 수 (예: 12)"
                                    value={customCount}
                                    onChange={handleCustomCountChange}
                                    className="flex-grow text-xs p-2 rounded border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                                />
                                <span className="text-xs text-stone-500">문항</span>
                            </div>
                        )}
                    </div>
                )}

                {/* WORKSHEET COUNT - UNIFIED UI */}
                {selectedMaterial === 'worksheet' && (
                    <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 shadow-inner">
                        <label className="text-xs font-bold text-stone-500 block mb-3 uppercase tracking-wider">📝 활동지 문항 수</label>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {WORKSHEET_COUNTS.map(count => (
                                <button
                                    key={count}
                                    onClick={() => setWorksheetCount(count)}
                                    className={`text-xs py-2 rounded border text-center transition-all ${
                                        worksheetCount === count 
                                        ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold shadow-sm' 
                                        : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
                                    }`}
                                >
                                    {count.split(' ')[0]}
                                </button>
                            ))}
                        </div>
                         <button
                             onClick={() => setWorksheetCount('직접 입력')}
                             className={`text-xs py-2 px-3 w-full rounded border transition-all mb-2 ${
                                 worksheetCount === '직접 입력' 
                                 ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold' 
                                 : 'bg-white text-stone-600 border-stone-200'
                             }`}
                        >
                            직접 입력 (Custom)
                        </button>
                        {worksheetCount === '직접 입력' && (
                            <div className="flex items-center gap-2 animate-fade-in">
                                <input 
                                    type="number" 
                                    min="1" max="50"
                                    placeholder="문항 수 (예: 8)"
                                    value={customCount}
                                    onChange={handleCustomCountChange}
                                    className="flex-grow text-xs p-2 rounded border border-stone-300 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white"
                                />
                                <span className="text-xs text-stone-500">문항</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <button 
              onClick={handleSubmit}
              disabled={(apiState.isLoading && !apiState.output) || (batchProgress !== null)}
              className="mt-6 w-full flex items-center justify-center px-4 py-4 border border-transparent rounded-xl shadow-lg text-sm font-bold uppercase tracking-widest text-white bg-amber-600 hover:bg-amber-700 focus:outline-none disabled:bg-stone-300 disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5"
            >
              {apiState.isLoading ? (
                  <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      생성 중...
                  </span>
              ) : (materialCache[selectedMaterial] ? '🔄 다시 생성 (Regenerate)' : '✨ 자료 생성 (Create)')}
            </button>

            <div className="border-t border-stone-200 my-6"></div>

            <button
                onClick={handleBatchDownload}
                disabled={batchProgress !== null}
                className="w-full flex items-center justify-center px-4 py-3 border border-stone-300 rounded-xl shadow-sm text-sm font-bold text-stone-700 bg-white hover:bg-stone-50 focus:outline-none disabled:bg-stone-100 disabled:text-stone-400 transition-all group"
            >
                {batchProgress ? (
                    <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-stone-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        파일 생성 중... ({batchProgress.current}/{batchProgress.total})
                    </span>
                ) : (
                    <span className="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-stone-500 group-hover:text-stone-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        전체 자료 ZIP 다운로드
                    </span>
                )}
            </button>
          </div>
        </div>

        {/* Result Area */}
        <div className={isInputVisible ? 'lg:col-span-2' : 'lg:col-span-1'}>
          <OutputDisplay 
              apiState={apiState} 
              titleContext={currentTitle || `${programData.topic} - 자료`}
              filePrefix={currentTitle ? currentTitle.split(' - ')[1] : '자료'}
              isFullWidth={!isInputVisible}
              onRefresh={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
};

export default ReportAnalyst;
