'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Sparkles, 
  Database, 
  AlertCircle, 
  CheckCircle2, 
  Layers2, 
  Play,
  Check,
  Clock
} from 'lucide-react';
import { FinishTrigger } from '../../dictionary/types';

export default function AdminPage() {
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    // Force trailing slash redirect to prevent client-side Next.js routing mismatch
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname === '/tools/construct-quotation/admin') {
        window.location.replace('/tools/construct-quotation/admin/');
      }
    }
  }, []);
  const [extractedData, setExtractedData] = useState<FinishTrigger | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('admin_key') || '';
    }
    return '';
  });

  const handleAdminKeyChange = (val: string) => {
    setAdminKey(val);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('admin_key', val);
    }
  };

  const handleExtract = async () => {
    if (!inputText.trim()) return;
    if (!adminKey.trim()) {
      setErrorMsg("管理者アクセスキーを入力してください。");
      return;
    }
    setIsLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    setExtractedData(null);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_BASE || '/api';
      const response = await fetch(`${apiBase}/extract-knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({ text: inputText }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API error (${response.status})`);
      }

      const result = await response.json();
      
      if (result.success && result.data) {
        setExtractedData(result.data);
        
        // localStorage に保存して見積画面で即時反映できるようにする
        try {
          const localSaved = localStorage.getItem('custom_dictionaries');
          const currentDicts = localSaved ? JSON.parse(localSaved) : {};
          currentDicts[result.data.finish_trigger] = result.data;
          localStorage.setItem('custom_dictionaries', JSON.stringify(currentDicts));
        } catch (storageErr) {
          console.error('Failed to save to localStorage:', storageErr);
        }

        setSuccessMsg(`工種「${result.data.display_name} (${result.data.finish_trigger})」のナレッジを自動抽出し、辞書データに即時反映・保存しました！`);
      } else {
        throw new Error("ナレッジの抽出に失敗しました。");
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "予期しないエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container">
      <header className="header">
        <div className="logo-area" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Layers2 size={28} className="logo-icon" />
            <span className="logo-title">メタグモ / metagmo</span>
            <span className="logo-badge" style={{ backgroundColor: '#a855f7' }}>ADMIN</span>
          </div>
          <Link href="/" className="btn outline-btn" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>
            <ArrowLeft size={16} /> 見積画面へ戻る
          </Link>
        </div>
        <h1 className="main-title" style={{ marginTop: '20px' }}>ナレッジ自動収集＆マスタ即時反映 <span className="sub-title" style={{ color: '#a855f7' }}>開発・管理者</span></h1>
        <p className="description">
          オンラインの公共建築標準仕様書や施工手順書、既存見積書のテキストをコピペ入力することで、AIが工種・工程ステップ・CPM順序（クリティカルパス）を自動抽出し、マスター辞書JSONへ即座に永続化保存します。
        </p>
      </header>

      <main className="main-content">
        <div className="card" style={{ marginBottom: '24px' }}>
          <h3>管理者認証</h3>
          <p className="helper-text" style={{ marginBottom: '12px' }}>
            APIを実行するための管理者アクセスキーを入力してください。
          </p>
          <input 
            type="password"
            value={adminKey}
            onChange={(e) => handleAdminKeyChange(e.target.value)}
            placeholder="管理者アクセスキーを入力"
            className="text-input"
            style={{ width: '100%', marginBottom: '8px' }}
          />
        </div>

        <div className="card" style={{ marginBottom: '24px' }}>
          <h3>仕様書テキスト入力</h3>
          <p className="helper-text" style={{ marginBottom: '12px' }}>
            公共建築工事標準仕様書の条文、JASS施工要領、または「〇〇工事の施工手順は、まず〜〜を行い、次に〜〜」といった自由記述を入力してください。
          </p>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="【入力例】&#13;第19章 内装工事 6節 床シート・床タイル敷き&#13;19.6.4 施工 (a) 下地の乾燥及び清掃を行う。 (b) 接着剤を均一に塗布する。 (c) シートを圧着して敷き込み、溶接処理を行う。"
            rows={8}
            className="text-input"
            style={{ width: '100%', marginBottom: '16px', fontFamily: 'monospace', fontSize: '0.9rem' }}
            disabled={isLoading}
          />
          <button 
            onClick={handleExtract}
            disabled={!inputText.trim() || isLoading}
            className="btn primary-btn w-full"
            style={{ justifyContent: 'center', backgroundColor: '#a855f7' }}
          >
            {isLoading ? (
              <>
                <Clock size={18} className="animate-spin" /> ナレッジを抽出＆マスタへ即時反映中...
              </>
            ) : (
              <>
                <Sparkles size={18} /> ナレッジ自動抽出 ＆ マスター辞書へ即時反映 <Play size={14} style={{ marginLeft: '4px' }} />
              </>
            )}
          </button>
        </div>

        {/* 成功・エラーメッセージ */}
        {successMsg && (
          <div className="alert-panel" style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <CheckCircle2 size={20} style={{ color: '#34d399', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: 0, color: '#34d399', fontWeight: 600 }}>登録成功</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.4 }}>{successMsg}</p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="alert-panel" style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px'
          }}>
            <AlertCircle size={20} style={{ color: '#f87171', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <h4 style={{ margin: 0, color: '#f87171', fontWeight: 600 }}>エラーが発生しました</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#e2e8f0', lineHeight: 1.4 }}>{errorMsg}</p>
            </div>
          </div>
        )}

        {/* 抽出データのプレビュー */}
        {extractedData && (
          <div className="card fade-in" style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border, rgba(255,255,255,0.1))', paddingBottom: '12px', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>即時反映されたマスタプレビュー</h3>
              <span style={{ backgroundColor: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                ID: {extractedData.finish_trigger}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>工種表示名</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 600, fontSize: '1.1rem' }}>{extractedData.display_name}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>準拠仕様</span>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.95rem' }}>
                  公共標準: {extractedData.common_spec_ref || 'なし'} / JASS: {extractedData.jass_ref || 'なし'}
                </p>
              </div>
            </div>

            <h4>工程チェーン & CPM 施工順序 ({extractedData.process_chain.length} 工程)</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
              {extractedData.process_chain.map((proc, index) => (
                <div key={index} style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      backgroundColor: 'rgba(168, 85, 247, 0.2)',
                      color: '#c084fc',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '0.9rem'
                    }}>
                      {proc.step}
                    </div>
                    <div>
                      <h5 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>{proc.process_name}</h5>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        条件: {proc.conditions || 'なし'}
                      </p>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                        {proc.sources.map((s, sIdx) => (
                          <span key={sIdx} style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', color: '#cbd5e1' }}>
                            {s.doc_id} {s.section || ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: 'bold',
                        backgroundColor: proc.confidence === 'standard' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: proc.confidence === 'standard' ? '#34d399' : '#fbbf24'
                      }}>
                        {proc.confidence.toUpperCase()}
                      </span>
                      {proc.required_by_default && (
                        <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                          デフォルト必須
                        </span>
                      )}
                    </div>
                    {proc.sequenceIndex !== undefined && (
                      <span style={{ fontSize: '0.8rem', color: '#c084fc', fontWeight: 'bold' }}>
                        CPM順序番号 (Seq): {proc.sequenceIndex}
                      </span>
                    )}
                    {proc.constraints && proc.constraints.length > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #94a3b8)' }}>
                        先行: Step {proc.constraints.map(c => c.predecessor_step).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
