"use client";
import { useState, useEffect, useRef } from 'react';
import CryptoJS from 'crypto-js';
import { startAuthentication } from '@simplewebauthn/browser';
import { supabase } from '@/lib/supabaseClient'; // Đảm bảo import Supabase

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
  
  const [isStealth, setIsStealth] = useState(true);
  const [tapCount, setTapCount] = useState(0);

  // STATE CHO OTP
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [pendingKey, setPendingKey] = useState('');
  const [pendingWallet, setPendingWallet] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const masterKeyString = seedWords.join(' ').trim().toLowerCase();

  useEffect(() => {
    if (tapCount > 0 && isStealth) {
      const timer = setTimeout(() => setTapCount(0), 1000);
      return () => clearTimeout(timer);
    }
  }, [tapCount, isStealth]);

  const handleStealthTap = () => {
    setTapCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= 3) {
        setIsStealth(false);
        return 0;
      }
      return newCount;
    });
  };

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

  // =========================================================================
  // LOGIC ĐĂNG NHẬP: KIỂM TRA THIẾT BỊ VÀ OTP
  // =========================================================================
  const handleUnlockMaster = async (overrideKey?: string | React.MouseEvent) => {
    const isAutoLogin = typeof overrideKey === 'string';
    const activeKey = isAutoLogin ? overrideKey : masterKeyString;

    if (!isAutoLogin && seedWords.some(w => w === '')) {
      setStatus("❌ Vui lòng nhập đủ 5 từ khóa.");
      return;
    }
    
    setStatus("⏳ Đang kiểm tra két sắt...");
    try {
      const walletAddress = CryptoJS.SHA256(activeKey).toString();
      
      let currentDeviceId = localStorage.getItem('device_id');
      if (!currentDeviceId) {
        currentDeviceId = `device_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('device_id', currentDeviceId);
      }

      // Kiểm tra thiết bị trên Supabase
      const { data: passkeyData, error } = await supabase
        .from('passkeys')
        .select('active_device_id, recovery_email')
        .eq('wallet_address', walletAddress)
        .single();

      // Nếu Két đã có thiết bị khác đăng nhập
      if (passkeyData && passkeyData.active_device_id && passkeyData.active_device_id !== currentDeviceId) {
        if (!passkeyData.recovery_email) {
          setStatus("❌ Két này chưa liên kết Email bảo mật. Không thể đăng nhập từ máy lạ!");
          return;
        }

        // Gọi API gửi OTP
        setStatus("Đang gửi mã OTP đến email của bạn...");
        const otpRes = await fetch('https://sinh-trac-hoc-be.onrender.com/request-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet_address: walletAddress })
        });

        if (!otpRes.ok) {
          setStatus("❌ Lỗi gửi email OTP.");
          return;
        }

        // Mở popup OTP
        setPendingKey(activeKey);
        setPendingWallet(walletAddress);
        setShowOtpModal(true);
        setStatus("✅ Vui lòng kiểm tra email.");
        return;
      }

      // NẾU LÀ MÁY QUEN (HOẶC CHƯA CÓ AI ĐĂNG NHẬP) -> VÀO THẲNG
      await executeFinalLogin(activeKey, walletAddress, currentDeviceId);

    } catch (error) {
      setStatus("❌ Lỗi hệ thống. Không thể đăng nhập.");
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpInput || otpInput.length < 6) return setStatus("❌ Vui lòng nhập đủ mã OTP");
    
    setIsSendingOtp(true);
    setStatus("Đang xác thực OTP...");
    try {
      const currentDeviceId = localStorage.getItem('device_id')!;
      
      const verifyRes = await fetch('https://sinh-trac-hoc-be.onrender.com/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          wallet_address: pendingWallet,
          otp_code: otpInput.trim(),
          new_device_id: currentDeviceId
        })
      });

      if (verifyRes.ok) {
        setShowOtpModal(false);
        setOtpInput('');
        setStatus("✅ Xác thực thành công!");
        await executeFinalLogin(pendingKey, pendingWallet, currentDeviceId);
      } else {
        const err = await verifyRes.json();
        setStatus(`❌ ${err.detail || "OTP không hợp lệ"}`);
      }
    } catch (error) {
      setStatus("❌ Lỗi kết nối máy chủ");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const executeFinalLogin = async (activeKey: string, walletAddress: string, deviceId: string) => {
    // Kiểm tra xem Két đã có dòng dữ liệu trên bảng passkeys chưa
    const { data: existing } = await supabase.from('passkeys').select('wallet_address').eq('wallet_address', walletAddress).single();
    
    if (existing) {
      await supabase.from('passkeys').update({ active_device_id: deviceId }).eq('wallet_address', walletAddress);
    } else {
      await supabase.from('passkeys').insert({ wallet_address: walletAddress, active_device_id: deviceId });
    }
    
    // Lưu session khóa E2EE
    sessionStorage.setItem('e2ee_master_key', walletAddress); 
    localStorage.setItem('wallet_address', walletAddress);

    // Kéo dữ liệu ảnh bung Két
    const res = await fetch(`https://sinh-trac-hoc-be.onrender.com/photos?wallet_address=${walletAddress}`);
    if (res.ok) {
      onUnlockSuccess(activeKey);
    } else {
      sessionStorage.removeItem('e2ee_master_key');
      setStatus("❌ Từ khóa khôi phục không đúng!");
    }
  };

  const handleLoginWithFaceID = async (targetWalletAddress: string) => {
    setShowWalletList(false);
    setIsScanning(true);
    setStatus("Đang kích hoạt cảm biến...");
    
    setTimeout(async () => {
      try {
        const resOpt = await fetch('https://sinh-trac-hoc-be.onrender.com/webauthn/auth/generate', {
          method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ wallet_address: targetWalletAddress })
        });
        const options = await resOpt.json();
        const asseResp = await startAuthentication({ optionsJSON: options });
        const resVerify = await fetch('https://sinh-trac-hoc-be.onrender.com/webauthn/auth/verify', {
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
    <>
      {/* ================= MÀN HÌNH NGỤY TRANG (STEALTH MODE) ================= */}
      {isStealth && (
        <div 
          onClick={handleStealthTap}
          className="fixed inset-0 z-[99999] bg-slate-100 cursor-default select-none flex items-center justify-center"
        >
          <img 
            src="/stealth-bg.jpg" 
            alt="Screensaver" 
            className="w-full h-full object-cover transition-opacity duration-300"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement?.insertAdjacentHTML('beforeend', '<div class="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><p class="mt-4 text-sm font-medium tracking-wide">Chưa tìm thấy ảnh ngụy trang<br/><span class="text-xs opacity-70">Thêm ảnh "stealth-bg.jpg" vào thư mục public</span></p></div>');
            }}
          />
        </div>
      )}

      {/* ================= GIAO DIỆN CHÍNH ================= */}
      <div className={`fixed inset-0 w-screen h-screen bg-[#F8FAFC] font-sans flex items-center justify-center overflow-hidden text-slate-800 transition-opacity duration-700 ${isStealth ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
        
        {/* NỀN LƯỚI Ô VUÔNG SÁNG MÀU */}
        <div 
          className="absolute inset-0 z-0 opacity-60 pointer-events-none"
          style={{
            backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.04) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
            backgroundPosition: 'center center'
          }}
        ></div>

        {/* ÁNH SÁNG NỀN MỀM MẠI */}
        <div className="absolute top-0 left-0 w-[800px] h-[600px] bg-cyan-300/20 blur-[150px] rounded-full pointer-events-none z-0 -translate-x-1/3 -translate-y-1/3"></div>
        <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-purple-400/20 blur-[150px] rounded-full pointer-events-none z-0 translate-x-1/4 translate-y-1/4"></div>
        
        {/* ĐƯỜNG LINE SÁNG Ở CẠNH TRÊN */}
        <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-cyan-400 via-purple-400 to-transparent z-0"></div>

        <div className="w-[95%] max-w-[1300px] flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-12 lg:gap-0 relative z-10">
          
          {/* ================= CỘT TRÁI: SINH TRẮC HỌC ================= */}
          <div className="flex-1 flex flex-col justify-center px-4 lg:pr-16 relative">
            <div className="flex items-center gap-2 border border-cyan-200 text-cyan-700 rounded-full px-4 py-1.5 text-[10px] uppercase font-bold tracking-widest bg-cyan-50 w-fit mb-6 shadow-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              END-TO-END ENCRYPTED VAULT
            </div>

            <h1 className="text-4xl lg:text-[56px] font-extrabold mb-4 leading-[1.1] tracking-tight text-slate-900">
              HỆ THỐNG<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500">LƯU TRỮ ẢNH</span>
            </h1>
            <p className="text-slate-500 text-[15px] mb-12">Bảo mật sinh trắc học kết hợp khóa phi tập trung.</p>

            <div className="relative w-full max-w-[450px] bg-white/90 border border-slate-200 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <div className="flex justify-between items-center mb-6">
                <span className="text-slate-500 text-[10px] font-bold tracking-widest uppercase">Biometric // Face ID</span>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-emerald-600 text-[10px] font-bold">Camera sẵn sàng</span>
                </div>
              </div>

              <div className="relative w-full h-[180px] border border-slate-300 bg-slate-900 rounded-xl mb-6 flex items-center justify-center overflow-hidden shadow-inner">
                <div className="absolute inset-4 pointer-events-none z-10">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyan-400"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyan-400"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyan-400"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyan-400"></div>
                </div>

                <div className="relative z-10 flex items-center justify-center w-full h-full p-2">
                  <img 
                    src="/image_90a679.png" 
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
                <div className="absolute left-0 w-full h-[2px] bg-cyan-400 shadow-[0_0_20px_5px_#22d3ee] scan-laser-line z-20"></div>
              </div>

              <button 
                onClick={handleFaceScanClick}
                className="w-full flex items-center justify-center gap-3 py-4 border border-slate-200 bg-slate-50 rounded-xl hover:bg-slate-100 transition-all active:scale-[0.98] group"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 group-hover:text-cyan-500"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M9 10h.01M15 10h.01M9 16c1.5 1 4.5 1 6 0" /></svg>
                <span className="text-[13px] font-bold uppercase tracking-wider text-slate-600 group-hover:text-slate-900">Nhấn để quét khuôn mặt</span>
              </button>

              {showWalletList && (
                <div className="absolute inset-0 w-full h-full bg-white/95 backdrop-blur-xl border border-slate-200 rounded-2xl flex flex-col z-[100] animate-in fade-in zoom-in-95 duration-200 shadow-2xl">
                  <div className="flex justify-between items-center px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
                    <h3 className="text-cyan-600 text-[13px] font-bold uppercase tracking-widest">Chọn Két Đăng Nhập</h3>
                    <button onClick={() => setShowWalletList(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 pt-4 space-y-3 pointer-events-auto">
                    {savedWallets.map(wallet => (
                      <div key={wallet.address} className="flex items-center gap-2 group/item">
                        <button 
                          onClick={() => handleLoginWithFaceID(wallet.address)} 
                          className="flex-1 flex items-center gap-4 px-5 py-4 bg-slate-50 hover:bg-cyan-50 border border-transparent hover:border-cyan-200 text-slate-800 rounded-xl text-[14px] font-bold transition-all text-left shadow-sm"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                          {wallet.name}
                        </button>
                        <button 
                          onClick={() => handleRemoveSavedWallet(wallet.address)} 
                          className="w-[52px] h-[52px] shrink-0 flex items-center justify-center rounded-xl bg-rose-50 hover:bg-rose-500 text-rose-500 hover:text-white transition-all opacity-0 group-hover/item:opacity-100"
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

          <div className="hidden lg:flex flex-col items-center justify-center relative w-16 h-[500px] shrink-0">
              <div className="w-[1px] h-full bg-gradient-to-b from-transparent via-slate-200 to-transparent"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border border-slate-200 px-2 py-3 rounded-md text-[10px] text-slate-400 font-bold tracking-widest leading-none rotate-180 shadow-sm" style={{ writingMode: 'vertical-rl' }}>HOẶC</div>
          </div>

          {/* ================= CỘT PHẢI: FORMS ================= */}
          <div className="flex-1 flex flex-col justify-center px-4 lg:pl-16 gap-6 relative z-20">
            <div className="flex flex-col gap-3">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-purple-300 transition-colors group cursor-pointer shadow-sm hover:shadow-md" onClick={generateRandomSeed}>
                <div className="flex items-center gap-5">
                  <div className="w-[50px] h-[50px] rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center transition-all group-hover:scale-105">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9333ea" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                  </div>
                  <div>
                    <h3 className="text-[18px] font-bold text-slate-800 mb-1">Khởi tạo Ví Mới</h3>
                    <p className="text-[12px] text-slate-500">Tạo chuỗi 5 ký tự bảo mật mới chỉ trong 1 bước</p>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center bg-slate-50 group-hover:bg-purple-50 group-hover:border-purple-200 transition-all text-slate-400 group-hover:text-purple-600">
                   <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" /></svg>
                </div>
              </div>

              {showSeedWarning && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2 shadow-sm">
                  <span className="text-amber-500 text-base leading-none mt-0.5">⚠️</span>
                  <p className="text-amber-700 text-[12px] leading-relaxed flex-1">
                    <strong className="text-amber-600 font-bold uppercase tracking-wider block mb-1">Lưu ý quan trọng:</strong>
                    Hãy lưu 5 chữ này cẩn thận bằng cách chụp lại hoặc viết vào chỗ bí mật.
                  </p>
                  <button onClick={(e) => { e.stopPropagation(); setShowSeedWarning(false); }} className="text-amber-400 hover:text-amber-600 p-1 transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[24px] p-8 shadow-xl relative">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2 text-slate-600">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                  <span className="text-[12px] font-bold tracking-widest uppercase">Nhập từ khóa khôi phục</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <button onClick={handleQuickPaste} className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-800 transition-colors bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-md font-medium">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                    Dán nhanh
                  </button>
                  <button onClick={() => setIsPasswordHidden(!isPasswordHidden)} className={`flex items-center gap-1.5 text-[11px] transition-colors border px-2.5 py-1.5 rounded-md font-medium ${isPasswordHidden ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-transparent text-slate-400 border-slate-200 hover:text-slate-600 hover:bg-slate-50'}`}>
                    {isPasswordHidden ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>}
                    Ẩn
                  </button>
                </div>
              </div>
              
              <div className="relative flex justify-between gap-3 mb-6">
                <div className="absolute top-1/2 left-6 right-6 h-[1px] -translate-y-1/2 z-0 pointer-events-none flex justify-between">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={`flex-1 h-full mx-1 transition-colors duration-300 ${seedWords[i] && seedWords[i+1] ? 'bg-purple-500' : 'bg-slate-200'}`}></div>
                  ))}
                </div>
                
                {seedWords.map((word, idx) => (
                  <div key={idx} className="relative z-10 flex-1">
                    <div className="absolute top-2 left-2 text-[10px] text-slate-400 font-mono z-20 pointer-events-none">
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
                      className={`w-full aspect-[4/5] bg-slate-50 border rounded-xl text-center text-slate-800 text-[15px] font-semibold outline-none transition-all duration-200 shadow-sm ${word ? 'border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.2)] bg-white animate-pop' : 'border-slate-200 focus:border-purple-400 focus:bg-white'}`}
                    />
                    {idx !== 4 && <div className={`absolute top-1/2 -right-[7px] w-1.5 h-1.5 rounded-full -translate-y-1/2 transition-colors duration-300 z-20 ${word ? 'bg-purple-500' : 'bg-slate-200'}`}></div>}
                  </div>
                ))}
              </div>

              <p className="text-center text-slate-500 text-[11px] mb-8">
                <span className="text-purple-600 font-bold">SECURE INPUT</span> Nhập 5 từ đầu tiên trong chuỗi khôi phục của bạn.
              </p>

              <button 
                onClick={handleUnlockMaster} 
                className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 rounded-xl text-white font-bold text-[14px] tracking-widest active:scale-[0.98] transition-all uppercase shadow-[0_8px_20px_rgba(168,85,247,0.25)]"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                Truy Cập Két Sắt
              </button>
            </div>
            
            <p className="flex items-center justify-center gap-2 text-slate-400 text-[11px] mt-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Dữ liệu được mã hóa cục bộ. Chúng tôi không lưu khóa của bạn.
            </p>

          </div>
        </div>
      </div>

      {/* ================= MODAL NHẬP OTP BẢO MẬT ================= */}
      {showOtpModal && (
        <div className="fixed inset-0 z-[100000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-6 border border-rose-100">
              <span className="text-3xl">🛡️</span>
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Bảo Vệ Đa Thiết Bị</h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Phát hiện đăng nhập từ thiết bị mới. Chúng tôi đã gửi một mã xác thực (OTP) tới email bảo mật của bạn. 
            </p>
            
            <div className="w-full relative mb-6">
              <input
                type="text"
                placeholder="Nhập 6 số OTP..."
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full text-center text-2xl font-bold tracking-[0.5em] bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all shadow-inner"
                autoFocus
              />
            </div>
            
            <div className="flex w-full gap-3">
              <button
                onClick={() => { setShowOtpModal(false); setStatus(''); }}
                className="flex-1 py-3 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all font-semibold active:scale-95"
              >
                Hủy Bỏ
              </button>
              <button
                onClick={handleVerifyOtp}
                disabled={isSendingOtp}
                className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all font-bold shadow-lg shadow-indigo-500/30 active:scale-95 disabled:opacity-50"
              >
                {isSendingOtp ? "Đang xử lý..." : "Xác Nhận & Đăng Nhập"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THÔNG BÁO LỖI/THÀNH CÔNG */}
      {status && (
        <div className="fixed bottom-10 z-[9999] animate-in slide-in-from-bottom-4 fade-in">
          <span className={`text-[13px] font-medium px-6 py-3 rounded-xl border shadow-xl ${status.includes('❌') ? 'text-rose-600 bg-white border-rose-200' : 'text-emerald-600 bg-white border-emerald-200'}`}>
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
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />
    </>
  );
}