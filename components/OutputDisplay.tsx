
import React, { useState, useEffect } from 'react';
import type { ApiState } from '../types';
import { parse } from 'marked';
import PptxGenJS from 'pptxgenjs';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface OutputDisplayProps {
  apiState: ApiState;
  titleContext?: string;
  filePrefix?: string;
  isFullWidth?: boolean;
  onRefresh?: () => void;
}

const LoadingSpinner: React.FC = () => (
  <div className="flex flex-col justify-center items-center h-full py-20">
    <div className="relative">
        <div className="w-16 h-16 border-4 border-stone-200 border-t-stone-800 rounded-full animate-spin"></div>
        <div className="absolute top-0 left-0 w-16 h-16 border-4 border-transparent border-b-amber-500 rounded-full animate-spin-reverse"></div>
    </div>
    <p className="text-stone-500 text-sm mt-6 font-medium tracking-wide animate-pulse uppercase">AI가 내용을 생성하고 있습니다...</p>
  </div>
);

const OutputDisplay: React.FC<OutputDisplayProps> = ({ 
  apiState, 
  titleContext, 
  filePrefix = "Result", 
  isFullWidth = false,
  onRefresh 
}) => {
  const { output, isLoading, error } = apiState;
  const [localOutput, setLocalOutput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Sync local state
  useEffect(() => {
    if (output && !isEditing) {
      setLocalOutput(output);
    }
  }, [output]);

  const getFileName = (ext: string) => {
    const cleanTitle = titleContext ? titleContext.replace(/[^a-zA-Z0-9가-힣\s]/g, '').trim() : '문서';
    return `${filePrefix}_${cleanTitle}.${ext}`;
  };

  const renderMarkdown = (text: string) => {
    // Answer Toggle Logic
    const answerHeaderRegex = /##\s*(정답|해설|Answers|Answer Key).*/i;
    const match = text.match(answerHeaderRegex);

    if (match && match.index !== undefined) {
        const mainContent = text.substring(0, match.index);
        const answerContent = text.substring(match.index);

        const mainHtml = parse(mainContent);
        const headerLineEnd = answerContent.indexOf('\n');
        const headerText = headerLineEnd > -1 ? answerContent.substring(0, headerLineEnd).replace(/#/g, '').trim() : "정답 및 해설";
        const bodyText = headerLineEnd > -1 ? answerContent.substring(headerLineEnd) : "";
        const answerHtml = parse(bodyText);

        return (
            <>
                <div dangerouslySetInnerHTML={{ __html: mainHtml as string }} />
                <details className="mt-8 border border-stone-200 rounded-lg overflow-hidden group">
                    <summary className="bg-stone-50 p-4 font-bold text-stone-700 cursor-pointer hover:bg-stone-100 list-none flex items-center justify-between select-none">
                        <span>💡 {headerText} (클릭하여 확인)</span>
                        <span className="transform group-open:rotate-180 transition-transform">▼</span>
                    </summary>
                    <div className="p-6 bg-white border-t border-stone-100 prose prose-stone max-w-none">
                        <div dangerouslySetInnerHTML={{ __html: answerHtml as string }} />
                    </div>
                </details>
            </>
        );
    }
    return <div dangerouslySetInnerHTML={{ __html: parse(text) as string }} />;
  };

  // --- Action Functions ---

  const handleCopyMarkdown = () => {
    if (!localOutput) return;
    navigator.clipboard.writeText(localOutput).then(() => {
      setCopyFeedback("클립보드에 복사되었습니다!");
      setTimeout(() => setCopyFeedback(null), 2000);
    });
  };

  // 1. DOC Export (Formatted via HTML)
  const handleExportWord = () => {
    if (!localOutput) return;
    const htmlBody = parse(localOutput);
    
    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${titleContext || 'Export'}</title>
        <style>
          body { font-family: 'Malgun Gothic', sans-serif; font-size: 11pt; line-height: 1.6; }
          table { border-collapse: collapse; width: 100%; margin: 20px 0; }
          td, th { border: 1px solid #000; padding: 8px; text-align: left; vertical-align: top; }
          th { background-color: #f0f0f0; font-weight: bold; }
          h1 { font-size: 18pt; font-weight: bold; color: #000; margin-bottom: 15px; }
          h2 { font-size: 14pt; font-weight: bold; color: #333; margin-top: 20px; background: #f9f9f9; padding: 5px; }
          ul, ol { margin-left: 20px; }
        </style>
      </head>
      <body>
        <h1>${titleContext || 'EduMaster AI Result'}</h1>
        ${htmlBody}
      </body>
      </html>
    `;
    const blob = new Blob(['\ufeff', htmlContent], {
        type: 'application/msword'
    });
    saveAs(blob, getFileName('doc'));
  };

  // 2. Excel Export (Parsing Tables)
  const handleExportExcel = () => {
    if (!localOutput) return;
    
    const wb = XLSX.utils.book_new();
    let wsData: any[][] = [];

    wsData.push([titleContext || "EduMaster Result"]);
    wsData.push([]); 

    const lines = localOutput.split('\n');
    let inTable = false;
    let tableRows: any[][] = [];

    lines.forEach(line => {
        const trimmed = line.trim();
        // Detect Markdown Table
        if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
            inTable = true;
            if (trimmed.includes('---')) return; // Skip separator
            const cells = trimmed.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*/g, ''));
            tableRows.push(cells);
        } else {
            if (inTable) {
                wsData = wsData.concat(tableRows);
                wsData.push([]);
                tableRows = [];
                inTable = false;
            }
            if (trimmed !== '') {
                const cleanText = trimmed.replace(/^[#]+\s/, '').replace(/\*\*/g, '');
                wsData.push([cleanText]);
            }
        }
    });
    if (tableRows.length > 0) wsData = wsData.concat(tableRows);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Auto-width
    const colWidths: { wch: number }[] = [];
    wsData.forEach(row => {
        row.forEach((cell, i) => {
            const len = cell ? String(cell).length : 0;
            const w = Math.min(50, Math.max(10, len * 1.5));
            if (!colWidths[i] || colWidths[i].wch < w) {
                colWidths[i] = { wch: w };
            }
        });
    });
    ws['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Result");
    XLSX.writeFile(wb, getFileName('xlsx'));
  };

  // 3. PPT Export (Robust Splitting with Auto-Pagination)
  const handleExportPPT = () => {
    if (!localOutput) return;
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    
    // Constants for layout
    const MARGIN_X = 0.5;
    const START_Y = 1.2;
    const MAX_Y = 6.5; // Max height before new slide
    const LINE_HEIGHT = 0.5;
    
    // Title Slide
    const titleSlide = pptx.addSlide();
    titleSlide.addText(titleContext || "EduMaster AI Result", { 
        x: 0.5, y: 2, w: '90%', 
        fontSize: 32, bold: true, color: '363636', align: 'center', fontFace: 'Malgun Gothic' 
    });
    
    // Content Parsing
    // We look for "# Slide X" or "Slide X" headers
    const slidesContent = localOutput.split(/^(?=#\s*Slide|#\s*슬라이드|Slide\s+\d+)/gmi);
    
    slidesContent.forEach((contentBlock) => {
        const trimmed = contentBlock.trim();
        if(trimmed.length < 5) return; // Skip empty splits
        
        const lines = trimmed.split('\n');
        
        // Determine Title
        let originalTitle = lines[0].replace(/^[#]+\s*/, '').replace(/^Slide\s\d+:/i, '').replace(/^슬라이드\s\d+:/i, '').trim();
        if (!originalTitle) originalTitle = "내용";
        
        // Helper to create a new slide
        const createSlide = (titleSuffix = "") => {
            const s = pptx.addSlide();
            s.addText(originalTitle + titleSuffix, {
                x: MARGIN_X, y: 0.3, w: '90%', h: 0.8,
                fontSize: 24, bold: true, color: '363636', fontFace: 'Malgun Gothic'
            });
            return s;
        };

        let currentSlide = createSlide();
        let currentY = START_Y;

        // Parse Body
        let inTable = false;
        let tableRows: string[][] = [];

        const flushTable = () => {
            if(tableRows.length > 0) {
                const tableHeight = tableRows.length * 0.5; // Approx height per row
                
                // Check if table fits
                if (currentY + tableHeight > MAX_Y) {
                    currentSlide = createSlide(" (Continued)");
                    currentY = START_Y;
                }

                // Fix for pptxgenjs type error: map string[][] to object structure
                const formattedRows = tableRows.map(row => row.map(cell => ({ text: cell })));
                
                currentSlide.addTable(formattedRows, {
                    x: MARGIN_X, y: currentY, w: '90%',
                    colW: Array(tableRows[0].length).fill(9.0 / tableRows[0].length),
                    border: { type: 'solid', color: 'C7C7C7', pt: 1 },
                    fontSize: 12, fontFace: 'Malgun Gothic'
                });
                currentY += tableHeight + 0.5;
                tableRows = [];
            }
        }

        lines.slice(1).forEach(line => {
             const l = line.trim();
             if (!l) return;

             // Table Detection
             if (l.startsWith('|') && l.endsWith('|')) {
                 if (l.includes('---')) return;
                 const row = l.split('|').slice(1, -1).map(c => c.trim().replace(/\*\*/g, ''));
                 tableRows.push(row);
                 inTable = true;
             } else {
                 if(inTable) { inTable = false; flushTable(); }
                 
                 // Text / Bullet
                 const isBullet = l.startsWith('-') || l.startsWith('*') || /^\d+\./.test(l);
                 
                 // Check for overflow
                 if (currentY > MAX_Y) {
                     currentSlide = createSlide(" (Continued)");
                     currentY = START_Y;
                 }

                 currentSlide.addText(l.replace(/^[-*]\s/, '').replace(/^\d+\.\s/, '').replace(/\*\*/g, ''), {
                    x: MARGIN_X, y: currentY, w: '90%', h: LINE_HEIGHT,
                    fontSize: 16, color: '555555',
                    bullet: isBullet,
                    fontFace: 'Malgun Gothic',
                    valign: 'top'
                 });
                 currentY += LINE_HEIGHT;
             }
        });
        flushTable();
    });

    pptx.writeFile({ fileName: getFileName('pptx') });
  };

  return (
    <div className="relative group h-full transition-all duration-500 ease-in-out flex flex-col">
      <div className="absolute inset-0 bg-stone-200 rounded-2xl transform translate-x-2 translate-y-2 transition-transform group-hover:translate-x-3 group-hover:translate-y-3"></div>
      
      <div className="relative bg-white rounded-2xl shadow-xl border border-stone-100 overflow-hidden flex flex-col h-full min-h-[700px]">
        <div className="bg-white border-b border-stone-100 px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between sticky top-0 z-10 backdrop-blur-md bg-white/95 gap-2 shrink-0">
          <div className="flex items-center gap-3">
              <h3 className="text-lg font-bold font-sans text-stone-900 flex items-center">
                <span className="bg-stone-900 text-white p-1.5 rounded mr-2 shadow-md">📝</span>
                Result
              </h3>

              {localOutput && (
                  <button 
                    onClick={() => setIsEditing(!isEditing)} 
                    className={`flex items-center px-3 py-1 text-xs font-bold rounded-lg border transition-colors ${isEditing ? 'bg-amber-100 text-amber-700 border-amber-300' : 'bg-white text-stone-500 border-stone-200 hover:bg-stone-50'}`}
                  >
                      {isEditing ? '완료' : '편집'}
                  </button>
              )}

              {onRefresh && !isLoading && (
                  <button 
                    onClick={onRefresh}
                    title="다시 생성 (Refresh)"
                    className="flex items-center px-2 py-1 text-stone-500 hover:text-amber-600 hover:bg-stone-100 rounded-lg transition-colors"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                  </button>
              )}
          </div>
          
          {localOutput && (
              <div className="flex items-center space-x-1">
                <button onClick={handleCopyMarkdown} title="클립보드 복사" className="px-3 py-1.5 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors mr-2">
                    <span className="text-xs font-bold">내용 복사</span>
                </button>

                <button onClick={handleExportWord} title="Word 다운로드" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                   <span className="text-[10px] font-bold border border-blue-200 bg-blue-50 px-1 rounded">DOC</span>
                </button>
                <button onClick={handleExportExcel} title="Excel 다운로드" className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                   <span className="text-[10px] font-bold border border-green-200 bg-green-50 px-1 rounded">XLS</span>
                </button>
                <button onClick={handleExportPPT} title="PPT 다운로드" className="p-1.5 text-orange-600 hover:bg-orange-50 rounded">
                   <span className="text-[10px] font-bold border border-orange-200 bg-orange-50 px-1 rounded">PPT</span>
                </button>
              </div>
          )}
        </div>
        
        {copyFeedback && (
            <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white text-xs py-1.5 px-4 rounded-full shadow-lg z-50 animate-fade-in-up">
                {copyFeedback}
            </div>
        )}

        <div className="flex-grow relative flex flex-col h-full overflow-hidden">
          {isLoading && !output ? (
            <div className="absolute inset-0 overflow-y-auto">
                <LoadingSpinner />
            </div>
          ) : error ? (
            <div className="p-6 md:p-10 overflow-y-auto h-full">
                <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-r-lg">
                <div className="flex">
                    <div className="flex-shrink-0"><svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg></div>
                    <div className="ml-3">
                    <h3 className="text-sm leading-5 font-medium text-red-800">생성 실패</h3>
                    <p className="mt-2 text-sm text-red-700">{error}</p>
                    {onRefresh && (
                        <button onClick={onRefresh} className="mt-3 text-sm font-bold text-red-800 hover:underline">
                            다시 시도하기 &rarr;
                        </button>
                    )}
                    </div>
                </div>
                </div>
            </div>
          ) : localOutput ? (
            <div className="animate-fade-in h-full flex flex-col">
                 {isEditing ? (
                     <div className="flex-grow flex flex-col h-full">
                         <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between shrink-0">
                             <span className="text-xs font-bold text-amber-800">EDITOR MODE (Markdown)</span>
                             <span className="text-xs text-amber-600">전체 화면 편집 모드</span>
                         </div>
                         <textarea 
                             value={localOutput}
                             onChange={(e) => setLocalOutput(e.target.value)}
                             className="w-full flex-grow p-6 font-mono text-sm bg-stone-50 focus:outline-none focus:bg-white transition-colors resize-none leading-relaxed"
                             placeholder="Type here..."
                         />
                     </div>
                 ) : (
                    <div className="p-6 md:p-10 overflow-y-auto h-full bg-white">
                        {titleContext && (
                            <div className="mb-8 pb-6 border-b-2 border-stone-100">
                                <h1 className="text-3xl lg:text-4xl font-bold text-stone-900 font-sans mb-2">{titleContext}</h1>
                                <p className="text-lg text-stone-500 font-medium">EduMaster AI Report</p>
                            </div>
                        )}
                        
                        <div className="prose prose-lg prose-stone max-w-none font-sans">
                            {renderMarkdown(localOutput)}
                        </div>
                    </div>
                 )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-stone-300 border-2 border-dashed border-stone-200 rounded-xl m-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mb-4 text-stone-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="font-serif text-xl text-stone-400">Ready to Create</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OutputDisplay;
