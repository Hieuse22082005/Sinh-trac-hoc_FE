"use client";
import { useState } from 'react';
import LoginScreen from '../components/LoginScreen';
import VaultGallery from '../components/VaultGallery';

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showVideo, setShowVideo] = useState(false); 
  const [masterKey, setMasterKey] = useState('');

  const handleUnlockSuccess = (key: string) => {
    setMasterKey(key);
    setShowVideo(true); 
  };

  return (
    // Đổi nền thành màu đen xanh sâu thẳm giống thiết kế
    <main className="min-h-screen bg-[#0A0D14] text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {showVideo && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center animate-in fade-in duration-500">
          <video 
            src="/mo-ket.mp4" 
            autoPlay 
            playsInline
            onEnded={() => {
              setShowVideo(false); 
              setIsUnlocked(true); 
            }}
            className="w-full h-full object-cover"
          />
          <button 
            onClick={() => { setShowVideo(false); setIsUnlocked(true); }}
            className="absolute top-8 right-8 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-lg backdrop-blur-md transition-all z-[101]"
          >
            Bỏ qua &gt;&gt;
          </button>
        </div>
      )}

      {/* Rẽ nhánh UI: Nếu chưa đăng nhập thì hiện khối giữa màn hình, nếu vào két thì bung full màn hình */}
      {!isUnlocked && !showVideo ? (
        <div className="max-w-6xl mx-auto p-4 md:p-8 flex items-center justify-center min-h-screen">
          <LoginScreen onUnlockSuccess={handleUnlockSuccess} />
        </div>
      ) : isUnlocked && !showVideo ? (
        <VaultGallery 
          masterKeyString={masterKey} 
          onLock={() => {
            setIsUnlocked(false);
            setMasterKey('');
          }} 
        />
      ) : null}
    </main>
  );
}