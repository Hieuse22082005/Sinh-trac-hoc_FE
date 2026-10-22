"use client";
import { useState, useEffect } from 'react';
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

  const masterKeyString = seedWords.join(' ').trim().toLowerCase();

  const loadSavedWallets = () => {
    const wallets: SavedWallet[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('vault_key_')) {
        const address = key.replace('vault_key_', '');
        const name = localStorage.getItem(`vault_name_${address}`) || `Két đuôi ...${address.slice(-6)}`;
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
    setStatus("💡 Đã tạo 5 từ mới. Hãy lưu lại cẩn thận rồi bấm Truy Cập!");
  };

  const handlePasteMaster = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    const words = pastedText.trim().split(/\s+/).slice(0, 5);
    const newArr = [...seedWords];
    words.forEach((w, i) => newArr[i] = w.toLowerCase());
    setSeedWords(newArr);
  };

  const handleUnlockMaster = async (overrideKey?: string | React.MouseEvent) => {
    const isAutoLogin = typeof overrideKey === 'string';
    const activeKey = isAutoLogin ? overrideKey : masterKeyString;

    if (!isAutoLogin && seedWords.some(w => w === '')) return alert("Vui lòng nhập đủ 5 từ khóa!");
    
    setStatus("Đang kiểm tra và mở khóa...");
    try {
      const walletAddress = CryptoJS.SHA256(activeKey).toString();
      const res = await fetch(`http://localhost:8000/photos?wallet_address=${walletAddress}`);
      
      if (res.ok) {
        onUnlockSuccess(activeKey);
      } else {
        setStatus("❌ 5 từ khôi phục không đúng hoặc lỗi kết nối!");
      }
    } catch (error) {
      setStatus("Lỗi kết nối máy chủ.");
    }
  };

  const handleLoginWithFaceID = async (targetWalletAddress: string) => {
    setStatus("Đang kích hoạt nhận diện khuôn mặt...");
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

      if (resVerify.ok) {
        const savedKey = localStorage.getItem(`vault_key_${targetWalletAddress}`);
        if (savedKey) {
           await handleUnlockMaster(savedKey); 
        } else {
           setStatus("❌ Dữ liệu khôi phục bị mất, vui lòng đăng nhập bằng tay.");
        }
      } else {
        setStatus("❌ Xác thực thất bại.");
      }
    } catch (error) {
      setStatus("❌ Xác thực sinh trắc học thất bại hoặc đã hủy.");
    }
  };

  const handleRemoveSavedWallet = (address: string) => {
    if (window.confirm("Bỏ liên kết sinh trắc học với Két sắt này trên thiết bị?")) {
      localStorage.removeItem(`vault_key_${address}`);
      localStorage.removeItem(`vault_name_${address}`);
      loadSavedWallets();
    }
  };

  return (
    // THAY ĐỔI LỚN NHẤT Ở ĐÂY: Dùng bg-slate-900 (màu đen nhạt) thay vì bg-white/5
    <div className="relative w-full max-w-lg p-8 md:p-10 bg-slate-900 border border-slate-700 rounded-3xl shadow-[0_15px_50px_0_rgba(0,0,0,0.6)] animate-in fade-in zoom-in duration-500 text-white">
      
      {/* Hiệu ứng Header phát sáng */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
          <span className="text-4xl drop-shadow-md">🛡️</span>
        </div>
        <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-400 tracking-tight drop-shadow-sm mb-2">
          Secure Vault
        </h2>
        <p className="text-slate-400 text-sm font-medium">Decentralized WebAuthn Protocol</p>
      </div>

      <div className="space-y-6">
        <button 
          onClick={generateRandomSeed} 
          className="w-full py-3.5 rounded-xl border border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
        >
          <span className="text-lg">🎲</span> Khởi tạo Ví Mới (5 từ ngẫu nhiên)
        </button>
        
        <p className="text-xs text-center text-slate-500">Hoặc dán 5 từ khóa của bạn vào ô đầu tiên để khôi phục.</p>
        
        <div className="grid grid-cols-5 gap-2 md:gap-3">
          {seedWords.map((word, idx) => (
            <input
              key={idx}
              type="text"
              placeholder={`#${idx+1}`}
              value={word}
              onChange={(e) => {
                const newArr = [...seedWords];
                newArr[idx] = e.target.value.toLowerCase().trim();
                setSeedWords(newArr);
              }}
              onPaste={idx === 0 ? handlePasteMaster : undefined}
              className="w-full bg-slate-950 border border-slate-600 rounded-xl px-2 py-3.5 text-center text-white text-sm font-medium outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-600 shadow-inner"
            />
          ))}
        </div>

        <button 
          onClick={handleUnlockMaster} 
          className="w-full py-4 rounded-xl font-bold text-white tracking-wider uppercase bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:shadow-[0_0_30px_rgba(16,185,129,0.6)] transform hover:-translate-y-1 active:translate-y-0 transition-all duration-300"
        >
          🔓 TRUY CẬP KÉT SẮT
        </button>

        {status && (
          <p className="text-center text-emerald-400 font-medium text-sm animate-pulse bg-emerald-500/10 py-2 rounded-lg border border-emerald-500/20">
            {status}
          </p>
        )}
      </div>

      {savedWallets.length > 0 && (
        <div className="mt-10 border-t border-slate-700 pt-6">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-4 text-center">
            📷 Két đã liên kết Sinh Trắc
          </p>
          <div className="space-y-3">
            {savedWallets.map(wallet => (
              <div key={wallet.address} className="flex items-center gap-3 p-3 rounded-xl bg-slate-800 border border-slate-600 hover:border-emerald-500/50 transition-all group">
                <button 
                  onClick={() => handleLoginWithFaceID(wallet.address)} 
                  className="flex-1 flex items-center justify-between px-4 py-2.5 bg-slate-900 hover:bg-black text-slate-200 border border-slate-700 rounded-lg cursor-pointer font-semibold transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl">👤</span> Mở {wallet.name}
                  </span>
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded">FaceID</span>
                </button>
                <button 
                  onClick={() => handleRemoveSavedWallet(wallet.address)} 
                  className="px-3 py-3 bg-red-500/10 hover:bg-red-500/90 text-red-500 hover:text-white border border-red-500/20 rounded-lg cursor-pointer font-bold transition-all shadow-sm"
                  title="Gỡ bỏ liên kết ví này"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}