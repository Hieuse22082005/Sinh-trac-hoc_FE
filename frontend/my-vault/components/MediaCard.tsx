"use client";

import { useState } from 'react';
import type { SecureImage } from '@/types';

interface MediaCardProps {
  item: SecureImage;
  onUnlock: (filename: string, specificKey: string) => void;
  onDelete: (filename: string) => void;
  onTogglePrivacy: (item: SecureImage, newPassword?: string) => void;
}

export default function MediaCard({ item, onUnlock, onDelete, onTogglePrivacy }: MediaCardProps) {
  const [specificKey, setSpecificKey] = useState('');

  return (
    <div className="w-full h-48 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 overflow-hidden relative group transition-all duration-300 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]">
      
      {/* ẢNH/VIDEO ĐÃ GIẢI MÃ */}
      {!item.is_private && item.src ? (
        <>
          {item.src.startsWith('data:video') ? (
            <video src={item.src} className="w-full h-full object-cover" />
          ) : (
            <img src={item.src} alt="Decrypted file" className="w-full h-full object-cover" />
          )}
          
          {/* Menu công cụ hiện lên khi hover */}
          <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <button 
              onClick={() => onDelete(item.filename)}
              className="w-8 h-8 rounded bg-rose-600/90 text-white flex items-center justify-center hover:bg-rose-500 backdrop-blur shadow-lg"
              title="Xóa vĩnh viễn"
            >
              🗑️
            </button>
            <button 
              onClick={() => {
                const pass = window.prompt("Bật chế độ TUYỆT MẬT. Nhập mật khẩu riêng cho file này:");
                if (pass) onTogglePrivacy(item, pass);
              }}
              className="w-8 h-8 rounded bg-amber-500/90 text-white flex items-center justify-center hover:bg-amber-400 backdrop-blur shadow-lg"
              title="Khóa lại thành Tuyệt Mật"
            >
              🔒
            </button>
          </div>
        </>
      ) : (
        
        /* GIAO DIỆN FILE TUYỆT MẬT ĐANG BỊ KHÓA */
        <div className="w-full h-full relative flex flex-col items-center justify-center p-4">
          {item.thumb ? (
            <img src={item.thumb} alt="blurred" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm" />
          ) : (
            <div className="absolute inset-0 bg-slate-900"></div>
          )}
          
          <div className="relative z-10 flex flex-col items-center w-full">
            <span className="text-3xl mb-2 drop-shadow-lg">🔐</span>
            <input 
              type="password" 
              placeholder="Nhập mật khẩu riêng..." 
              value={specificKey} 
              onChange={(e) => setSpecificKey(e.target.value)}
              className="w-[90%] bg-black/60 border border-white/20 text-white text-xs px-3 py-2 rounded mb-2 outline-none focus:border-amber-500"
            />
            <div className="flex gap-2 w-[90%]">
              <button 
                onClick={() => onUnlock(item.filename, specificKey)}
                className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs py-1.5 rounded font-bold shadow-lg"
              >
                Mở Khóa
              </button>
              <button 
                onClick={() => onDelete(item.filename)}
                className="w-8 bg-rose-600 hover:bg-rose-500 text-white rounded flex items-center justify-center shadow-lg"
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}