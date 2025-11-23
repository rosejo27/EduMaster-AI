
import React, { useState, useEffect } from 'react';
import { PERSONAS } from './constants';
import type { Persona, ProgramData } from './types';
import PlannerAssistant from './components/PlannerAssistant';
import ReportAnalyst from './components/ReportAnalyst';
import MarketingCopywriter from './components/MarketingCopywriter';
import FeedbackAnalyst from './components/FeedbackAnalyst';

const App: React.FC = () => {
  const [activePersona, setActivePersona] = useState<Persona>(PERSONAS[0]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showMyPageModal, setShowMyPageModal] = useState(false);
  
  // Global State for the Program being designed with LocalStorage Persistence
  const [programData, setProgramData] = useState<ProgramData>(() => {
    try {
      const saved = localStorage.getItem('eduMaster_programData');
      return saved ? JSON.parse(saved) : {
        topic: '',
        targetAudience: '',
        studentCount: '',
        learningGoal: '',
        trainingType: '',
        duration: '',
        curriculum: '',
        materialCache: {},
        lastModified: new Date().toISOString()
      };
    } catch (e) {
      return {
        topic: '',
        targetAudience: '',
        studentCount: '',
        learningGoal: '',
        trainingType: '',
        duration: '',
        curriculum: '',
        materialCache: {},
        lastModified: new Date().toISOString()
      };
    }
  });

  // Save to localStorage whenever programData changes
  useEffect(() => {
    localStorage.setItem('eduMaster_programData', JSON.stringify(programData));
  }, [programData]);

  // Update program data from Planner (Step 1) or Analyst (Step 2)
  const handleProgramDesign = (data: Partial<ProgramData>) => {
    setProgramData(prev => ({ 
        ...prev, 
        ...data,
        lastModified: new Date().toISOString() // Update timestamp on every change
    }));
  };
  
  const handleLoginClick = () => {
      setShowLoginModal(true);
  }

  const handleLoginConfirm = (provider: string) => {
      // Mock login - in a real app this would trigger Auth
      setIsLoggedIn(true);
      setShowLoginModal(false);
  }

  const handleClearData = () => {
      if(window.confirm("현재 작업 중인 내용이 모두 삭제됩니다. 계속하시겠습니까?")) {
          const resetData = {
            topic: '',
            targetAudience: '',
            studentCount: '',
            learningGoal: '',
            trainingType: '',
            duration: '',
            curriculum: '',
            materialCache: {},
            lastModified: new Date().toISOString()
          };
          setProgramData(resetData);
          setShowMyPageModal(false);
          setActivePersona(PERSONAS[0]);
          window.location.reload();
      }
  };

  const renderActivePersona = () => {
    switch (activePersona.id) {
      case 'designer':
        return (
          <PlannerAssistant 
            persona={activePersona} 
            programData={programData}
            onUpdateProgram={handleProgramDesign}
            onNext={() => setActivePersona(PERSONAS[1])}
          />
        );
      case 'developer':
        return (
          <ReportAnalyst 
            persona={activePersona} 
            programData={programData}
            onUpdateProgram={handleProgramDesign}
          />
        );
      case 'marketer':
        return (
          <MarketingCopywriter 
            persona={activePersona} 
            programData={programData}
          />
        );
      case 'evaluator':
        return <FeedbackAnalyst persona={activePersona} programData={programData} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans selection:bg-stone-800 selection:text-white">
      {/* Top Navigation / Header */}
      <header className="bg-white text-stone-900 sticky top-0 z-30 shadow-sm border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo Area */}
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.location.reload()}>
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h1 className="font-serif text-xl tracking-tight font-bold text-stone-900">EduMaster<span className="text-amber-600">.AI</span></h1>
              </div>
            </div>
            
            {/* Right Side: Login & Project Info */}
            <div className="flex items-center gap-4">
                {/* Current Project Indicator */}
                {programData.topic && (
                <div className="hidden md:flex items-center px-3 py-1 rounded-full bg-stone-100 border border-stone-200">
                    <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                    <span className="text-xs text-stone-500 mr-2 uppercase tracking-wider font-bold">Project:</span>
                    <span className="text-sm font-bold text-stone-800 truncate max-w-[150px]">{programData.topic}</span>
                </div>
                )}

                <div className="h-6 w-px bg-stone-200 hidden md:block"></div>

                {isLoggedIn ? (
                    <button 
                        onClick={() => setShowMyPageModal(true)}
                        className="flex items-center space-x-2 text-sm font-bold text-stone-700 hover:text-amber-600"
                    >
                        <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center border border-stone-300">
                            <span className="text-xs">MY</span>
                        </div>
                        <span className="hidden md:inline">My Page</span>
                    </button>
                ) : (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={handleLoginClick} 
                            className="text-xs font-bold text-stone-500 hover:text-stone-900 px-2 py-1"
                        >
                            로그인
                        </button>
                        <button 
                            onClick={handleLoginClick}
                            className="px-3 py-1.5 bg-stone-900 text-white text-xs font-bold rounded-lg hover:bg-stone-800 transition-colors"
                        >
                            무료 시작하기
                        </button>
                    </div>
                )}
            </div>
          </div>
        </div>
      </header>

      {/* Horizontal Workflow Stepper */}
      <div className="bg-white border-b border-stone-200 sticky top-16 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between overflow-x-auto no-scrollbar py-3 md:justify-center gap-2 md:gap-8">
            {PERSONAS.map((persona, idx) => {
              const isActive = activePersona.id === persona.id;
              const isPast = PERSONAS.findIndex(p => p.id === activePersona.id) > idx;
              
              return (
                <button
                  key={persona.id}
                  onClick={() => setActivePersona(persona)}
                  className={`flex items-center group whitespace-nowrap px-3 py-2 rounded-lg transition-all duration-200
                    ${isActive ? 'bg-stone-900 text-white shadow-md' : 'text-stone-500 hover:bg-stone-50'}
                  `}
                >
                  <div className={`
                    flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold mr-2 border transition-colors
                    ${isActive ? 'border-stone-700 bg-amber-500 text-stone-900' : isPast ? 'bg-stone-200 text-stone-600 border-stone-200' : 'border-stone-300 bg-white text-stone-400'}
                  `}>
                    {isPast ? '✓' : idx + 1}
                  </div>
                  <span className={`text-sm ${isActive ? 'font-bold' : 'font-medium'}`}>
                    {persona.name.split('. ')[1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Context Banner */}
        <div className="mb-6 bg-stone-900 text-white rounded-xl p-4 shadow-lg flex items-start md:items-center gap-4">
             <div className="p-2 bg-white/10 rounded-lg text-amber-400 hidden md:block">
                {activePersona.icon}
             </div>
             <div>
                <h2 className="text-lg font-bold flex items-center">
                    <span className="text-amber-400 mr-2 text-sm uppercase tracking-wider">Step {PERSONAS.findIndex(p => p.id === activePersona.id) + 1}</span>
                    {activePersona.name.split('. ')[1]}
                </h2>
                <p className="text-stone-400 text-sm mt-1">{activePersona.description}</p>
             </div>
        </div>

        {/* Main Workspace */}
        <div className="min-h-[600px]">
             {renderActivePersona()}
        </div>
        
        <footer className="text-center text-stone-400 mt-20 pb-10 text-sm pt-8">
            <p className="font-serif italic">Designed for Educators. Powered by Google Gemini.</p>
        </footer>
      </main>

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up transform transition-all">
            <div className="p-8 text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                </div>
                <h2 className="text-2xl font-bold text-stone-900 mb-2">EduMaster.AI 시작하기</h2>
                <p className="text-stone-500 mb-8">선생님을 위한 AI 수업 설계 파트너</p>

                <div className="space-y-3">
                <button onClick={() => handleLoginConfirm('Google')} className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors font-bold text-stone-700">
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    Google 계정으로 계속하기
                </button>
                
                <button onClick={() => handleLoginConfirm('Kakao')} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#FEE500] rounded-xl hover:opacity-90 transition-opacity font-bold text-[#191919]">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3C5.9 3 1 6.9 1 11.8c0 2.8 1.9 5.3 4.8 6.9-.2.8-1.1 4.1-1.2 4.4 0 .1.1.2.2.2.1 0 .1 0 .2-.1 3.6-2.4 5.3-3.6 5.8-3.9.4.1.8.1 1.2.1 6.1 0 11-3.9 11-8.8C23 6.9 18.1 3 12 3z"/>
                    </svg>
                    카카오 계정으로 계속하기
                </button>

                <button onClick={() => handleLoginConfirm('Naver')} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#03C75A] rounded-xl hover:opacity-90 transition-opacity font-bold text-white">
                    <span className="font-black text-lg">N</span>
                    네이버 계정으로 계속하기
                </button>
                </div>
            </div>
            <div className="bg-stone-50 p-4 text-center border-t border-stone-100">
                <button onClick={() => setShowLoginModal(false)} className="text-sm text-stone-500 font-bold hover:text-stone-800">
                닫기
                </button>
            </div>
            </div>
        </div>
        )}

      {/* My Page Modal */}
      {showMyPageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-fade-in-up">
                <div className="bg-stone-900 px-6 py-4 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-white flex items-center">
                        <span className="mr-2 text-2xl">📁</span> My Page
                    </h2>
                    <button onClick={() => setShowMyPageModal(false)} className="text-stone-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-8">
                    <div className="mb-6">
                         <h3 className="text-xl font-bold text-stone-800 mb-2">👋 안녕하세요, 선생님!</h3>
                         <p className="text-stone-500">현재 작업 중인 프로젝트가 자동으로 저장되고 있습니다.</p>
                    </div>

                    <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 mb-6 relative overflow-hidden group hover:border-amber-400 transition-colors cursor-pointer" onClick={() => setShowMyPageModal(false)}>
                        <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase tracking-wider">
                            Auto-Saved
                        </div>
                        <h4 className="font-bold text-lg text-stone-900 mb-2">{programData.topic || "제목 없는 프로젝트"}</h4>
                        <div className="text-sm text-stone-600 space-y-1">
                            <p><span className="font-bold text-stone-400 w-16 inline-block">대상:</span> {programData.targetAudience || "-"}</p>
                            <p><span className="font-bold text-stone-400 w-16 inline-block">기간:</span> {programData.duration || "-"}</p>
                            <p><span className="font-bold text-stone-400 w-16 inline-block">자료:</span> {Object.keys(programData.materialCache || {}).length}개 생성됨</p>
                        </div>
                        <div className="mt-4 pt-4 border-t border-stone-200 flex justify-between items-end">
                             <div className="text-xs text-stone-400">
                                 최종 수정: {programData.lastModified ? new Date(programData.lastModified).toLocaleString() : "방금 전"}
                             </div>
                             <span className="text-amber-600 font-bold text-sm group-hover:underline">이어서 작업하기 →</span>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800 mb-6 flex items-start">
                        <svg className="w-5 h-5 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        EduMaster AI는 브라우저 저장소(Local Storage)를 사용하여 작업 내용을 자동으로 백업합니다. 페이지를 닫거나 새로고침해도 작업 내용이 유지됩니다.
                    </div>

                    <div className="flex justify-end gap-3">
                         <button 
                             onClick={handleClearData}
                             className="px-4 py-2 text-stone-500 hover:text-red-600 font-bold text-sm transition-colors border border-transparent hover:bg-red-50 rounded-lg"
                         >
                             🗑️ 작업 내용 삭제 및 초기화
                         </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;
