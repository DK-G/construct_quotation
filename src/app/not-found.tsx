'use client';

import { useEffect } from 'react';

export default function NotFound() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      if (pathname === '/tools/construct-quotation') {
        window.location.replace('/tools/construct-quotation/');
      } else if (pathname === '/tools/construct-quotation/admin') {
        window.location.replace('/tools/construct-quotation/admin/');
      }
    }
  }, []);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      flexDirection: 'column',
      backgroundColor: '#09090b',
      color: '#f4f4f5',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '8px' }}>読み込み中...</h2>
      <p style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>自動的に正規のURLへ移動します。</p>
    </div>
  );
}
