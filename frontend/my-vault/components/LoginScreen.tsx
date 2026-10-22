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
    setStatus("Đã tạo ví mới. Vui lòng ghi nhớ 5 từ khóa này.");
    if (inputRefs.current[0]) inputRefs.current[0].focus();
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
      setStatus("Vui lòng nhập đủ 5 từ khóa.");
      return;
    }
    
    setStatus("Đang xác thực...");
    try {
      const walletAddress = CryptoJS.SHA256(activeKey).toString();
      const res = await fetch(`http://localhost:8000/photos?wallet_address=${walletAddress}`);
      
      if (res.ok) {
        onUnlockSuccess(activeKey);
      } else {
        setStatus("Từ khóa khôi phục không đúng.");
      }
    } catch (error) {
      setStatus("Lỗi kết nối máy chủ.");
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
             setStatus("Mất dữ liệu khóa, vui lòng nhập thủ công.");
          }
        } else {
          setStatus("Khuôn mặt không khớp.");
        }
      } catch (error) {
        setIsScanning(false);
        setStatus("Hủy quét sinh trắc.");
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
      setStatus("Chưa có Két nào liên kết FaceID.");
      return;
    }
    setShowWalletList(true);
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#06080D] font-sans flex items-center justify-center overflow-hidden">
      
      <div 
        className="absolute inset-0 z-0 opacity-80 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='103.923' viewBox='0 0 60 103.923' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke='%23192236' stroke-width='1.5' fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 17.32L60 0v34.64L30 51.96 0 34.64V0l30 17.32zM30 86.6l30-17.32v34.64L30 121.24 0 103.92V69.28L30 86.6zM30 51.96v34.64M60 34.64v34.64M0 34.64v34.64'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundPosition: 'center',
        }}
      ></div>

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-indigo-500/10 blur-[180px] rounded-full pointer-events-none z-0"></div>

      {/* KHUNG CHÍNH: Màu nền hơi trắng sáng (bg-white/10), viền sáng (border-white/20), nhòe kính mờ (backdrop-blur-3xl) */}
      <div className="w-[90%] max-w-[1200px] bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2rem] p-12 lg:p-20 shadow-[0_30px_100px_rgba(0,0,0,0.9)] flex flex-col lg:flex-row gap-16 lg:gap-24 relative z-10">
        
        {/* ================= CỘT TRÁI ================= */}
        <div className="flex-1 flex flex-col items-center lg:items-start justify-center relative">
          
          <h1 className="text-4xl lg:text-[50px] font-extrabold mb-16 leading-[1.1] tracking-wide uppercase text-center lg:text-left drop-shadow-xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00f0ff] to-[#8B5CF6]">Hệ Thống</span><br/>
            <span className="text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">Lưu Trữ Ảnh</span>
          </h1>

          <div className="flex items-center gap-10 mb-8 w-full justify-center lg:justify-start relative">
            
            <div className="w-[120px] h-[120px] shrink-0 rounded-full border border-white/10 flex items-center justify-center shadow-lg bg-[#0A0D14] relative group cursor-pointer hover:border-[#00f0ff]/50 transition-colors duration-300">
              <div className="absolute inset-[-4px] rounded-full bg-gradient-to-r from-cyan-400 via-indigo-500 to-purple-500 animate-[spin_3s_linear_infinite] blur-[3px] -z-10"></div>
              <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </div>

            <div className="relative w-[280px] h-[160px]">
              <button 
                onClick={handleFaceScanClick}
                className={`w-full h-full rounded-2xl bg-[#0A0D14]/80 border ${isScanning || showWalletList ? 'border-transparent shadow-[0_0_40px_rgba(0,240,255,0.15)]' : 'border-white/10 hover:border-cyan-500/40 hover:shadow-[0_0_30px_rgba(0,240,255,0.05)]'} flex items-center justify-center active:scale-[0.98] transition-all duration-300 relative overflow-hidden group`}
              >
                <div className="absolute inset-5 pointer-events-none">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-[2.5px] border-l-[2.5px] border-[#00f0ff] rounded-tl-sm"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-[2.5px] border-r-[2.5px] border-[#00f0ff] rounded-tr-sm"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-[2.5px] border-l-[2.5px] border-[#00f0ff] rounded-bl-sm"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-[2.5px] border-r-[2.5px] border-[#00f0ff] rounded-br-sm"></div>
                </div>

                <div className={`text-[#00f0ff] flex flex-col items-center gap-[8px] transition-transform duration-300 ${(isScanning || showWalletList) ? 'scale-125' : 'group-hover:scale-110'}`}>
                   <div className="flex gap-5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00f0ff]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#00f0ff]"></div>
                   </div>
                   <div className="w-[28px] h-[10px] border-b-[3px] border-[#00f0ff] rounded-[50%] mt-1"></div>
                </div>

                <div className="absolute left-0 w-full h-[2px] bg-[#00f0ff] shadow-[0_0_20px_4px_#00f0ff] scan-laser-line z-20"></div>
              </button>
              
              {savedWallets.length > 0 && !isScanning && !showWalletList && (
                <div className="absolute -top-3 -right-3 w-[26px] h-[26px] rounded-full bg-[#00E676] flex items-center justify-center border-[3px] border-[#1E293B] z-20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </div>
              )}
            </div>
          </div>

          <p className="text-slate-300 text-[12px] font-semibold tracking-widest uppercase mt-4 w-full text-center lg:text-left lg:pl-[20px]">
            Nhấn để quét khuôn mặt
          </p>

          {showWalletList && (
            <div className="absolute top-[100%] mt-4 left-0 w-full bg-[#161B28] border border-cyan-500/30 rounded-2xl p-5 shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-[100] animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-center mb-4 border-b border-white/5 pb-3">
                <h3 className="text-cyan-400 text-[13px] font-bold uppercase tracking-widest">Chọn Két Đăng Nhập</h3>
                <button onClick={() => setShowWalletList(false)} className="text-slate-500 hover:text-white transition-colors">✕</button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {savedWallets.map(wallet => (
                  <div key={wallet.address} className="flex items-center gap-2 group/item">
                    <button 
                      onClick={() => handleLoginWithFaceID(wallet.address)} 
                      className="flex-1 flex items-center gap-4 px-5 py-3.5 bg-black/30 hover:bg-cyan-500/20 text-white rounded-xl text-[15px] font-medium border border-transparent hover:border-cyan-500/50 active:scale-[0.98] transition-all text-left"
                    >
                      <span className="text-xl">👤</span> {wallet.name}
                    </button>
                    <button 
                      onClick={() => handleRemoveSavedWallet(wallet.address)} 
                      className="w-12 h-12 flex items-center justify-center rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white transition-all opacity-0 group-hover/item:opacity-100"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ================= CỘT PHẢI ================= */}
        <div className="flex-1 flex flex-col justify-center gap-8 relative z-20">
          
          <button 
            onClick={generateRandomSeed}
            className="w-full relative flex items-center justify-between px-7 py-6 rounded-[1.2rem] border border-white/10 bg-[#0A0D14]/80 hover:border-[#00f0ff]/50 hover:shadow-[0_0_25px_rgba(0,240,255,0.15)] text-white transition-all duration-300 active:scale-[0.98] group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
            <div className="flex items-center gap-4 relative z-10">
              <span className="text-[26px] group-hover:rotate-12 transition-transform duration-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">🎲</span>
              <span className="font-semibold text-[16px] tracking-wide text-slate-100 group-hover:text-white transition-colors">Khởi tạo Ví Mới</span>
            </div>
            <span className="text-slate-400 group-hover:text-[#00f0ff] transition-colors text-base relative z-10 group-hover:translate-x-1">❯</span>
          </button>

          <div className="bg-[#0A0D14]/80 border border-white/10 rounded-[1.8rem] p-9">
            <p className="text-[13px] text-slate-300 font-bold mb-7 tracking-widest uppercase">
              Nhập từ khóa khôi phục
            </p>
            
            <div className="relative flex justify-between gap-3 mb-10">
              <div className="absolute top-1/2 left-5 right-5 h-[2px] -translate-y-1/2 z-0 pointer-events-none flex justify-between">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`flex-1 h-full mx-1 transition-colors duration-300 ${seedWords[i] && seedWords[i+1] ? 'bg-[#00f0ff]' : 'bg-white/10'}`}></div>
                ))}
              </div>
              
              {seedWords.map((word, idx) => (
                <div key={idx} className="relative z-10 flex-1">
                  <input
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    value={word}
                    onChange={(e) => {
                      const newArr = [...seedWords];
                      newArr[idx] = e.target.value.toLowerCase().trim();
                      setSeedWords(newArr);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, idx)}
                    onPaste={idx === 0 ? handlePasteMaster : undefined}
                    className={`w-full aspect-square max-h-[65px] bg-[#06080D] border-[1.5px] rounded-xl text-center text-white text-[15px] font-semibold outline-none transition-all duration-200 ${word ? 'border-[#00f0ff] animate-pop shadow-[0_0_15px_rgba(0,240,255,0.15)]' : 'border-white/10 focus:border-[#00f0ff]'}`}
                  />
                  {idx !== 4 && <div className={`absolute top-1/2 -right-[7px] w-[6px] h-[6px] rounded-full -translate-y-1/2 transition-colors duration-300 z-20 ${word ? 'bg-[#00f0ff]' : 'bg-white/10'}`}></div>}
                </div>
              ))}
            </div>

            <button 
              onClick={handleUnlockMaster} 
              className="w-full py-4 bg-[#A855F7] hover:bg-[#9333EA] rounded-xl text-white font-bold text-[15px] tracking-widest active:scale-[0.98] transition-all uppercase shadow-[0_5px_25px_rgba(168,85,247,0.3)]"
            >
              Truy Cập Két Sắt
            </button>
          </div>

        </div>
      </div>

      {status && (
        <div className="absolute bottom-12 z-50">
          <span className={`text-[14px] font-medium px-6 py-3 rounded-xl border shadow-2xl ${status.includes('❌') ? 'text-[#ff4d4f] bg-[#2a1215]/90 border-[#ff4d4f]/30' : 'text-[#00E676] bg-[#0a2016]/90 border-[#00E676]/30'}`}>
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
        .scan-laser-line { 
          animation: scan-laser 2s linear infinite; 
        }
        @keyframes pop {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
        .animate-pop { 
          animation: pop 0.2s ease-out forwards; 
        }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,240,255,0.2); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,240,255,0.5); }
      `}} />
    </div>
  );
}