'use client';

import React, { useState, useRef, useMemo, useEffect } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { parseExcelWorkbook } from '../utils/excelParser';
import { generateProcessList, GeneratedProcessItem, DICTIONARIES } from '../utils/matcher';
import { checkCooccurrence, CooccurrenceAlert } from '../utils/cooccurrenceEngine';
import { validateOrderConstraints, OrderWarning } from '../utils/orderConstraintEngine';
import { buildFeedbackDetails } from '../utils/feedback';
import { 
  FileUp, 
  ClipboardCopy, 
  Download, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  ArrowRight, 
  Layers, 
  ChevronDown, 
  ChevronRight, 
  Info,
  Layers2,
  ListFilter,
  Sparkles
} from 'lucide-react';

type ConfidenceKey = 'standard' | 'conditional' | 'to_confirm' | 'low';


export default function Home() {
  const [parsedRooms, setParsedRooms] = useState<any[]>([]);
  const [processList, setProcessList] = useState<GeneratedProcessItem[]>([]);
  const [excludedIndices, setExcludedIndices] = useState<Set<string>>(new Set());
  const [manualText, setManualText] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'results'>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [customDictionaries, setCustomDictionaries] = useState<Record<string, any>>({});

  useEffect(() => {
    // Force trailing slash redirect to prevent client-side Next.js routing mismatch
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname === '/tools/construct-quotation') {
        window.location.replace('/tools/construct-quotation/');
        return;
      }
    }

    async function loadDictionaries() {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
        const res = await fetch(`${apiBase}/get-dictionaries`);
        let baseDicts = {};
        if (res.ok) {
          const data = await res.json();
          if (data.dictionaries) {
            baseDicts = data.dictionaries;
          }
        }
        
        // localStorage からカスタム辞書をロードしてマージ
        try {
          const localSaved = localStorage.getItem('custom_dictionaries');
          if (localSaved) {
            const parsedLocal = JSON.parse(localSaved);
            baseDicts = { ...baseDicts, ...parsedLocal };
          }
        } catch (storageErr) {
          console.error('Failed to load local dictionaries:', storageErr);
        }
        
        setCustomDictionaries(baseDicts);
      } catch (err) {
        console.warn('Failed to load custom dictionaries:', err);
      }
    }
    loadDictionaries();
  }, []);

  
  // Accordion Open/Close states (Exception Queue Principle: standard is collapsed by default, others are expanded)
  const [accordions, setAccordions] = useState<Record<ConfidenceKey, boolean>>({
    standard: false,     // Collapse standard items by default (low risk)
    conditional: true,   // Expand conditional items (needs validation)
    to_confirm: true,    // Expand items needing confirmation (high risk of omission/conflict)
    low: true            // Expand low confidence items (highly speculatives)
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse Excel/CSV file
  const handleFile = async (file: File) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const rooms = parseExcelWorkbook(arrayBuffer);
      if (rooms.length === 0) {
        alert("有効な部屋のデータが見つかりませんでした。列名「室名」「床」「壁」「天井」などが含まれているかご確認ください。");
        return;
      }
      setParsedRooms(rooms);
      const generated = generateProcessList(rooms, customDictionaries);
      setProcessList(generated);
      setExcludedIndices(new Set());
      setActiveTab('results');

      // Async process filtering if remarks exist
      const combinedRemarks = rooms.map(r => r.remarks).filter(Boolean).join('\n');
      if (combinedRemarks.trim()) {
        await applyLLMFilter(generated, combinedRemarks);
      }
    } catch (e) {
      console.error(e);
      alert("ファイルの解析に失敗しました。ファイル形式と内容を確認してください。");
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Parse manual copied text (CSV or TSV with support for headerless inputs)
  const handleManualParse = async () => {
    if (!manualText.trim()) return;
    
    const lines = manualText.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // Detect if first line is a header (contains common terms)
    let startIdx = 0;
    const firstLineCells = lines[0].split(/\t|,/);
    const hasHeader = firstLineCells.some(cell => 
      cell.includes('室') || cell.includes('床') || cell.includes('壁') || cell.includes('天井')
    );
    if (hasHeader) {
      startIdx = 1;
    }

    const mockRooms = lines.slice(startIdx).map((line, idx) => {
      const cells = line.split(/\t|,/);
      return {
        roomName: cells[0] || `部屋_${idx + 1}`,
        floor: cells[1] || '',
        baseboard: cells[2] || '',
        wall: cells[3] || '',
        ceiling: cells[4] || '',
        remarks: cells[5] || ''
      };
    });

    setParsedRooms(mockRooms);
    const generated = generateProcessList(mockRooms, customDictionaries);
    setProcessList(generated);
    setExcludedIndices(new Set());
    setActiveTab('results');

    // Async process filtering if remarks exist
    const combinedRemarks = mockRooms.map(r => r.remarks).filter(Boolean).join('\n');
    if (combinedRemarks.trim()) {
      await applyLLMFilter(generated, combinedRemarks);
    }
  };

  // Parse free text description using OpenAI API via Next.js API Routes
  const handleLLMParse = async () => {
    if (!manualText.trim()) return;
    setIsLoading(true);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
      const response = await fetch(`${apiBase}/parse-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: manualText }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API error (${response.status})`);
      }

      const data = await response.json();
      const rooms = data.rooms;

      if (!rooms || rooms.length === 0) {
        alert("テキストから仕上げ仕様が抽出できませんでした。もう少し詳細に部屋の仕上げについて記述してください。");
        return;
      }

      setParsedRooms(rooms);
      const generated = generateProcessList(rooms, customDictionaries);
      setProcessList(generated);
      setExcludedIndices(new Set());
      setActiveTab('results');

      // Async process filtering with prompt context
      await applyLLMFilter(generated, manualText);
    } catch (e: any) {
      console.error(e);
      alert(`AIによる解析処理中にエラーが発生しました: ${e.message || e}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Call process filter API to find unnecessary items and get reasons
  const applyLLMFilter = async (generatedSteps: GeneratedProcessItem[], contextText: string) => {
    if (!contextText.trim() || generatedSteps.length === 0) return;
    setIsLoading(true);
    
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
      const response = await fetch(`${apiBase}/filter-processes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ processList: generatedSteps, contextText }),
      });

      if (!response.ok) {
        console.warn(`[Filter API] failed to fetch decisions: ${response.statusText}`);
        return;
      }

      const data = await response.json();
      const decisions = data.decisions as Array<{ stepId: string, shouldExclude: boolean, reason: string }>;

      if (decisions && decisions.length > 0) {
        const decisionMap = new Map(decisions.map(d => [d.stepId, d]));
        const newExcluded = new Set<string>();

        const updatedSteps = generatedSteps.map(step => {
          const id = `${step.roomName}-${step.location}-${step.finishTriggerId}-${step.step}`;
          const dec = decisionMap.get(id);
          
          if (dec && dec.shouldExclude) {
            newExcluded.add(id);
            return {
              ...step,
              excludeReason: dec.reason,
              confidence: 'low' as const // Downgrade confidence for excluded items
            };
          }
          return step;
        });

        setProcessList(updatedSteps);
        setExcludedIndices(newExcluded);
      }
    } catch (err) {
      console.error('[applyLLMFilter] error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle item in the checklist
  const toggleItem = (key: string) => {
    const next = new Set(excludedIndices);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExcludedIndices(next);
  };

  // Toggle Accordion Panel
  const toggleAccordion = (key: ConfidenceKey) => {
    setAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Group processes dynamically by confidence
  const groupedProcesses = useMemo(() => {
    const groups: Record<ConfidenceKey, GeneratedProcessItem[]> = {
      standard: [],
      conditional: [],
      to_confirm: [],
      low: []
    };

    processList.forEach(item => {
      const conf = (item.confidence || 'standard') as ConfidenceKey;
      if (groups[conf]) {
        groups[conf].push(item);
      } else {
        // Fallback for safety
        groups.to_confirm.push(item);
      }
    });

    return groups;
  }, [processList]);

  // Compute counters for summary dashboard
  const stats = useMemo(() => {
    const total = processList.length;
    const active = total - excludedIndices.size;
    const warnings = groupedProcesses.to_confirm.length + groupedProcesses.low.length;
    
    return {
      total,
      active,
      excluded: excludedIndices.size,
      standardCount: groupedProcesses.standard.length,
      warningCount: warnings
    };
  }, [processList, excludedIndices, groupedProcesses]);

  // Compute cooccurrence alerts dynamically
  const alerts = useMemo(() => {
    return checkCooccurrence(processList, excludedIndices);
  }, [processList, excludedIndices]);

  // Compute CPM (order constraint) warnings dynamically
  const cpmWarnings = useMemo(() => {
    const warnings: OrderWarning[] = [];
    
    // Group processes by Room and FinishTrigger to run validation per chain
    const grouped: Record<string, { active: GeneratedProcessItem[], all: GeneratedProcessItem[] }> = {};
    
    processList.forEach(item => {
      const id = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
      const active = !excludedIndices.has(id);
      
      const key = `${item.roomName}-${item.location}-${item.finishTriggerId}`;
      if (!grouped[key]) {
        grouped[key] = { active: [], all: [] };
      }
      
      grouped[key].all.push(item);
      if (active) {
        grouped[key].active.push(item);
      }
    });

    // Run validator for each group
    Object.entries(grouped).forEach(([key, group]) => {
      const sampleItem = group.all[0];
      const allDicts = { ...DICTIONARIES, ...customDictionaries };
      const dict = allDicts[sampleItem.finishTriggerId];
      if (!dict) return;

      const results = validateOrderConstraints(
        sampleItem.roomName,
        group.active,
        dict.process_chain
      );
      
      warnings.push(...results);
    });

    return warnings;
  }, [processList, excludedIndices, customDictionaries]);


  // Export results as Markdown
  const copyMarkdownToClipboard = () => {
    let markdown = `# 見積項目・工程リスト (OmneraLab)\n\n`;
    
    // Group active items by Room and Location
    const grouped: Record<string, GeneratedProcessItem[]> = {};
    processList.forEach(item => {
      const key = `${item.roomName} (${item.location})`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    Object.entries(grouped).forEach(([room, steps]) => {
      markdown += `## ${room}\n`;
      steps.forEach((step) => {
        const id = `${step.roomName}-${step.location}-${step.finishTriggerId}-${step.step}`;
        const checked = !excludedIndices.has(id);
        const confidenceLabel = 
          step.confidence === 'standard' ? '標準' :
          step.confidence === 'conditional' ? '条件付' :
          step.confidence === 'to_confirm' ? '要確認' : '低確度';

        if (checked) {
          markdown += `- [x] ${step.process_name} (${step.finishDisplayName} - 【${confidenceLabel}】)\n`;
        } else {
          markdown += `- [ ] ~~${step.process_name}~~ (除外)\n`;
        }
      });
      markdown += `\n`;
    });

    navigator.clipboard.writeText(markdown).then(() => {
      alert("マークダウン形式でクリップボードにコピーしました！");
      sendFeedback('markdown_copy');
    });
  };

  // Export results as CSV
  const downloadCSV = () => {
    let csvContent = "\uFEFF"; // BOM for Japanese Excel
    csvContent += "部屋名,部位,仕上種類,工程名,確度,状態,典拠\n";
    
    processList.forEach(step => {
      const id = `${step.roomName}-${step.location}-${step.finishTriggerId}-${step.step}`;
      const checked = !excludedIndices.has(id);
      const sourcesStr = step.sources.map(s => `${s.doc_id} ${s.section || ''}`).join('; ');
      
      const confidenceLabel = 
        step.confidence === 'standard' ? '標準' :
        step.confidence === 'conditional' ? '条件付' :
        step.confidence === 'to_confirm' ? '要確認' : '低確度';

      csvContent += `"${step.roomName}","${step.location}","${step.finishDisplayName}","${step.process_name}","${confidenceLabel}","${checked ? '採用' : '除外'}","${sourcesStr}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `estimate_processes_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    sendFeedback('csv_download');
  };

  // Export results as Excel workbook
  const downloadExcel = () => {
    const data = processList.map(step => {
      const id = `${step.roomName}-${step.location}-${step.finishTriggerId}-${step.step}`;
      const checked = !excludedIndices.has(id);
      const sourcesStr = step.sources.map(s => `${s.doc_id} ${s.section || ''}`).join('; ');
      
      const confidenceLabel = 
        step.confidence === 'standard' ? '標準' :
        step.confidence === 'conditional' ? '条件付' :
        step.confidence === 'to_confirm' ? '要確認' : '低確度';

      return {
        '部屋名': step.roomName,
        '部位': step.location,
        '仕上種類': step.finishDisplayName,
        '工程番号': step.step,
        '工程名': step.process_name,
        '確度': confidenceLabel,
        '状態': checked ? '採用' : '除外',
        'AI除外根拠': step.excludeReason || '',
        '典拠': sourcesStr
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '見積工程リスト');
    
    // Generate buffer and trigger download
    XLSX.writeFile(workbook, `estimate_processes_${new Date().toISOString().slice(0,10)}.xlsx`);
    sendFeedback('excel_download');
  };

  // Send current configuration feedback to server
  const sendFeedback = async (actionType: 'markdown_copy' | 'csv_download' | 'excel_download') => {
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
      await fetch(`${apiBase}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          actionType,
          processList,
          excludedIndices: Array.from(excludedIndices),
          contextText: manualText,
          // 工程ごとの採用・除外詳細（Worker 側で D1 に永続化され辞書メンテへ還流される）
          details: buildFeedbackDetails(processList, excludedIndices)
        }),
      });
    } catch (err) {
      console.warn('[Feedback API] failed to send feedback:', err);
    }
  };

  // Get counts of active (non-excluded) items in a group
  const getActiveCount = (items: GeneratedProcessItem[]) => {
    return items.filter(item => {
      const id = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
      return !excludedIndices.has(id);
    }).length;
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo-area" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers2 size={28} className="logo-icon" />
            <span className="logo-title">メタグモ / metagmo</span>
            <span className="logo-badge">MVP</span>
          </div>
          <Link href="/admin" className="btn outline-btn" style={{ fontSize: '0.85rem', padding: '6px 12px', borderColor: '#a855f7', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ナレッジ収集・管理画面 <Sparkles size={14} style={{ color: '#a855f7' }} />
          </Link>
        </div>
        <h1 className="main-title">見積「項目出し」高精度化エンジン <span className="sub-title">v1.0</span></h1>
        <p className="description">
          仕上げ仕様から標準工程チェーンを全展開し、表に出ない前工程の計上漏れを自動で防止します。
        </p>
      </header>

      {/* Summary Dashboard Area */}
      {processList.length > 0 && (
        <section className="dashboard fade-in">
          <div className="dash-card">
            <span className="dash-label">解析部屋数</span>
            <span className="dash-val">{parsedRooms.length} <span className="dash-unit">室</span></span>
          </div>
          <div className="dash-card">
            <span className="dash-label">生成工程総数</span>
            <span className="dash-val">{stats.total} <span className="dash-unit">項目</span></span>
          </div>
          <div className="dash-card highlight-success">
            <span className="dash-label">採用項目（転記対象）</span>
            <span className="dash-val text-success">{stats.active} / {stats.total}</span>
          </div>
          <div className="dash-card highlight-warning">
            <span className="dash-label">要注意レビュー項目</span>
            <span className="dash-val text-warning">{stats.warningCount} <span className="dash-unit">項目</span></span>
          </div>
        </section>
      )}

      <div className="tabs">
        <button 
          className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          仕様入力 / アップロード
        </button>
        <button 
          className={`tab-btn ${activeTab === 'results' ? 'active' : ''}`}
          onClick={() => {
            if (processList.length === 0) {
              alert("先にデータを入力またはアップロードしてください。");
            } else {
              setActiveTab('results');
            }
          }}
        >
          自動生成された工程リスト ({stats.active})
        </button>
      </div>

      {activeTab === 'upload' ? (
        <main className="main-content">
          <div className="card grid-2">
            <div className="upload-section">
              <h3>方法1: 仕上げ表・建具表のアップロード</h3>
              <p className="helper-text">Excelファイル (.xlsx, .xls) または CSVファイルをドラッグ＆ドロップしてください。</p>
              
              <div 
                className={`dropzone ${isDragOver ? 'dragover' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp size={54} className="upload-icon" />
                <p className="upload-prompt">ファイルをここにドラッグ＆ドロップ、またはクリックして選択</p>
                <p className="upload-types">対応形式: XLSX, XLS, CSV (仕上げ表・室仕上表)</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept=".xlsx,.xls,.csv" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFile(e.target.files[0]);
                    }
                  }}
                />
              </div>

              <div className="sample-template-box">
                <h4>自動識別する列ヘッダーのキーワード</h4>
                <div className="tags-container">
                  <span className="tag">室名 / 部屋</span>
                  <span className="tag">床 / 仕上げ</span>
                  <span className="tag">壁 / 仕上げ</span>
                  <span className="tag">天井 / 仕上げ</span>
                  <span className="tag">巾木</span>
                  <span className="tag">特記 / 備考</span>
                </div>
              </div>
            </div>

            <div className="divider-y"></div>

            <div className="manual-section">
              <h3>方法2: テキスト入力（コピペまたは自由記述）</h3>
              <p className="helper-text">Excel等からコピーしたTSVの貼り付け、または日本語の自由記述からAIによる仕様抽出が可能です。</p>
              <textarea 
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="【コピペ用例】&#13;室名&#9;床&#9;巾木&#9;壁&#9;天井&#13;リビング&#9;フローリング&#9;木製巾木&#9;ビニルクロス&#9;クロス&#13;&#13;【自由記述用例】&#13;リビングの床は複合フローリング、壁と天井はビニルクロス。洗面脱衣室は床クッションフロア、壁・天井はEP塗装仕上げとする。"
                rows={10}
                className="text-input"
                disabled={isLoading}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                <button 
                  onClick={handleManualParse} 
                  disabled={!manualText.trim() || isLoading}
                  className="btn outline-btn w-full"
                  style={{ justifyContent: 'center' }}
                >
                  表形式（TSV/CSV）として展開
                </button>
                <button 
                  onClick={handleLLMParse} 
                  disabled={!manualText.trim() || isLoading}
                  className="btn primary-btn w-full"
                  style={{ justifyContent: 'center' }}
                >
                  {isLoading ? 'AIが解析中...' : 'AI（LLM）で解析して展開'} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="main-content fade-in">
          <div className="action-bar">
            <div>
              <h2>自動生成された施工工程・見積項目</h2>
              <p className="sub-description">
                <Info size={14} className="inline-icon" /> 確度ラベルに基づいて工程を自動分類しています。疑わしい「要確認」「低確度」を中心に目視レビュー（例外キュー）を行ってください。
              </p>
            </div>
            <div className="btn-group" style={{ display: 'flex', gap: '10px' }}>
              <button onClick={copyMarkdownToClipboard} className="btn outline-btn">
                <ClipboardCopy size={16} /> Markdownコピー
              </button>
              <button onClick={downloadCSV} className="btn outline-btn">
                <Download size={16} /> CSVダウンロード
              </button>
              <button onClick={downloadExcel} className="btn primary-btn">
                <Download size={16} /> Excelダウンロード
              </button>
            </div>
          </div>

          {/* Cooccurrence Alerts Panel */}
          {alerts.length > 0 && (
            <div className="alert-panel" style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              animation: 'fadeIn 0.3s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#f87171' }}>
                <AlertTriangle size={20} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>計上漏れ警告（共起チェック: {alerts.length}件）</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {alerts.map((alert, index) => (
                  <li key={index} style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                    <span style={{ 
                      backgroundColor: 'rgba(239, 68, 68, 0.2)', 
                      color: '#f87171', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      marginRight: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      {alert.roomName} / {alert.location}
                    </span>
                    {alert.alertMessage}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CPM Order Constraint Warnings Panel */}
          {cpmWarnings.length > 0 && (
            <div className="alert-panel" style={{
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.25)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '20px',
              animation: 'fadeIn 0.3s ease-in-out'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#c084fc' }}>
                <Layers size={20} />
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>工程施工順序・CPM警告（{cpmWarnings.length}件）</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cpmWarnings.map((warning, index) => (
                  <li key={index} style={{ fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.5 }}>
                    <span style={{ 
                      backgroundColor: 'rgba(168, 85, 247, 0.2)', 
                      color: '#c084fc', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      marginRight: '8px',
                      fontSize: '0.8rem',
                      fontWeight: 'bold'
                    }}>
                      {warning.roomName}
                    </span>
                    <strong>{warning.process_name} (Step {warning.step}):</strong> {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}


          <div className="accordion-list">
            
            {/* GROUP 1: Standard (標準確度) - Collapsed by default */}
            <div className={`accordion-group ${accordions.standard ? 'open' : 'closed'}`}>
              <button className="accordion-trigger" onClick={() => toggleAccordion('standard')}>
                <div className="accordion-title-area">
                  {accordions.standard ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="badge-legend badge-standard">標準確度</span>
                  <span className="accordion-title-text">常時発生する必須の前工程（低リスク）</span>
                </div>
                <span className="accordion-count">
                  {getActiveCount(groupedProcesses.standard)} / {groupedProcesses.standard.length} 採用
                </span>
              </button>
              
              {accordions.standard && (
                <div className="accordion-content">
                  {groupedProcesses.standard.length === 0 ? (
                    <p className="no-items">このグループに該当する項目はありません。</p>
                  ) : (
                    <div className="results-container">
                      {groupedProcesses.standard.map((item) => renderProcessCard(item))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GROUP 2: Conditional (条件付き) - Expanded by default */}
            <div className={`accordion-group ${accordions.conditional ? 'open' : 'closed'}`}>
              <button className="accordion-trigger" onClick={() => toggleAccordion('conditional')}>
                <div className="accordion-title-area">
                  {accordions.conditional ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="badge-legend badge-conditional">条件付き</span>
                  <span className="accordion-title-text">仕上げ仕様の文脈条件に応じて追加された前工程</span>
                </div>
                <span className="accordion-count">
                  {getActiveCount(groupedProcesses.conditional)} / {groupedProcesses.conditional.length} 採用
                </span>
              </button>
              
              {accordions.conditional && (
                <div className="accordion-content">
                  {groupedProcesses.conditional.length === 0 ? (
                    <p className="no-items">このグループに該当する項目はありません。</p>
                  ) : (
                    <div className="results-container">
                      {groupedProcesses.conditional.map((item) => renderProcessCard(item))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GROUP 3: To Confirm (要確認) - Expanded by default */}
            <div className={`accordion-group highlight-group-warning ${accordions.to_confirm ? 'open' : 'closed'}`}>
              <button className="accordion-trigger" onClick={() => toggleAccordion('to_confirm')}>
                <div className="accordion-title-area">
                  {accordions.to_confirm ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="badge-legend badge-confirm">要確認</span>
                  <span className="accordion-title-text">特記事項や曖昧な文脈から推定される工程（要目視確認）</span>
                </div>
                <span className="accordion-count">
                  {getActiveCount(groupedProcesses.to_confirm)} / {groupedProcesses.to_confirm.length} 採用
                </span>
              </button>
              
              {accordions.to_confirm && (
                <div className="accordion-content">
                  {groupedProcesses.to_confirm.length === 0 ? (
                    <p className="no-items">このグループに該当する項目はありません。</p>
                  ) : (
                    <div className="results-container">
                      {groupedProcesses.to_confirm.map((item) => renderProcessCard(item))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* GROUP 4: Low Confidence (低確度) - Expanded by default */}
            <div className={`accordion-group highlight-group-danger ${accordions.low ? 'open' : 'closed'}`}>
              <button className="accordion-trigger" onClick={() => toggleAccordion('low')}>
                <div className="accordion-title-area">
                  {accordions.low ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="badge-legend badge-low">低確度</span>
                  <span className="accordion-title-text">計上漏れを徹底防止するために念のため提示された工程</span>
                </div>
                <span className="accordion-count">
                  {getActiveCount(groupedProcesses.low)} / {groupedProcesses.low.length} 採用
                </span>
              </button>
              
              {accordions.low && (
                <div className="accordion-content">
                  {groupedProcesses.low.length === 0 ? (
                    <p className="no-items">このグループに該当する項目はありません。</p>
                  ) : (
                    <div className="results-container">
                      {groupedProcesses.low.map((item) => renderProcessCard(item))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </main>
      )}
    </div>
  );

  // Render Card Component for each process
  function renderProcessCard(item: GeneratedProcessItem) {
    const id = `${item.roomName}-${item.location}-${item.finishTriggerId}-${item.step}`;
    const active = !excludedIndices.has(id);
    
    return (
      <div key={id} className={`process-card ${active ? 'active' : 'inactive'}`}>
        <div className="process-header">
          <div className="process-meta">
            <span className="meta-badge">{item.roomName} / {item.location}</span>
            <span className="finish-tag">{item.finishDisplayName}</span>
          </div>
          <div className="checkbox-container">
            <input 
              type="checkbox" 
              id={`check-${id}`} 
              checked={active}
              onChange={() => toggleItem(id)}
            />
            <label htmlFor={`check-${id}`}></label>
          </div>
        </div>
        <div className="process-body">
          <h4 className="process-title">
            <span className="step-num">工程 {item.step}</span> {item.process_name}
          </h4>
          {item.excludeReason && (
            <div className="exclude-reason-box" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              fontSize: '0.8rem', 
              color: 'var(--color-danger-text, #f87171)', 
              backgroundColor: 'rgba(239, 68, 68, 0.1)', 
              border: '1px solid rgba(239, 68, 68, 0.2)', 
              padding: '6px 10px', 
              borderRadius: '4px', 
              marginTop: '6px',
              marginBottom: '6px'
            }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} />
              <span><strong>AI除外推奨:</strong> {item.excludeReason}</span>
            </div>
          )}
          {item.conditions && (
            <p className="condition-info">
              <strong>発生条件:</strong> {item.conditions}
            </p>
          )}
          <div className="source-list">
            {item.sources.map((src, sIdx) => (
              <span key={sIdx} className="source-item" title={src.memo || '出典根拠'}>
                {src.doc_id} {src.section ? `[${src.section}]` : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }
}
