
import type React from 'react';

export interface Persona {
  id: 'designer' | 'developer' | 'marketer' | 'evaluator';
  name: string;
  description: string;
  icon: React.ReactNode;
  systemPrompt: string;
}

export interface ApiState {
  output: string;
  isLoading: boolean;
  error: string | null;
}

// --- Material Cache for Step 2 ---
export interface MaterialCache {
  [key: string]: string; // materialId: content
}

export interface ProgramData {
  topic: string;           // 교육 주제
  targetAudience: string;  // 교육 대상
  studentCount: string;    // 학생 수 (인원)
  learningGoal: string;    // 학습 목표
  trainingType: string;    // 교육 형태 (집합, 온라인, 워크샵 등)
  duration: string;        // 교육 시간 (텍스트)
  curriculum?: string;     // 생성된 커리큘럼 내용 (AI 출력물 저장)
  
  // Generated Materials Cache (Step 2)
  materialCache?: MaterialCache;

  // New Schedule Details
  schedule?: {
    durationWeeks: number;   // 총 기간 (주)
    sessionsPerWeek: number; // 주간 수업 횟수
    hoursPerSession: number; // 1회 수업 시간
    totalSessions: number;   // 총 횟수 (계산됨)
    totalHours: number;      // 총 시간 (계산됨)
  };

  // Auto-save Metadata
  lastModified?: string;   // ISO Date String
}

// --- Survey / Google Forms Types ---
export type QuestionType = 'SHORT_ANSWER' | 'PARAGRAPH' | 'MULTIPLE_CHOICE' | 'CHECKBOX' | 'DROPDOWN' | 'LINEAR_SCALE';

export interface SurveyQuestion {
  id: string;
  title: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
}

export interface SurveySchema {
  title: string;
  description: string;
  questions: SurveyQuestion[];
}
