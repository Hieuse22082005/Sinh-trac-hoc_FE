"use client";
import { useState, useEffect, useRef } from 'react';
import CryptoJS from 'crypto-js';
import { startAuthentication } from '@simplewebauthn/browser';

const WORD_LIST = ["apple", "bear", "cat", "dog", "eagle", "fire", "gold", "hero", "iron", "jump", "king", "lion", "moon", "nest", "ocean", "pine", "queen", "rose", "star", "tree", "unit", "vine", "wolf", "xray", "yarn", "zero", "sun", "sky", "sea", "wind", "rain"];

interface SavedWallet {
  address: string;
  name: string;
}

export default function LoginScreen({ onUnlockSuccess }: { onUnlockSuccess: (key: string) => void }) {
  const [seedWords, setSeedWords] = useState<string[]>(Array(5).fill(''));
  const [status, setStatus] = useState<string>('');
  const [savedWallets, setSavedWallets] = useState<SavedWallet[]>([]);
  const [showWalletList, setShowWalletList] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  
  const [isPasswordHidden, setIsPasswordHidden] = useState(false);
  const [showSeedWarning, setShowSeedWarning] = useState(false);
  
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const masterKeyString = seedWords.join(' ').trim().toLowerCase();

  const loadSavedWallets = () => {
    const wallets: SavedWallet[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vault_key_')) {
        const address = key.replace('vault_key_', '');
        const name = localStorage.getItem(`vault_name_${address}`) || `Két ${address.slice(-4)}`;
        wallets.push({ address, name });
      }
    }
    setSavedWallets(wallets);
  };

  useEffect(() => { loadSavedWallets(); }, []);

  const generateRandomSeed = () => {
    const newArr = [];
    for (let i = 0; i < 5; i++) {
      newArr.push(WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]);
    }
    setSeedWords(newArr);
    setShowSeedWarning(true);
    setStatus("💡 Đã tạo ví mới. Vui lòng ghi nhớ 5 từ khóa này.");
    if (inputRefs.current[0]) inputRefs.current[0].focus();
  };

  const handleQuickPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      const words = text.trim().split(/\s+/).slice(0, 5);
      const newArr = [...seedWords];
      words.forEach((w, i) => newArr[i] = w.toLowerCase());
      setSeedWords(newArr);
      
      const nextEmptyIdx = newArr.findIndex(w => w === '');
      if (nextEmptyIdx !== -1 && inputRefs.current[nextEmptyIdx]) {
        inputRefs.current[nextEmptyIdx]?.focus();
      } else {
        inputRefs.current[4]?.focus();
      }
      setStatus("✅ Đã dán thành công!");
    } catch (err) {
      setStatus("❌ Trình duyệt không cho phép đọc Clipboard. Vui lòng dán thủ công (Ctrl+V).");
    }
  };

  const handlePasteMaster = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const words = pastedText.trim().split(/\s+/).slice(0, 5);
    const newArr = [...seedWords];
    words.forEach((w, i) => newArr[i] = w.toLowerCase());
    setSeedWords(newArr);
    
    const nextEmptyIdx = newArr.findIndex(w => w === '');
    if (nextEmptyIdx !== -1 && inputRefs.current[nextEmptyIdx]) {
      inputRefs.current[nextEmptyIdx]?.focus();
    } else {
      inputRefs.current[4]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < 4) {
        inputRefs.current[idx + 1]?.focus();
      } else {
        handleUnlockMaster();
      }
    }
  };

  const handleUnlockMaster = async (overrideKey?: string | React.MouseEvent) => {
    const isAutoLogin = typeof overrideKey === 'string';
    const activeKey = isAutoLogin ? overrideKey : masterKeyString;

    if (!isAutoLogin && seedWords.some(w => w === '')) {
      setStatus("❌ Vui lòng nhập đủ 5 từ khóa.");
      return;
    }
    
    setStatus("⏳ Đang xác thực...");
    try {
      const walletAddress = CryptoJS.SHA256(activeKey).toString();
      const res = await fetch(`http://localhost:8000/photos?wallet_address=${walletAddress}`);
      
      if (res.ok) {
        onUnlockSuccess(activeKey);
      } else {
        setStatus("❌ Từ khóa khôi phục không đúng!");
      }
    } catch (error) {
      setStatus("❌ Lỗi kết nối máy chủ.");
    }
  };

  const handleLoginWithFaceID = async (targetWalletAddress: string) => {
    setShowWalletList(false);
    setIsScanning(true);
    setStatus("Đang kích hoạt cảm biến...");
    
    setTimeout(async () => {
      try {
        const resOpt = await fetch('http://localhost:8000/webauthn/auth/generate', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ wallet_address: targetWalletAddress })
        });
        const options = await resOpt.json();
        const asseResp = await startAuthentication({ optionsJSON: options });
        const resVerify = await fetch('http://localhost:8000/webauthn/auth/verify', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ wallet_address: targetWalletAddress, credential: asseResp })
        });

        setIsScanning(false);

        if (resVerify.ok) {
          const savedKey = localStorage.getItem(`vault_key_${targetWalletAddress}`);
          if (savedKey) {
             await handleUnlockMaster(savedKey); 
          } else {
             setStatus("❌ Mất dữ liệu khóa, vui lòng nhập thủ công.");
          }
        } else {
          setStatus("❌ Khuôn mặt không khớp.");
        }
      } catch (error) {
        setIsScanning(false);
        setStatus("❌ Hủy quét sinh trắc.");
      }
    }, 1500); 
  };

  const handleRemoveSavedWallet = (address: string) => {
    if (window.confirm("Bỏ liên kết thiết bị này?")) {
      localStorage.removeItem(`vault_key_${address}`);
      localStorage.removeItem(`vault_name_${address}`);
      loadSavedWallets();
      if (savedWallets.length <= 1) setShowWalletList(false);
    }
  };

  const handleFaceScanClick = () => {
    if (savedWallets.length === 0) {
      setStatus("⚠️ Chưa có Két nào liên kết FaceID.");
      return;
    }
    setShowWalletList(!showWalletList);
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#080B12] font-sans flex items-center justify-center overflow-hidden text-white">
      
      {/* NỀN LƯỚI Ô VUÔNG (BLUEPRINT GRID) */}
      <div 
        className="absolute inset-0 z-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          backgroundPosition: 'center center'
        }}
      ></div>

      {/* ÁNH SÁNG NỀN (GLOW) GÓC TRÊN TRÁI & DƯỚI PHẢI */}
      <div className="absolute top-0 left-0 w-[800px] h-[600px] bg-[#00f0ff]/10 blur-[150px] rounded-full pointer-events-none z-0 -translate-x-1/3 -translate-y-1/3"></div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-[#A855F7]/10 blur-[150px] rounded-full pointer-events-none z-0 translate-x-1/4 translate-y-1/4"></div>
      
      {/* ĐƯỜNG LINE SÁNG Ở CẠNH TRÊN (Mô phỏng viền màn hình) */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-[#00f0ff]/50 via-transparent to-transparent z-0 shadow-[0_0_15px_#00f0ff]"></div>

      {/* KHUNG CONTENT LAYOUT CHIA 2 CỘT */}
      <div className="w-[95%] max-w-[1300px] flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-12 lg:gap-0 relative z-10">
        
        {/* ================= CỘT TRÁI: SINH TRẮC HỌC ================= */}
        <div className="flex-1 flex flex-col justify-center px-4 lg:pr-16 relative">
          
          <div className="flex items-center gap-2 border border-[#00f0ff]/30 text-[#00f0ff] rounded-full px-4 py-1.5 text-[10px] uppercase font-bold tracking-widest bg-[#00f0ff]/10 w-fit mb-6 shadow-[0_0_10px_rgba(0,240,255,0.2)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            END-TO-END ENCRYPTED VAULT
          </div>

          <h1 className="text-4xl lg:text-[56px] font-extrabold mb-4 leading-[1.1] tracking-tight">
            HỆ THỐNG<br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#e2e8f0] via-[#818cf8] to-[#00f0ff] drop-shadow-[0_0_15px_rgba(0,240,255,0.3)]">LƯU TRỮ ẢNH</span>
          </h1>
          
          <p className="text-[#94a3b8] text-[15px] mb-12">Bảo mật sinh trắc học kết hợp khóa phi tập trung.</p>

          {/* BOX FACE ID */}
          <div className="relative w-full max-w-[450px] bg-[#0A0D14]/80 border border-[#1E293B] rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            
            <div className="flex justify-between items-center mb-6">
              <span className="text-[#475569] text-[10px] font-bold tracking-widest uppercase">Biometric // Face ID</span>
              <div className="flex items-center gap-2 bg-[#00f0ff]/10 border border-[#00f0ff]/20 px-3 py-1 rounded-full">
                <div className="w-2 h-2 rounded-full bg-[#00f0ff] animate-pulse"></div>
                <span className="text-[#00f0ff] text-[10px] font-bold">Camera sẵn sàng</span>
              </div>
            </div>

            <div className="relative w-full h-[180px] border border-[#1E293B] bg-[#05070A] rounded-xl mb-6 flex items-center justify-center overflow-hidden shadow-inner">
              <div className="absolute inset-4 pointer-events-none z-10">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-[#00f0ff]"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-[#00f0ff]"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-[#00f0ff]"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-[#00f0ff]"></div>
              </div>

              {/* ẢNH KHUÔN MẶT TỪ THƯ MỤC PUBLIC */}
              <div className="relative z-10 flex items-center justify-center w-full h-full p-2">
                <img 
                  src="/sinh-trac-hoc.jpg" 
                  alt="Biometric Scan" 
                  className={`w-auto h-full object-contain mix-blend-screen transition-transform duration-300 ${(isScanning || showWalletList) ? 'scale-150' : 'scale-150'}`}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (!e.currentTarget.parentElement?.querySelector('.error-text')) {
                        e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<div class="error-text text-xs text-slate-400 text-center">Chưa tìm thấy ảnh<br/>vui lòng tải ảnh vào thư mục public</div>');
                    }
                  }}
                />
              </div>

              {/* LASER LUÔN CHẠY KHI VÀO TRANG */}
              <div className="absolute left-0 w-full h-[2px] bg-[#00f0ff] shadow-[0_0_20px_5px_#00f0ff] scan-laser-line z-20"></div>
            </div>

            <button 
              onClick={handleFaceScanClick}
              className="w-full flex items-center justify-center gap-3 py-4 border border-[#334155] rounded-xl hover:bg-[#1E293B] hover:border-[#00f0ff]/50 transition-all active:scale-[0.98] group"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 group-hover:text-[#00f0ff]"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 10h.01M15 10h.01M9 16c1.5 1 4.5 1 6 0" /></svg>
              <span className="text-[13px] font-bold uppercase tracking-wider text-slate-300 group-hover:text-white">Nhấn để quét khuôn mặt</span>
            </button>

            {/* OVERLAY CHỌN KÉT TRONG KHUNG - CHUẨN XÁC THEO HÌNH VÀ YÊU CẦU CỦA BẠN */}
            {showWalletList && (
              <div className="absolute inset-0 w-full h-full bg-[#0A0D14]/95 backdrop-blur-2xl border border-[#00f0ff]/40 rounded-2xl flex flex-col z-[100] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-[#1E293B] shrink-0">
                  <h3 className="text-[#00f0ff] text-[13px] font-bold uppercase tracking-widest">Chọn Két Đăng Nhập</h3>
                  <button onClick={() => setShowWalletList(false)} className="text-[#64748B] hover:text-white transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-4 space-y-3 pointer-events-auto">
                  {savedWallets.map(wallet => (
                    <div key={wallet.address} className="flex items-center gap-2 group/item">
                      <button 
                        onClick={() => handleLoginWithFaceID(wallet.address)} 
                        className="flex-1 flex items-center gap-4 px-5 py-4 bg-[#1E293B]/60 hover:bg-[#00f0ff]/20 border border-transparent hover:border-[#00f0ff]/50 text-white rounded-xl text-[14px] font-bold transition-all text-left shadow-sm"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        {wallet.name}
                      </button>
                      <button 
                        onClick={() => handleRemoveSavedWallet(wallet.address)} 
                        className="w-[52px] h-[52px] shrink-0 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all opacity-0 group-hover/item:opacity-100"
                        title="Xóa liên kết"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ================= DIVIDER GIỮA ================= */}
        <div className="hidden lg:flex flex-col items-center justify-center relative w-16 h-[500px] shrink-0">
            <div className="w-[1px] h-full bg-gradient-to-b from-transparent via-[#334155] to-transparent"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0F172A] border border-[#334155] px-2 py-3 rounded-md text-[10px] text-[#64748B] font-bold tracking-widest leading-none rotate-180" style={{ writingMode: 'vertical-rl' }}>HOẶC</div>
        </div>

        {/* ================= CỘT PHẢI: FORMS ================= */}
        <div className="flex-1 flex flex-col justify-center px-4 lg:pl-16 gap-6 relative z-20">
          
          <div className="flex flex-col gap-3">
            <div className="bg-[#21243B]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex items-center justify-between hover:border-[#8B5CF6]/50 transition-colors group cursor-pointer" onClick={generateRandomSeed}>
              <div className="flex items-center gap-5">
                <div className="w-[50px] h-[50px] rounded-xl bg-[#0F111A] border border-[#2D3348] flex items-center justify-center shadow-inner group-hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-all">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                </div>
                <div>
                  <h3 className="text-[18px] font-bold text-white mb-1">Khởi tạo Ví Mới</h3>
                  <p className="text-[12px] text-[#64748B]">Tạo chuỗi 5 ký tự bảo mật mới chỉ trong 1 bước</p>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5 group-hover:bg-[#8B5CF6]/20 group-hover:border-[#8B5CF6]/50 transition-all text-slate-400 group-hover:text-white">
                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
              </div>
            </div>

            {/* KHUNG CẢNH BÁO LƯU 5 CHỮ KHI TẠO VÍ MỚI */}
            {showSeedWarning && (
              <div className="bg-[#FFB020]/10 border border-[#FFB020]/40 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 shadow-[0_5px_15px_rgba(255,176,32,0.1)]">
                <span className="text-[#FFB020] text-base leading-none mt-0.5">⚠️</span>
                <p className="text-[#FDE68A] text-[12px] leading-relaxed flex-1">
                  <strong className="text-[#FFB020] font-bold uppercase tracking-wider block mb-1">Lưu ý quan trọng:</strong>
                  Hãy lưu 5 chữ này cẩn thận bằng cách chụp lại hoặc viết vào chỗ bí mật.
                </p>
                <button onClick={(e) => { e.stopPropagation(); setShowSeedWarning(false); }} className="text-[#FFB020]/60 hover:text-[#FFB020] p-1 transition-colors">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            )}
          </div>

          <div className="bg-[#24263A]/40 backdrop-blur-xl border border-white/5 rounded-[24px] p-8 shadow-2xl relative">
            
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2 text-slate-300">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                <span className="text-[12px] font-bold tracking-widest uppercase">Nhập từ khóa khôi phục</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button onClick={handleQuickPaste} className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white transition-colors bg-white/5 px-2.5 py-1.5 rounded-md">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                  Dán nhanh
                </button>
                <button onClick={() => setIsPasswordHidden(!isPasswordHidden)} className={`flex items-center gap-1.5 text-[11px] transition-colors border px-2.5 py-1.5 rounded-md ${isPasswordHidden ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-slate-400 border-transparent hover:text-white'}`}>
                  {isPasswordHidden ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>}
                  Ẩn
                </button>
              </div>
            </div>
            
            <div className="relative flex justify-between gap-3 mb-6">
              <div className="absolute top-1/2 left-6 right-6 h-[1px] -translate-y-1/2 z-0 pointer-events-none flex justify-between">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`flex-1 h-full mx-1 transition-colors duration-300 ${seedWords[i] && seedWords[i+1] ? 'bg-[#8B5CF6]' : 'bg-[#334155]'}`}></div>
                ))}
              </div>
              
              {seedWords.map((word, idx) => (
                <div key={idx} className="relative z-10 flex-1">
                  <div className="absolute top-2 left-2 text-[10px] text-[#475569] font-mono z-20 pointer-events-none">
                    0{idx + 1}
                  </div>
                  
                  <input
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type={isPasswordHidden ? "password" : "text"}
                    value={word}
                    onChange={(e) => {
                      const newArr = [...seedWords];
                      newArr[idx] = e.target.value.toLowerCase().trim();
                      setSeedWords(newArr);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    onPaste={idx === 0 ? handlePasteMaster : undefined}
                    className={`w-full aspect-[4/5] bg-[#0A0D14] border rounded-xl text-center text-white text-[15px] font-semibold outline-none transition-all duration-200 shadow-inner ${word ? 'border-[#8B5CF6]/50 shadow-[0_0_15px_rgba(139,92,246,0.15)] animate-pop' : 'border-[#1E293B] focus:border-[#8B5CF6]'}`}
                  />
                  {idx !== 4 && <div className={`absolute top-1/2 -right-[7px] w-1.5 h-1.5 rounded-full -translate-y-1/2 transition-colors duration-300 z-20 ${word ? 'bg-[#8B5CF6]' : 'bg-[#334155]'}`}></div>}
                </div>
              ))}
            </div>

            <p className="text-center text-[#64748B] text-[11px] mb-8">
              <span className="text-[#A855F7] font-bold">SECURE INPUT</span> Nhập 5 từ đầu tiên trong chuỗi khôi phục của bạn.
            </p>

            <button 
              onClick={handleUnlockMaster} 
              className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-[#8B5CF6] to-[#A855F7] hover:from-[#7C3AED] hover:to-[#9333EA] rounded-xl text-white font-bold text-[14px] tracking-widest active:scale-[0.98] transition-all uppercase shadow-[0_10px_30px_rgba(139,92,246,0.3)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Truy Cập Két Sắt
            </button>
          </div>
          
          <p className="flex items-center justify-center gap-2 text-[#475569] text-[11px] mt-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            Dữ liệu được mã hóa cục bộ. Chúng tôi không lưu khóa của bạn.
          </p>

        </div>
      </div>

      {/* THÔNG BÁO LỖI/THÀNH CÔNG GÓC DƯỚI (Fix lỗi kéo xuống) */}
      {status && (
        <div className="fixed bottom-10 z-[9999] animate-in slide-in-from-bottom-4 fade-in">
          <span className={`text-[13px] font-medium px-6 py-3 rounded-xl border shadow-2xl ${status.includes('❌') ? 'text-[#ff4d4f] bg-[#2a1215]/90 border-[#ff4d4f]/30' : 'text-[#00E676] bg-[#0a2016]/90 border-[#00E676]/30'}`}>
            {status}
          </span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes scan-laser {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .scan-laser-line { animation: scan-laser 2.5s linear infinite; }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .animate-pop { animation: pop 0.2s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,240,255,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,240,255,0.5); }
      `}} />
    </div>
  );
}