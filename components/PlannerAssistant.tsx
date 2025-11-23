
import React, { useState, useEffect } from 'react';
import type { Persona, ApiState, ProgramData } from '../types';
import { generateContentStream } from '../services/geminiService';
import OutputDisplay from './OutputDisplay';

interface PlannerAssistantProps {
  persona: Persona;
  programData: ProgramData;
  onUpdateProgram: (data: Partial<ProgramData>) => void;
  onNext: () => void;
}

const OPTIONS = {
  target: [
    '유아/유치원생', '초등학교 저학년', '초등학교 고학년', '중학생', '고등학생 (수험생)', 
    '대학생', '성인/직장인', '학부모', '노인/실버', '기타'
  ],
  type: [
    '정규 수업 (교과/학기)', '방과후 학교/동아리', '원데이 클래스/특강', '온라인 화상 수업', 
    '블렌디드 러닝', '자기주도 학습 코칭', '캠프/수련회', '기타'
  ],
  // Simplified duration options for basic selection, detailed input is separate
  duration: [
    '1회성 특강', '4주 과정 (단기)', '8주 과정 (표준)', '12주 과정 (장기)', '1학기 (6개월)', '기타'
  ]
};

const PlannerAssistant: React.FC<PlannerAssistantProps> = ({ persona, programData, onUpdateProgram, onNext }) => {
  const [isInputVisible, setIsInputVisible] = useState(true);
  
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  
  // Basic Inputs
  const [inputs, setInputs] = useState({
    topic: '', targetCustom: '', studentCount: '', learningGoal: '',
    trainingType: OPTIONS.type[0], typeCustom: '',
    durationText: OPTIONS.duration[0], durationCustom: ''
  });

  // Detailed Schedule Inputs
  const [schedule, setSchedule] = useState({
    durationWeeks: 1,
    sessionsPerWeek: 1,
    hoursPerSession: 1.0
  });

  const [apiState, setApiState] = useState<ApiState>({ output: '', isLoading: false, error: null });

  // Load existing data
  useEffect(() => {
    if (programData.topic) {
      setInputs(prev => ({
        ...prev,
        topic: programData.topic,
        learningGoal: programData.learningGoal || '',
        studentCount: programData.studentCount || '',
        durationText: programData.duration || OPTIONS.duration[0]
      }));
    }
    if (programData.schedule) {
        setSchedule({
            durationWeeks: programData.schedule.durationWeeks,
            sessionsPerWeek: programData.schedule.sessionsPerWeek,
            hoursPerSession: programData.schedule.hoursPerSession
        });
    }
    if (programData.targetAudience) {
       const splits = programData.targetAudience.split(', ').filter(t => t);
       setSelectedTargets(splits);
    } else if (selectedTargets.length === 0) {
        setSelectedTargets([OPTIONS.target[1]]);
    }
  }, [programData.topic]); 

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      setSchedule(prev => ({ ...prev, [name]: parseFloat(value) || 0 }));
  };

  const toggleTarget = (target: string) => {
    if (target === '기타') {
        if (selectedTargets.includes('기타')) setSelectedTargets(prev => prev.filter(t => t !== '기타'));
        else setSelectedTargets(prev => [...prev, '기타']);
        return;
    }
    if (selectedTargets.includes(target)) setSelectedTargets(prev => prev.filter(t => t !== target));
    else setSelectedTargets(prev => [...prev, target]);
  };

  const getFinalValue = (selectValue: string, customValue: string) => {
    return selectValue === '기타' ? customValue : selectValue;
  };

  // Calculations
  const totalSessions = schedule.durationWeeks * schedule.sessionsPerWeek;
  const totalHours = totalSessions * schedule.hoursPerSession;
  const intensity = schedule.sessionsPerWeek * schedule.hoursPerSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiState({ output: '', isLoading: true, error: null });
    if (window.innerWidth < 1024) setIsInputVisible(false);

    let targetString = selectedTargets.filter(t => t !== '기타').join(', ');
    if (selectedTargets.includes('기타') && inputs.targetCustom) {
        targetString += (targetString ? ', ' : '') + inputs.targetCustom;
    }
    if (!targetString) targetString = "미정";

    const type = getFinalValue(inputs.trainingType, inputs.typeCustom);
    const durationText = getFinalValue(inputs.durationText, inputs.durationCustom);

    // Construct full schedule string for context
    const scheduleContext = `총 기간: ${schedule.durationWeeks}주, 주 ${schedule.sessionsPerWeek}회, 1회 ${schedule.hoursPerSession}시간 (총 ${totalSessions}회, ${totalHours}시간)`;

    onUpdateProgram({
      topic: inputs.topic,
      targetAudience: targetString,
      studentCount: inputs.studentCount,
      learningGoal: inputs.learningGoal,
      trainingType: type,
      duration: durationText, // Keep legacy text field just in case
      schedule: {
          ...schedule,
          totalSessions,
          totalHours
      }
    });

    const userInput = `[Topic: ${inputs.topic}], [Target: ${targetString}], [Students: ${inputs.studentCount || '미정'}], [Goal: ${inputs.learningGoal}], [Duration: ${durationText}], [Format: ${type}], [Detailed Schedule: ${scheduleContext}]`;

    try {
      const stream = generateContentStream(persona.systemPrompt, userInput);
      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk;
        setApiState(prev => ({ ...prev, output: fullText, isLoading: true }));
      }
      setApiState(prev => ({ ...prev, isLoading: false }));
      onUpdateProgram({ curriculum: fullText });

    } catch (err: any) {
      setApiState({ output: '', isLoading: false, error: err.message });
    }
  };

  const inputClass = "w-full bg-white border border-stone-300 rounded-md px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800 transition-colors shadow-sm font-sans text-sm";
  const selectClass = "w-full bg-white border border-stone-300 rounded-md px-4 py-3 text-stone-800 focus:outline-none focus:border-stone-800 focus:ring-1 focus:ring-stone-800 transition-colors shadow-sm font-sans text-sm truncate pr-8";
  const labelClass = "block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2";

  return (
    <div className="relative">
       {/* Collapsible Toggle Button */}
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
        
        {/* Input Section */}
        <div className={`lg:col-span-1 space-y-6 ${isInputVisible ? 'block' : 'hidden'}`}>
          <div className="bg-white p-6 rounded-2xl shadow-xl border border-stone-100">
            <h3 className="font-serif text-xl text-stone-800 mb-6 border-b border-stone-100 pb-4 flex items-center justify-between">
                Step 1. 교육 설계
            </h3>
            <form onSubmit={handleSubmit} className="space-y-6">

              <div>
                <label className={labelClass}>Target (대상) <span className="text-red-500 text-[10px]">(필수)</span></label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {OPTIONS.target.map(opt => (
                      <button
                          key={opt}
                          type="button"
                          onClick={() => toggleTarget(opt)}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                              selectedTargets.includes(opt) 
                              ? 'bg-stone-800 text-white border-stone-800 shadow-md' 
                              : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                          }`}
                      >
                          {opt}
                      </button>
                  ))}
                </div>
                {selectedTargets.includes('기타') && (
                  <input type="text" name="targetCustom" value={inputs.targetCustom} onChange={handleInputChange} placeholder="직접 입력" className={`mt-2 ${inputClass}`} />
                )}
              </div>
              
              <div>
                <label className={labelClass}>Topic (주제) <span className="text-red-500 text-[10px]">(필수)</span></label>
                <input 
                  type="text" name="topic" value={inputs.topic} onChange={handleInputChange} 
                  placeholder="예: 초등 영어 회화" className={inputClass} required
                />
              </div>

              <div>
                <label className={labelClass}>Goal (학습 목표)</label>
                <textarea 
                  name="learningGoal" value={inputs.learningGoal} onChange={handleInputChange} 
                  placeholder="학습자가 얻게 될 결과" rows={2} className={inputClass}
                ></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelClass}>Student Count (인원)</label>
                    <input 
                    type="text" name="studentCount" value={inputs.studentCount} onChange={handleInputChange} 
                    placeholder="예: 20명" className={inputClass}
                    />
                </div>
                <div>
                    <label className={labelClass}>Type (방식)</label>
                    <select name="trainingType" value={inputs.trainingType} onChange={handleInputChange} className={selectClass}>
                        {OPTIONS.type.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                    {inputs.trainingType === '기타' && <input type="text" name="typeCustom" value={inputs.typeCustom} onChange={handleInputChange} placeholder="직접 입력" className={`mt-2 ${inputClass}`} />}
                </div>
              </div>

              {/* --- DETAILED SCHEDULE SECTION --- */}
              <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-4">
                  <h4 className="text-sm font-bold text-stone-700 flex items-center">
                      📅 수업 기간 및 일정 상세
                  </h4>
                  
                  {/* Duration & Frequency */}
                  <div className="grid grid-cols-2 gap-4">
                      <div>
                          <label className="text-[10px] text-stone-500 font-bold uppercase mb-1">수업 기간 (주)</label>
                          <div className="flex items-center">
                            <input 
                                type="number" name="durationWeeks" min="1" max="52" 
                                value={schedule.durationWeeks} onChange={handleScheduleChange} 
                                className={inputClass}
                            />
                            <span className="ml-2 text-xs text-stone-500 font-bold">주</span>
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] text-stone-500 font-bold uppercase mb-1">주간 횟수</label>
                          <select name="sessionsPerWeek" value={schedule.sessionsPerWeek} onChange={handleScheduleChange} className={selectClass}>
                              {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>주 {n}회</option>)}
                          </select>
                      </div>
                  </div>

                  {/* Session Time */}
                  <div>
                      <label className="text-[10px] text-stone-500 font-bold uppercase mb-1">1회 수업 시간</label>
                      <select name="hoursPerSession" value={schedule.hoursPerSession} onChange={handleScheduleChange} className={selectClass}>
                          <option value={0.5}>30분 (0.5시간)</option>
                          <option value={1}>1시간</option>
                          <option value={1.5}>1시간 30분 (1.5시간)</option>
                          <option value={2}>2시간</option>
                          <option value={2.5}>2시간 30분 (2.5시간)</option>
                          <option value={3}>3시간</option>
                          <option value={4}>4시간 (반일)</option>
                          <option value={8}>8시간 (전일)</option>
                      </select>
                  </div>

                  {/* Auto Calculation Result */}
                  <div className="bg-white p-3 rounded-lg border border-stone-200 text-xs text-stone-600 space-y-1">
                      <div className="flex justify-between">
                          <span>총 수업 횟수:</span>
                          <span className="font-bold text-stone-800">{totalSessions}회</span>
                      </div>
                      <div className="flex justify-between">
                          <span>총 수업 시간:</span>
                          <span className="font-bold text-stone-800">{totalHours}시간</span>
                      </div>
                      <div className="flex justify-between border-t border-stone-100 pt-1 mt-1">
                          <span>주당 강도:</span>
                          <span className={`font-bold ${intensity > 5 ? 'text-red-500' : 'text-blue-500'}`}>
                              주 {intensity}시간 ({intensity > 5 ? '고강도' : intensity < 2 ? '저강도' : '표준'})
                          </span>
                      </div>
                  </div>
              </div>

              <button type="submit" disabled={apiState.isLoading && !apiState.output} className="w-full py-4 px-6 border border-transparent rounded-lg shadow-lg text-sm font-bold uppercase tracking-widest text-white bg-stone-900 hover:bg-stone-800 focus:outline-none disabled:bg-stone-400 transition-all transform hover:-translate-y-1">
                {apiState.isLoading ? '설계 중...' : '설계 시작 (Generate)'}
              </button>
            </form>
          </div>
        </div>

        {/* Output Section */}
        <div className={isInputVisible ? 'lg:col-span-2' : 'lg:col-span-1'}>
          <OutputDisplay 
              apiState={apiState} 
              titleContext={inputs.topic} 
              filePrefix="교육설계"
              isFullWidth={!isInputVisible}
          />
          
          {apiState.output && !apiState.isLoading && (
            <div className="mt-8 flex justify-end animate-fade-in-up">
              <button 
                onClick={onNext}
                className="group flex items-center px-8 py-4 border border-stone-900 bg-white text-stone-900 text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-stone-900 hover:text-white transition-all duration-300 shadow-lg"
              >
                수업 자료 제작으로 이동
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlannerAssistant;
