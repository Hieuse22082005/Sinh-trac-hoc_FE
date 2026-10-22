"use client";
import { useState, useEffect, useRef } from 'react';
import CryptoJS from 'crypto-js';
import { encryptFile, decryptFile } from '../utils/cryptoService';
import { generateBlurredThumbnail } from '../utils/mediaHelper';
import type { SecureImage } from '../types';
import { startRegistration } from '@simplewebauthn/browser';

const AUTO_LOCK_TIMEOUT = 3 * 60 * 1000;
interface TrashItem { filename: string; deletedAt: number; }

export default function VaultGallery({ masterKeyString, onLock }: { masterKeyString: string, onLock: () => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [images, setImages] = useState<SecureImage[]>([]);
  const [status, setStatus] = useState<string>('');
  const [isUploadPrivate, setIsUploadPrivate] = useState<boolean>(false);
  const [uploadLevel2Key, setUploadLevel2Key] = useState<string>('');
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(''); 
  const [activeTab, setActiveTab] = useState<string>('all'); 
  const [favorites, setFavorites] = useState<string[]>([]); 
  const [trashList, setTrashList] = useState<TrashItem[]>([]); 
  const [collections, setCollections] = useState<Record<string, string[]>>({}); 
  const [vaultName, setVaultName] = useState<string>('hush.');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showColMenuFor, setShowColMenuFor] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const walletAddress = CryptoJS.SHA256(masterKeyString).toString();

  const showStatus = (msg: string, timeout = 3000) => {
    setStatus(msg);
    if (timeout > 0) setTimeout(() => setStatus(''), timeout);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('vault_theme');
    if (savedTheme) setTheme(savedTheme as 'dark' | 'light');

    const savedName = localStorage.getItem(`vault_name_${walletAddress}`);
    if (savedName) setVaultName(savedName);
    const savedFavs = localStorage.getItem(`favs_${walletAddress}`);
    if (savedFavs) setFavorites(JSON.parse(savedFavs));
    const savedCols = localStorage.getItem(`cols_${walletAddress}`);
    if (savedCols) setCollections(JSON.parse(savedCols));
    const savedTrash = localStorage.getItem(`trash_${walletAddress}`);
    if (savedTrash) {
      const parsedTrash: TrashItem[] = JSON.parse(savedTrash);
      const now = Date.now();
      const validTrash = parsedTrash.filter(t => now - t.deletedAt < 30 * 24 * 60 * 60 * 1000);
      setTrashList(validTrash);
      if (validTrash.length !== parsedTrash.length) localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(validTrash));
    }
  }, [walletAddress]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('vault_theme', newTheme);
  };

  const fetchImages = async () => {
    try {
      const res = await fetch(`http://localhost:8000/photos?wallet_address=${walletAddress}`);
      const data = await res.json();
      const processedImages: SecureImage[] = [];
      for (const item of data.photos) {
        if (item.is_private) {
          let decryptedThumb = null;
          if (item.thumbnail) {
            try { decryptedThumb = CryptoJS.AES.decrypt(item.thumbnail, masterKeyString).toString(CryptoJS.enc.Utf8); } catch(e) {}
          }
          processedImages.push({ filename: item.filename, src: null, thumb: decryptedThumb, is_private: true });
        } else {
          try {
            const fileRes = await fetch(`http://localhost:8000/download/${item.filename}`);
            if (fileRes.ok) {
              const base64Data = await decryptFile(await fileRes.blob(), masterKeyString);
              processedImages.push({ filename: item.filename, src: base64Data, thumb: null, is_private: false });
            }
          } catch (err) {}
        }
      }
      setImages(processedImages);
    } catch (error) {}
  };

  useEffect(() => { fetchImages(); }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const resetTimer = () => { clearTimeout(timeoutId); timeoutId = setTimeout(() => { onLock(); }, AUTO_LOCK_TIMEOUT); };
    resetTimer(); 
    window.addEventListener('mousemove', resetTimer); window.addEventListener('keydown', resetTimer); window.addEventListener('click', resetTimer);
    return () => { clearTimeout(timeoutId); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keydown', resetTimer); window.removeEventListener('click', resetTimer); };
  }, [onLock]);

  const handleCreateCollection = () => {
    const name = window.prompt("Nhập tên Bộ sưu tập mới:");
    if (name && !collections[name]) {
      const newCols = { ...collections, [name]: [] };
      setCollections(newCols);
      localStorage.setItem(`cols_${walletAddress}`, JSON.stringify(newCols));
      showStatus(`✅ Đã tạo: ${name}`);
    }
  };

  const handleDeleteCollection = (colName: string) => {
    if (window.confirm(`Xóa bộ sưu tập "${colName}"? (Ảnh gốc vẫn được giữ lại)`)) {
      const newCols = { ...collections };
      delete newCols[colName];
      setCollections(newCols);
      localStorage.setItem(`cols_${walletAddress}`, JSON.stringify(newCols));
      if (activeTab === colName) setActiveTab('all');
    }
  };

  const handleRemoveFromCollection = (colName: string, filename: string) => {
    const updated = { ...collections, [colName]: collections[colName].filter(f => f !== filename) };
    setCollections(updated);
    localStorage.setItem(`cols_${walletAddress}`, JSON.stringify(updated));
    showStatus(`Đã rút khỏi ${colName}`);
  };

  const executeAddToCollection = (colName: string) => {
    if (showColMenuFor === 'batch') {
      const updated = { ...collections, [colName]: [...new Set([...collections[colName], ...selectedFiles])] };
      setCollections(updated);
      localStorage.setItem(`cols_${walletAddress}`, JSON.stringify(updated));
      setSelectedFiles([]);
      showStatus(`✅ Đã thêm loạt ảnh vào ${colName}`);
    } else if (showColMenuFor) {
      const updated = { ...collections, [colName]: [...new Set([...collections[colName], showColMenuFor])] };
      setCollections(updated);
      localStorage.setItem(`cols_${walletAddress}`, JSON.stringify(updated));
      showStatus(`✅ Đã thêm vào ${colName}`);
    }
    setShowColMenuFor(null);
  };

  const handleRegisterFaceID = async () => {
    showStatus("Đang bật Cảm biến sinh trắc học...", 0);
    const customName = window.prompt("Nhập tên cho Két sắt này:", vaultName) || vaultName;
    try {
      const resOpt = await fetch('http://localhost:8000/webauthn/register/generate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ wallet_address: walletAddress, vault_name: customName }) });
      const options = await resOpt.json();
      const attResp = await startRegistration(options);
      const resVerify = await fetch('http://localhost:8000/webauthn/register/verify', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ wallet_address: walletAddress, credential: attResp }) });
      if (resVerify.ok) {
        localStorage.setItem(`vault_key_${walletAddress}`, masterKeyString);
        localStorage.setItem(`vault_name_${walletAddress}`, customName);
        setVaultName(customName);
        showStatus(`✅ Đã thêm FaceID!`);
      }
    } catch (error) { showStatus("❌ Hủy đăng ký."); }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isUploadPrivate && !uploadLevel2Key) return alert("Vui lòng nhập mật khẩu tuyệt mật bên dưới trước khi chọn file!");
    try {
      showStatus("Đang mã hóa...", 0);
      const keyToUse = isUploadPrivate ? uploadLevel2Key : masterKeyString;
      const encryptedBlob = await encryptFile(file, keyToUse);
      let encryptedThumb = '';
      if (isUploadPrivate) {
        const thumbBase64 = await generateBlurredThumbnail(file);
        if (thumbBase64) encryptedThumb = CryptoJS.AES.encrypt(thumbBase64, masterKeyString).toString();
      }
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', isUploadPrivate ? 'true' : 'false');
      formData.append('thumbnail', encryptedThumb);
      formData.append('wallet_address', walletAddress); 
      const response = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
      if (response.ok) { showStatus("✅ Đã niêm phong!"); fetchImages(); }
    } catch (error) { showStatus("❌ Lỗi mã hóa!"); }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTogglePrivacy = async (item: SecureImage, newPassword?: string) => {
    if (!item.src && newPassword === undefined) return; 
    try {
      showStatus("Đang xử lý...", 0);
      let fileObj: File;
      if (item.src) {
        const response = await fetch(item.src);
        fileObj = new File([await response.blob()], `toggle_${item.filename}`, { type: (await response.blob()).type });
      } else return alert("Hãy mở khóa ảnh này trước khi thay đổi trạng thái!");

      const isMakingPrivate = newPassword !== undefined;
      const keyToUse = isMakingPrivate ? newPassword : masterKeyString;
      const encryptedBlob = await encryptFile(fileObj, keyToUse);
      let encryptedThumb = '';
      if (isMakingPrivate) {
        const thumbBase64 = await generateBlurredThumbnail(fileObj);
        encryptedThumb = CryptoJS.AES.encrypt(thumbBase64, masterKeyString).toString();
      }
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', isMakingPrivate ? 'true' : 'false');
      formData.append('thumbnail', encryptedThumb);
      formData.append('wallet_address', walletAddress); 
      await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
      
      const sysDeletePass = process.env.NEXT_PUBLIC_DELETE_PASSWORD || 'admin123';
      await fetch(`http://localhost:8000/delete/${item.filename}?delete_pass=${sysDeletePass}`, { method: 'DELETE' });
      fetchImages(); 
      showStatus("✅ Đã chuyển đổi!");
    } catch (error) { showStatus("❌ Lỗi chuyển đổi!"); }
  };

  const handleUnlockSinglePrivate = async (filename: string, specificKey: string) => {
    showStatus(`Đang giải mã...`, 0);
    try {
      const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
      const base64Data = await decryptFile(await fileRes.blob(), specificKey);
      setImages(prev => prev.map(img => img.filename === filename ? { ...img, src: base64Data } : img));
      showStatus("✅ Mở khóa thành công!");
    } catch (error) { showStatus("❌ Sai mật khẩu!"); }
  };

  const toggleFavorite = (filename: string) => {
    const newFavs = favorites.includes(filename) ? favorites.filter(f => f !== filename) : [...favorites, filename];
    setFavorites(newFavs);
    localStorage.setItem(`favs_${walletAddress}`, JSON.stringify(newFavs));
  };

  const handleSoftDelete = (filename: string) => {
    const pass = window.prompt("🔒 NHẬP MẬT KHẨU HỆ THỐNG để chuyển file vào Thùng rác:");
    if (!pass) return;
    localStorage.setItem('sys_del_pass', pass); 
    const newTrash = [...trashList, { filename, deletedAt: Date.now() }];
    setTrashList(newTrash);
    localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(newTrash));
    setFavorites(favorites.filter(f => f !== filename));
    localStorage.setItem(`favs_${walletAddress}`, JSON.stringify(favorites.filter(f => f !== filename)));
    showStatus("Đã chuyển vào Thùng rác.");
  };

  const handleRestore = (filename: string) => {
    const newTrash = trashList.filter(t => t.filename !== filename);
    setTrashList(newTrash);
    localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(newTrash));
    showStatus("✅ Đã khôi phục.");
  };

  const handleHardDelete = async (filename: string) => {
    if (!window.confirm("⚠️ Xóa vĩnh viễn file này khỏi máy chủ? KHÔNG THỂ KHÔI PHỤC!")) return;
    let pass = localStorage.getItem('sys_del_pass') || window.prompt("Nhập MẬT KHẨU HỆ THỐNG:");
    if (!pass) return;
    try {
      const response = await fetch(`http://localhost:8000/delete/${filename}?delete_pass=${encodeURIComponent(pass)}`, { method: 'DELETE' });
      if (response.ok) {
        setImages(prev => prev.filter(img => img.filename !== filename));
        setTrashList(trashList.filter(t => t.filename !== filename));
        localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(trashList.filter(t => t.filename !== filename)));
        showStatus("✅ Đã xóa vĩnh viễn!");
      } else showStatus("❌ Sai mật khẩu hệ thống!");
    } catch (error) {}
  };

  const toggleSelectFile = (filename: string) => {
    setSelectedFiles(prev => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename]);
  };

  const handleBatchDownload = () => {
    selectedFiles.forEach(filename => {
      const item = images.find(img => img.filename === filename);
      if (item && item.src) {
        const a = document.createElement('a'); a.href = item.src; a.download = `vault_${filename.replace('.enc', '')}`; a.click();
      }
    });
    setSelectedFiles([]);
  };

  const handleBatchDelete = async () => {
    if (activeTab === 'trash') {
      if (!window.confirm(`⚠️ CHẮC CHẮN TIÊU HỦY VĨNH VIỄN ${selectedFiles.length} FILE NÀY?`)) return;
      let pass = localStorage.getItem('sys_del_pass') || window.prompt("Nhập MẬT KHẨU HỆ THỐNG:");
      if (!pass) return;
      showStatus(`Đang tiêu hủy ${selectedFiles.length} file...`, 0);
      for (const filename of selectedFiles) {
        try {
          const response = await fetch(`http://localhost:8000/delete/${filename}?delete_pass=${encodeURIComponent(pass)}`, { method: 'DELETE' });
          if (response.ok) {
             setImages(prev => prev.filter(img => img.filename !== filename));
             setTrashList(prev => prev.filter(t => t.filename !== filename));
          }
        } catch (error) {}
      }
      setSelectedFiles([]);
      localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(trashList.filter(t => !selectedFiles.includes(t.filename))));
      showStatus("✅ Đã tiêu hủy hàng loạt!");
    } else {
      const pass = window.prompt(`🔒 NHẬP MẬT KHẨU HỆ THỐNG để chuyển ${selectedFiles.length} file vào Thùng rác:`);
      if (!pass) return;
      localStorage.setItem('sys_del_pass', pass);
      const newTrash = [...trashList];
      for (const filename of selectedFiles) {
        if (!newTrash.some(t => t.filename === filename)) newTrash.push({ filename, deletedAt: Date.now() });
      }
      setTrashList(newTrash);
      localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(newTrash));
      setSelectedFiles([]);
      showStatus("Đã chuyển loạt file vào Thùng rác.");
    }
  };

  const handleBatchRestore = () => {
    const newTrash = trashList.filter(t => !selectedFiles.includes(t.filename));
    setTrashList(newTrash);
    localStorage.setItem(`trash_${walletAddress}`, JSON.stringify(newTrash));
    setSelectedFiles([]);
    showStatus("✅ Đã khôi phục loạt file!");
  };

  const displayImages = images.filter(img => {
    if (searchQuery && !img.filename.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    const isTrashed = trashList.some(t => t.filename === img.filename);
    if (activeTab === 'trash') return isTrashed;
    if (isTrashed) return false;
    if (activeTab === 'favorites') return favorites.includes(img.filename);
    if (activeTab !== 'all') return collections[activeTab]?.includes(img.filename);
    return true;
  });

  const isVideoFile = (item: SecureImage) => {
    if (item.src && item.src.startsWith('data:video')) return true;
    if (item.filename.toLowerCase().match(/\.(mp4|webm|ogg|mov)$/)) return true;
    return false;
  };

  // CẤU HÌNH MÀU SẮC CHO ÁNH SÁNG & HỌA TIẾT SVG
  const isDark = theme === 'dark';
  const bgMainColor = isDark ? '#080C14' : '#F2F5F9';
  const svgPatternColor = isDark ? '%23182033' : '%23e0e7ff';
  
  const textHeading = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-600';
  const sidebarBg = isDark ? 'bg-black/20 border-white/5' : 'bg-white/70 border-indigo-100 shadow-2xl';
  const headerBg = isDark ? 'bg-black/10 border-white/5' : 'bg-white/50 border-indigo-100 shadow-sm';
  const inputWrapper = isDark ? 'bg-white/5 border-white/5 focus-within:border-indigo-500/50' : 'bg-slate-100/80 border-slate-200 focus-within:border-indigo-400';
  const inputText = isDark ? 'text-slate-300 placeholder:text-slate-600' : 'text-slate-800 placeholder:text-slate-400';
  const cardBg = isDark ? 'bg-black/40 border-white/5 shadow-black/50' : 'bg-white border-slate-200 shadow-indigo-900/10';
  const uploadBox = isDark ? 'bg-indigo-950/20 border-indigo-500/30 hover:border-indigo-500/60' : 'bg-indigo-50/50 border-indigo-200 hover:border-indigo-400 shadow-inner';

  const getMenuClass = (isActive: boolean, type: 'normal' | 'trash' | 'fav' = 'normal') => {
    const base = "w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 active:scale-95 group";
    if (isActive) {
      if (type === 'trash') return `${base} ${isDark ? 'bg-rose-500/15 text-rose-400 shadow-[inset_3px_0_0_0_#f43f5e]' : 'bg-rose-100 text-rose-700 shadow-[inset_3px_0_0_0_#e11d48]'}`;
      if (type === 'fav') return `${base} ${isDark ? 'bg-rose-500/10 text-rose-300 shadow-[inset_3px_0_0_0_#fda4af]' : 'bg-rose-50 text-rose-600 shadow-[inset_3px_0_0_0_#f43f5e]'}`;
      return `${base} ${isDark ? 'bg-indigo-500/15 text-indigo-300 shadow-[inset_3px_0_0_0_#6366f1]' : 'bg-indigo-100 text-indigo-700 shadow-[inset_3px_0_0_0_#4f46e5]'}`;
    }
    return `${base} hover:translate-x-1.5 ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-slate-200' : 'hover:bg-indigo-50 text-slate-600 hover:text-indigo-900'}`;
  };

  return (
    <div className={`w-screen h-screen flex font-sans overflow-hidden animate-in fade-in duration-500 relative transition-colors duration-700 ${isDark ? 'bg-[#080C14]' : 'bg-[#F2F5F9]'}`}>
      
      {/* 1. LỚP HỌA TIẾT SVG */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700 opacity-60"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='103.923' viewBox='0 0 60 103.923' xmlns='http://www.w3.org/2000/svg'%3E%3Cg stroke='${svgPatternColor}' stroke-width='1' fill='none' fill-rule='evenodd'%3E%3Cpath d='M30 17.32L60 0v34.64L30 51.96 0 34.64V0l30 17.32zM30 86.6l30-17.32v34.64L30 121.24 0 103.92V69.28L30 86.6zM30 51.96v34.64M60 34.64v34.64M0 34.64v34.64'/%3E%3C/g%3E%3C/svg%3E")`,
          backgroundAttachment: 'fixed'
        }}
      ></div>

      {/* 2. LỚP ÁNH SÁNG TỎA GÓC MÀN HÌNH (GLOW ORBS) */}
      <div className={`absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none transition-colors duration-1000 z-0 ${isDark ? 'bg-indigo-900/20' : 'bg-blue-300/30'}`}></div>
      <div className={`absolute bottom-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full blur-[140px] pointer-events-none transition-colors duration-1000 z-0 ${isDark ? 'bg-blue-900/15' : 'bg-indigo-300/20'}`}></div>

      {/* 3. LỚP NỘI DUNG CHÍNH */}
      <div className="relative z-10 flex w-full h-full">
        
        {/* SIDEBAR TRÁI */}
        <aside className={`w-64 shrink-0 border-r flex flex-col pt-8 hidden md:flex overflow-y-auto custom-scrollbar backdrop-blur-2xl transition-colors duration-500 ${sidebarBg}`}>
          <div className="px-8 mb-10 flex items-center gap-3 cursor-pointer group active:scale-95 transition-transform" onClick={() => setActiveTab('all')}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xl group-hover:scale-110 transition-transform shadow-lg ${isDark ? 'bg-slate-200 text-slate-900' : 'bg-indigo-600 text-white shadow-indigo-500/30'}`}>
              👻
            </div>
            <h1 className={`text-2xl font-bold tracking-tight truncate transition-colors ${textHeading}`}>{vaultName}</h1>
          </div>

          <div className="flex-1 px-4 space-y-1">
            <p className={`text-[11px] font-bold uppercase tracking-widest mb-4 ml-4 ${isDark ? 'text-slate-500' : 'text-indigo-400'}`}>Góc riêng của bạn</p>
            
            <button onClick={() => setActiveTab('all')} className={getMenuClass(activeTab === 'all')}>
              <span className="text-lg group-hover:scale-110 transition-transform">🖼️</span> Tổng hợp ảnh
              <span className="ml-auto text-xs font-mono opacity-60">{images.length - trashList.length}</span>
            </button>
            
            <div className="flex items-center mt-2 group/create">
              <button onClick={handleCreateCollection} className={`flex-1 flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-300 active:scale-95 hover:translate-x-1.5 ${isDark ? 'hover:bg-white/5 text-slate-400 hover:text-slate-200' : 'hover:bg-indigo-50 text-slate-600 hover:text-indigo-900'}`}>
                <span className="text-lg group-hover/create:scale-110 transition-transform">📁</span> Tạo bộ sưu tập
              </button>
            </div>
            
            {Object.keys(collections).map(col => (
              <div key={col} className={`flex items-center group/col rounded-xl transition-all duration-300 overflow-hidden ${activeTab === col ? (isDark ? 'bg-indigo-500/10 shadow-[inset_3px_0_0_0_#6366f1]' : 'bg-indigo-100 shadow-[inset_3px_0_0_0_#4f46e5]') : (isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100')}`}>
                <button onClick={() => setActiveTab(col)} className={`flex-1 flex items-center gap-3 pl-10 pr-2 py-3 text-sm font-medium truncate transition-all duration-300 active:scale-[0.98] group-hover/col:translate-x-1 ${activeTab === col ? (isDark ? 'text-indigo-300' : 'text-indigo-700 font-bold') : (isDark ? 'text-slate-400 group-hover/col:text-slate-200' : 'text-slate-600 group-hover/col:text-slate-900')}`}>
                  <span className="truncate">{col}</span>
                </button>
                <span className="text-xs font-mono opacity-50 px-2">{collections[col].length}</span>
                <button onClick={() => handleDeleteCollection(col)} className="opacity-0 group-hover/col:opacity-100 px-3 py-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 active:scale-90 transition-all mr-1 rounded-lg" title="Xóa BST này">✖</button>
              </div>
            ))}

            <button onClick={() => setActiveTab('favorites')} className={`mt-2 ${getMenuClass(activeTab === 'favorites', 'fav')}`}>
              <span className="text-lg group-hover:scale-110 transition-transform">🤍</span> Yêu thích
              <span className="ml-auto text-xs font-mono opacity-60">{favorites.length}</span>
            </button>
            
            <button onClick={() => setActiveTab('trash')} className={getMenuClass(activeTab === 'trash', 'trash')}>
              <span className="text-lg group-hover:scale-110 transition-transform">🗑️</span> Thùng rác
            </button>
          </div>
        </aside>

        {/* NỘI DUNG MÀN HÌNH CHÍNH */}
        <main className="flex-1 flex flex-col relative h-screen">
          
          <header className={`h-16 flex items-center justify-between px-8 shrink-0 border-b backdrop-blur-xl transition-colors duration-500 ${headerBg}`}>
            <div className={`flex items-center gap-3 rounded-xl px-4 py-2 w-96 transition-all duration-300 ${inputWrapper}`}>
              <span className="text-slate-400 text-sm">🔍</span>
              <input 
                type="text" placeholder="Tìm kỷ niệm (Tên file)..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                className={`bg-transparent border-none outline-none w-full text-sm focus:ring-0 ${inputText}`} 
              />
            </div>

            <div className="flex items-center gap-4 md:gap-6">
              {status && <span className="text-xs text-emerald-500 font-bold animate-pulse bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">{status}</span>}
              
              <button onClick={toggleTheme} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-90 shadow-md border ${isDark ? 'bg-white/5 border-white/10 text-yellow-300 hover:bg-white/10' : 'bg-white border-slate-200 text-indigo-500 hover:bg-slate-50'}`} title="Đổi giao diện Sáng/Tối">
                {isDark ? '🌞' : '🌙'}
              </button>

              <button onClick={handleRegisterFaceID} className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-sm ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'}`}>📸 FaceID</button>
              <button onClick={onLock} className={`text-xs font-semibold px-4 py-2 rounded-xl transition-all hover:scale-105 active:scale-95 shadow-sm ${isDark ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200'}`}>[→ Khóa Két</button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-8 pb-12 custom-scrollbar">
            
            {/* Box Upload */}
            {activeTab === 'all' && !searchQuery && (
              <div className="mb-12 mt-8 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-end justify-between mb-4">
                  <div>
                    <h2 className={`text-3xl font-extrabold flex items-center gap-3 ${textHeading}`}>
                      Vùng an toàn 
                      <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase tracking-widest border ${isDark ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-indigo-100 text-indigo-600 border-indigo-200'}`}>Riêng tư</span>
                    </h2>
                    <p className={`text-sm mt-2 ${textSub}`}>Chào bạn, những điều đẹp nhất đôi khi chỉ cần mình bạn biết. ✨</p>
                  </div>
                </div>

                <div className={`mt-6 w-full h-[300px] border-[2px] border-dashed rounded-3xl flex flex-col items-center justify-center text-center relative group transition-all duration-300 backdrop-blur-md ${uploadBox}`}>
                  <div className="w-16 h-16 mb-4 relative drop-shadow-xl">
                    <span className="text-5xl absolute inset-0 flex items-center justify-center group-hover:scale-125 group-hover:-translate-y-3 transition-all duration-500">☁️</span>
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${textHeading}`}>Thả ảnh bí mật vào đây 🤫</h3>
                  <p className={`text-xs mb-6 ${textSub}`}>Kéo thả những khoảnh khắc của bạn, phần còn lại để {vaultName} lo.</p>
                  
                  <div className="flex flex-col items-center gap-4">
                    <button onClick={() => fileInputRef.current?.click()} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg hover:shadow-indigo-500/50 transition-all flex items-center gap-2">
                      + Chọn ảnh từ máy
                    </button>
                    <input type="file" accept="image/*,video/*" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                    
                    <div className="flex items-center gap-3">
                      <label className={`flex items-center gap-2 cursor-pointer text-xs font-semibold hover:opacity-80 transition-opacity ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                        <input type="checkbox" checked={isUploadPrivate} onChange={(e) => setIsUploadPrivate(e.target.checked)} className="rounded border-slate-400 text-rose-500 focus:ring-0 transition-all w-4 h-4"/>
                        Bảo vệ cấp 2 (Tuyệt Mật)
                      </label>
                      {isUploadPrivate && (
                        <input type="password" placeholder="Mật khẩu khóa ảnh..." value={uploadLevel2Key} onChange={(e) => setUploadLevel2Key(e.target.value)} className={`w-40 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-400 transition-all ${isDark ? 'bg-black/60 border border-slate-600 text-white' : 'bg-white border border-slate-300 text-slate-800 shadow-inner'}`}/>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Thanh công cụ Chọn Loạt */}
            {selectedFiles.length > 0 && (
              <div className="sticky top-4 z-30 mb-8 flex items-center justify-between p-4 bg-indigo-600/90 backdrop-blur-xl border border-indigo-400/50 rounded-2xl shadow-[0_10px_40px_rgba(79,70,229,0.3)] animate-in slide-in-from-top-4">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-white">Đã chọn: {selectedFiles.length} mục</span>
                  <button onClick={() => setSelectedFiles([])} className="text-xs bg-white/20 hover:bg-white/30 active:scale-95 text-white px-4 py-2 rounded-lg transition-all font-semibold">Hủy chọn</button>
                </div>
                <div className="flex items-center gap-2">
                  {activeTab === 'trash' ? (
                    <>
                      <button onClick={handleBatchRestore} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all">♻️ Khôi phục</button>
                      <button onClick={handleBatchDelete} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all">☠️ Tiêu hủy</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setShowColMenuFor('batch')} className="px-5 py-2 bg-white/20 hover:bg-white/30 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all">➕ Thêm vào BST</button>
                      <button onClick={handleBatchDownload} className="px-5 py-2 bg-blue-500 hover:bg-blue-400 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all">⬇️ Tải xuống</button>
                      <button onClick={handleBatchDelete} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-lg transition-all">🗑️ Xóa</button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 mt-8 gap-4">
              <h2 className={`text-2xl font-extrabold uppercase tracking-wider ${textHeading}`}>
                {searchQuery ? `Tìm kiếm: "${searchQuery}"` : activeTab === 'all' ? 'Kho báu của bạn' : activeTab === 'favorites' ? 'Mục Yêu Thích' : activeTab === 'trash' ? 'Thùng Rác' : `Bộ Sưu Tập: ${activeTab}`}
              </h2>
              {activeTab !== 'all' && activeTab !== 'favorites' && activeTab !== 'trash' && !searchQuery && (
                <button onClick={() => setActiveTab('all')} className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white text-sm font-bold rounded-xl shadow-lg transition-all">
                  + Về Kho lấy thêm ảnh
                </button>
              )}
            </div>

            {/* Grid Ảnh */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {displayImages.map((item, index) => (
                <div key={index} className={`group relative aspect-[4/3] rounded-[1.2rem] overflow-hidden cursor-pointer transition-all duration-300 shadow-lg hover:-translate-y-1 hover:shadow-2xl ${cardBg}`}>
                  
                  {/* LABEL VIDEO/ẢNH GÓC TRÁI TRÊN */}
                  <div className="absolute top-3 left-3 z-20 pointer-events-none opacity-90 group-hover:opacity-100 transition-opacity">
                    {isVideoFile(item) ? (
                      <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md border border-white/20 text-white text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg">
                        ▶️ VIDEO
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-md border border-white/20 text-white text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg">
                        🖼️ ẢNH
                      </span>
                    )}
                  </div>

                  <div className="w-full h-full absolute inset-0">
                    {item.thumb ? (
                      <img src={item.thumb} alt="thumb" className="w-full h-full object-cover blur-xl scale-125 group-hover:scale-150 transition-transform duration-700" />
                    ) : item.src ? (
                      item.src.startsWith('data:video') ? (
                        <video src={item.src} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <img src={item.src} alt="media" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      )
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center text-xs animate-pulse ${isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-200 text-slate-400'}`}>Đang tải...</div>
                    )}
                  </div>

                  {/* LỚP PHỦ TỐI MÀU MỖI KHI HOVER ĐỂ HIỂN THỊ NÚT TRẮNG */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4 z-10">
                    <div className="flex justify-between">
                      <input 
                        type="checkbox" 
                        checked={selectedFiles.includes(item.filename)}
                        onChange={(e) => { e.stopPropagation(); toggleSelectFile(item.filename); }}
                        className="w-5 h-5 rounded border-2 border-white/80 text-indigo-500 focus:ring-0 bg-black/50 cursor-pointer shadow-lg checked:border-indigo-500 transition-all hover:scale-110 active:scale-95"
                      />
                      <div className="flex gap-2">
                        
                        {activeTab !== 'all' && activeTab !== 'favorites' && activeTab !== 'trash' ? (
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveFromCollection(activeTab, item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-rose-500 text-white text-xs transition-all hover:scale-110 active:scale-90 shadow-xl" title="Rút khỏi Bộ sưu tập này">➖</button>
                        ) : activeTab === 'all' ? (
                          <button onClick={(e) => { e.stopPropagation(); setShowColMenuFor(item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-indigo-500 text-white text-xs transition-all hover:scale-110 active:scale-90 shadow-xl" title="Thêm vào Bộ sưu tập">📁</button>
                        ) : null}

                        {activeTab !== 'trash' && (
                          <button 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if(item.is_private) {
                                 if(!item.src) {
                                    const pwd = window.prompt("Nhập mật khẩu cấp 2 để MỞ KHÓA TẠM THỜI:");
                                    if(pwd) handleUnlockSinglePrivate(item.filename, pwd);
                                 } else handleTogglePrivacy(item);
                              } else {
                                 const pwd = window.prompt("Nhập mật khẩu để KHÓA TUYỆT MẬT ảnh này:");
                                 if (pwd) handleTogglePrivacy(item, pwd);
                              }
                            }} 
                            className={`w-8 h-8 flex items-center justify-center rounded-full backdrop-blur-md border border-white/10 transition-all text-xs shadow-xl hover:scale-110 active:scale-90 ${item.is_private ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-black/70 hover:bg-slate-600 text-white'}`}
                            title={item.is_private ? (item.src ? "Đang khóa. Bấm để gỡ bỏ lớp mã hóa" : "Bấm để nhập mật khẩu giải mã") : "Bấm để khóa tuyệt mật cấp 2"}
                          >
                            {item.is_private ? '🔒' : '🔓'}
                          </button>
                        )}

                        {activeTab !== 'trash' && (
                          <button onClick={(e) => { e.stopPropagation(); toggleFavorite(item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-rose-500 text-xs transition-all shadow-xl hover:scale-110 active:scale-90">
                            {favorites.includes(item.filename) ? '❤️' : '🤍'}
                          </button>
                        )}
                        
                        {activeTab !== 'trash' ? (
                          <button onClick={(e) => { e.stopPropagation(); handleSoftDelete(item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-rose-500 text-white text-xs transition-all shadow-xl hover:scale-110 active:scale-90" title="Chuyển vào thùng rác">🗑️</button>
                        ) : (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleRestore(item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-emerald-500 text-white text-xs transition-all shadow-xl hover:scale-110 active:scale-90" title="Khôi phục">♻️</button>
                            <button onClick={(e) => { e.stopPropagation(); handleHardDelete(item.filename); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/70 backdrop-blur-md border border-white/10 hover:bg-rose-600 text-white text-xs transition-all shadow-xl hover:scale-110 active:scale-90" title="Xóa vĩnh viễn">☠️</button>
                          </>
                        )}
                      </div>
                    </div>

                    {item.src && (
                      <button onClick={(e) => { e.stopPropagation(); setViewingImage(item.src!); }} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-2.5 bg-white/20 hover:bg-indigo-500 active:scale-90 backdrop-blur-md rounded-xl text-white text-sm font-bold opacity-0 group-hover:opacity-100 transition-all scale-75 hover:scale-110 shadow-2xl border border-white/30">
                        Phóng To
                      </button>
                    )}

                    <div className="mt-auto pointer-events-none transform translate-y-3 group-hover:translate-y-0 transition-transform duration-300">
                      <p className="text-white text-sm font-bold truncate leading-tight drop-shadow-lg mb-1.5">{item.filename.replace('.enc', '')}</p>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider shadow-md ${item.is_private ? 'bg-rose-500 text-white' : 'bg-slate-600/90 text-slate-200'}`}>
                          {item.is_private ? '🔒 Tuyệt mật' : '📁 Công khai'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {displayImages.length === 0 && (
              <div className="text-center py-40 flex flex-col items-center">
                <span className="text-6xl mb-6 opacity-40 animate-bounce">📭</span>
                <p className={`text-base font-medium ${textSub}`}>{searchQuery ? 'Không tìm thấy kỷ niệm nào khớp tên.' : 'Két sắt đang trống trải.'}</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* POPUP BỘ SƯU TẬP (GIỮ GIAO DIỆN TỐI) */}
      {showColMenuFor && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in" onClick={() => setShowColMenuFor(null)}>
          <div className="bg-[#13161E] border border-white/10 rounded-3xl p-8 w-full max-w-sm shadow-2xl scale-100 transition-transform" onClick={e => e.stopPropagation()}>
            <h3 className="text-white font-extrabold mb-6 text-xl flex items-center gap-3"><span>📁</span> Chọn Bộ Sưu Tập</h3>
            {Object.keys(collections).length === 0 ? (
              <p className="text-sm text-slate-400 mb-8 bg-white/5 p-4 rounded-xl text-center">Bạn chưa có bộ sưu tập nào.</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2 mb-8">
                {Object.keys(collections).map(col => (
                  <button key={col} onClick={() => executeAddToCollection(col)} className="w-full text-left px-5 py-4 rounded-2xl bg-white/5 hover:bg-indigo-500 hover:shadow-lg active:scale-95 text-slate-300 hover:text-white transition-all flex justify-between items-center group">
                    <span className="truncate font-bold text-base">{col}</span>
                    <span className="text-xs bg-black/30 px-3 py-1 rounded-lg opacity-50 group-hover:opacity-100 transition-opacity font-mono">{collections[col].length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-4 pt-6 border-t border-white/10">
              <button onClick={() => setShowColMenuFor(null)} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:bg-white/10 active:scale-95 transition-all">Hủy</button>
              <button onClick={() => { setShowColMenuFor(null); handleCreateCollection(); }} className="px-6 py-2.5 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold active:scale-95 transition-all shadow-lg shadow-indigo-500/30">+ Tạo Mới</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Xem Ảnh/Video */}
      {viewingImage && (
        <div className="fixed inset-0 bg-black/95 z-[9999] flex items-center justify-center p-8 backdrop-blur-3xl animate-in fade-in duration-200" onClick={() => setViewingImage(null)}>
          <button onClick={() => setViewingImage(null)} className="absolute top-6 right-8 text-slate-400 hover:text-white text-5xl font-light hover:scale-125 active:scale-90 transition-all">&times;</button>
          {viewingImage.startsWith('data:video') ? (
            <video src={viewingImage} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()} />
          ) : (
            <img src={viewingImage} alt="Full size" className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_100px_rgba(0,0,0,0.8)] border border-white/10 animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(100,116,139,0.3); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(100,116,139,0.5); }
      `}} />
    </div>
  );
}