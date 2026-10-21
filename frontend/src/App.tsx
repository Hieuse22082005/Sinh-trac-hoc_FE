import { useState } from 'react';
import CryptoJS from 'crypto-js';
import { encryptFile, decryptFile } from './utils/cryptoService';
import { generateBlurredThumbnail } from './utils/mediaHelper';
import MediaCard from './components/MediaCard';
import type { SecureImage } from './types';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

// Từ điển sinh từ ngẫu nhiên
const WORD_LIST = ["apple", "bear", "cat", "dog", "eagle", "fire", "gold", "hero", "iron", "jump", "king", "lion", "moon", "nest", "ocean", "pine", "queen", "rose", "star", "tree", "unit", "vine", "wolf", "xray", "yarn", "zero", "sun", "sky", "sea", "wind", "rain"];

function App() {
  // Master Key: 5 từ
  const [seedWords, setSeedWords] = useState<string[]>(Array(5).fill(''));
  const masterKeyString = seedWords.join(' ').trim().toLowerCase();

  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [images, setImages] = useState<SecureImage[]>([]);
  const [status, setStatus] = useState<string>('');
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploadPrivate, setIsUploadPrivate] = useState<boolean>(false);
  // Upload Private Key: Trở về Mật khẩu chuỗi bình thường
  const [uploadLevel2Key, setUploadLevel2Key] = useState<string>('');

  // Sinh 5 từ ngẫu nhiên cho Két mới
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

  // NÂNG CẤP: Nhận thêm tham số overrideKey để hỗ trợ FaceID tự động mở khóa
  const handleUnlockMaster = async (overrideKey?: string | React.MouseEvent) => {
    const isAutoLogin = typeof overrideKey === 'string';
    const activeKey = isAutoLogin ? overrideKey : masterKeyString;

    if (!isAutoLogin && seedWords.some(w => w === '')) return alert("Vui lòng nhập đủ 5 từ khóa!");
    
    setStatus("Đang tải thư viện...");
    setImages([]);
    
    try {
      const walletAddress = CryptoJS.SHA256(activeKey).toString();
      
      const res = await fetch(`http://localhost:8000/photos?wallet_address=${walletAddress}`);
      const data = await res.json();
      const dbPhotos: {filename: string, is_private: boolean, thumbnail: string}[] = data.photos;

      if (dbPhotos.length === 0) {
        setStatus("Két sắt trống. Đã tạo ví mới thành công!");
        setIsUnlocked(true);
        return;
      }

      const processedImages: SecureImage[] = [];
      let successCount = 0;
      
      for (const item of dbPhotos) {
        if (item.is_private) {
          let decryptedThumb = null;
          if (item.thumbnail) {
            try {
              const bytes = CryptoJS.AES.decrypt(item.thumbnail, activeKey);
              decryptedThumb = bytes.toString(CryptoJS.enc.Utf8);
            } catch(e) {}
          }
          processedImages.push({ filename: item.filename, src: null, thumb: decryptedThumb, is_private: true });
        } else {
          try {
            const fileRes = await fetch(`http://localhost:8000/download/${item.filename}`);
            if (fileRes.ok) {
              const blob = await fileRes.blob();
              const base64Data = await decryptFile(blob, activeKey);
              processedImages.push({ filename: item.filename, src: base64Data, thumb: null, is_private: false });
              successCount++;
            }
          } catch (err) {}
        }
      }

      if (successCount === 0 && dbPhotos.filter(p => !p.is_private).length > 0) {
        setStatus("❌ 5 từ khôi phục không đúng!");
        return;
      }

      setImages(processedImages);
      setIsUnlocked(true);
      setStatus("✅ Mở thư viện thành công!");
    } catch (error) {
      setStatus("Lỗi kết nối máy chủ.");
    }
  };

  // ==========================================
  // API WEBAUTHN / FIDO2 (QUÉT KHUÔN MẶT)
  // ==========================================
  const handleRegisterFaceID = async () => {
    setStatus("Đang bật Camera/Cảm biến sinh trắc học...");
    try {
      const walletAddress = CryptoJS.SHA256(masterKeyString).toString();
      
      // 1. Xin máy chủ bài test nhận diện
      const resOpt = await fetch('http://localhost:8000/webauthn/register/generate', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ wallet_address: walletAddress })
      });
      const options = await resOpt.json();

      // 2. Kích hoạt phần cứng thiết bị (FaceID / Windows Hello)
      const attResp = await startRegistration(options);

      // 3. Gửi chữ ký lên máy chủ
      const resVerify = await fetch('http://localhost:8000/webauthn/register/verify', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ wallet_address: walletAddress, credential: attResp })
      });

      if (resVerify.ok) {
        // Lưu lại Key để lần sau mở khóa không cần gõ 5 từ
        localStorage.setItem(`vault_key_${walletAddress}`, masterKeyString);
        localStorage.setItem(`last_wallet_address`, walletAddress);
        setStatus("✅ Đã liên kết sinh trắc học thiết bị này!");
      }
    } catch (error) {
      setStatus("❌ Lỗi thiết lập sinh trắc học hoặc đã hủy.");
    }
  };

  const handleLoginWithFaceID = async () => {
    setStatus("Đang kích hoạt nhận diện khuôn mặt...");
    try {
      // Lấy địa chỉ ví sử dụng gần nhất trên trình duyệt này
      const walletAddress = localStorage.getItem('last_wallet_address');
      if (!walletAddress) {
        setStatus("❌ Thiết bị này chưa liên kết với Két sắt nào. Hãy đăng nhập bằng 5 từ khóa và liên kết!");
        return;
      }

      // 1. Xin máy chủ bài test đăng nhập
      const resOpt = await fetch('http://localhost:8000/webauthn/auth/generate', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ wallet_address: walletAddress })
      });
      const options = await resOpt.json();

      // 2. Bật Camera / Cảm biến vân tay
      const asseResp = await startAuthentication(options);

      // 3. Máy chủ xác minh chữ ký phần cứng
      const resVerify = await fetch('http://localhost:8000/webauthn/auth/verify', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ wallet_address: walletAddress, credential: asseResp })
      });

      if (resVerify.ok) {
        // Rút Key từ kho bí mật của trình duyệt
        const savedKey = localStorage.getItem(`vault_key_${walletAddress}`);
        if (savedKey) {
           // Tự động điền 5 từ vào giao diện
           setSeedWords(savedKey.split(' '));
           // Mở khóa Két luôn
           await handleUnlockMaster(savedKey); 
           setStatus("✅ Đăng nhập sinh trắc học thành công!");
        } else {
           setStatus("❌ Dữ liệu khôi phục bị mất, vui lòng đăng nhập bằng tay.");
        }
      } else {
        setStatus("❌ Xác thực chữ ký máy chủ thất bại.");
      }
    } catch (error) {
      setStatus("❌ Xác thực sinh trắc học thất bại hoặc đã hủy.");
    }
  };
  // ==========================================

  const handleUpload = async () => {
    if (!file) return alert("Vui lòng chọn file!");
    if (isUploadPrivate && !uploadLevel2Key) return alert("Vui lòng nhập mật khẩu tuyệt mật!");

    try {
      setStatus("Đang mã hóa...");
      const keyToUse = isUploadPrivate ? uploadLevel2Key : masterKeyString;
      const walletAddress = CryptoJS.SHA256(masterKeyString).toString();
      
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

      if (response.ok) {
        setStatus("✅ Đã cất an toàn!");
        setFile(null);
        setUploadLevel2Key('');
        handleUnlockMaster();
      }
    } catch (error) {
      setStatus("Lỗi mã hóa!");
    }
  };

  const handleUnlockSinglePrivate = async (filename: string, specificKey: string) => {
    setStatus(`Đang giải mã...`);
    try {
      const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
      if (!fileRes.ok) throw new Error();
      const blob = await fileRes.blob();
      const base64Data = await decryptFile(blob, specificKey);
      setImages(prevImages => prevImages.map(img => img.filename === filename ? { ...img, src: base64Data } : img));
      setStatus("✅ Mở khóa thành công!");
    } catch (error) {
      alert("Mật khẩu riêng không chính xác!");
      setStatus("❌ Sai mật khẩu!");
    }
  };

  const handleDelete = async (filename: string) => {
    const item = images.find(img => img.filename === filename);
    if (!item) return;

    if (item.is_private) {
      const filePass = window.prompt("🔒 KHÓA BẢO VỆ\nFile này là TUYỆT MẬT. Bạn phải nhập chính xác MẬT KHẨU RIÊNG của file này để được phép tiêu hủy:");
      if (!filePass) return;

      setStatus(`Đang xác thực mật khẩu riêng...`);
      try {
        const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
        if (!fileRes.ok) throw new Error();
        const blob = await fileRes.blob();
        await decryptFile(blob, filePass); 
      } catch (error) {
        alert("❌ Sai mật khẩu riêng! Két sắt từ chối yêu cầu tiêu hủy.");
        setStatus("❌ Xóa thất bại do sai mật khẩu file.");
        return; 
      }
    }

    const pass = window.prompt("⚠️ CẢNH BÁO BẢO MẬT\nNhập MẬT KHẨU XÓA HỆ THỐNG:");
    if (!pass) return;
    
    setStatus(`Đang xác thực và xóa file...`);
    try {
      const response = await fetch(`http://localhost:8000/delete/${filename}?delete_pass=${encodeURIComponent(pass)}`, { method: 'DELETE' });
      if (response.ok) {
        setImages(prevImages => prevImages.filter(img => img.filename !== filename));
        setStatus("✅ Đã xóa file vĩnh viễn!");
      } else if (response.status === 403) {
        alert("❌ SAI MẬT KHẨU XÓA HỆ THỐNG!");
      }
    } catch (error) {
      setStatus("❌ Lỗi kết nối khi xóa!");
    }
  };

  const handleTogglePrivacy = async (item: SecureImage, newPassword?: string) => {
    if (!item.src) return; 
    setStatus("Đang chuyển đổi trạng thái bảo mật...");
    
    try {
      const response = await fetch(item.src);
      const blob = await response.blob();
      const fileObj = new File([blob], `toggle_${item.filename}`, { type: blob.type });

      const isMakingPrivate = newPassword !== undefined;
      const keyToUse = isMakingPrivate ? newPassword : masterKeyString;
      const walletAddress = CryptoJS.SHA256(masterKeyString).toString();

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
      
      const sysDeletePass = import.meta.env.VITE_DELETE_PASSWORD || 'admin123';
      await fetch(`http://localhost:8000/delete/${item.filename}?delete_pass=${sysDeletePass}`, { method: 'DELETE' });

      setStatus("✅ Đã chuyển đổi trạng thái thành công!");
      handleUnlockMaster(); 
    } catch (error) {
      setStatus("❌ Lỗi quá trình chuyển đổi!");
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Ví Két Sắt (Web3 Standard)</h1>

      {!isUnlocked ? (
        <div style={{ border: '2px solid #ccc', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '500px', margin: '50px auto', backgroundColor: '#f9f9f9' }}>
          <h2>Mở Khóa Ví Lớp Ngoài</h2>
          
          <button onClick={generateRandomSeed} style={{ padding: '8px 12px', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginBottom: '15px' }}>
            🎲 Nhấp để tạo Ví Mới (5 từ ngẫu nhiên)
          </button>
          
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>Hoặc dán 5 từ khóa của bạn vào ô đầu tiên để khôi phục.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '20px' }}>
            {seedWords.map((word, idx) => (
              <div key={idx}>
                <input
                  type="text"
                  placeholder={`#${idx+1}`}
                  value={word}
                  onChange={(e) => {
                    const newArr = [...seedWords];
                    newArr[idx] = e.target.value.toLowerCase().trim();
                    setSeedWords(newArr);
                  }}
                  onPaste={idx === 0 ? handlePasteMaster : undefined}
                  style={{ padding: '6px', width: '100%', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px', textAlign: 'center', fontSize: '12px' }}
                />
              </div>
            ))}
          </div>

          <button onClick={handleUnlockMaster} style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>
            🔑 Truy Cập Ví (Bằng 5 Từ Khóa)
          </button>

          <hr style={{ margin: '20px 0', borderTop: '1px dashed #ccc' }} />

          <button onClick={handleLoginWithFaceID} style={{ padding: '12px 24px', backgroundColor: '#000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '100%', fontWeight: 'bold' }}>
            📷 Mở Khóa Nhanh Bằng Sinh Trắc Học
          </button>

          <p style={{ color: 'blue', fontWeight: 'bold', marginTop: '10px', fontSize: '14px' }}>{status}</p>
        </div>
      ) : (
        <div style={{ padding: '20px', border: '2px solid #28a745', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>🔓 Két Sắt Của Bạn</h2>
            <div>
              <button onClick={handleRegisterFaceID} style={{ marginRight: '10px', padding: '8px 16px', backgroundColor: '#17a2b8', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                📸 Liên kết Sinh Trắc
              </button>
              <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                🔒 Đóng Ví
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Cất thêm File (Ảnh/Video): </strong>
            <input type="file" accept="image/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            
            <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id="priv" checked={isUploadPrivate} onChange={(e) => setIsUploadPrivate(e.target.checked)} />
              <label htmlFor="priv" style={{ color: '#d9534f', fontWeight: 'bold' }}>File Tuyệt Mật</label>
            </div>
            
            {isUploadPrivate && (
              <input type="password" placeholder="Nhập mật khẩu khóa file này..." value={uploadLevel2Key} onChange={(e) => setUploadLevel2Key(e.target.value)} style={{ padding: '8px', width: '100%', marginBottom: '10px', boxSizing: 'border-box' }} />
            )}
            
            <button onClick={handleUpload} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>Mã Hóa & Cất Giấu</button>
            <p style={{ color: 'blue', fontSize: '14px', marginTop: '10px' }}>{status}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
            {images.map((item, index) => (
              <MediaCard 
                key={index}
                item={item}
                onUnlock={handleUnlockSinglePrivate}
                onDelete={handleDelete}
                onTogglePrivacy={handleTogglePrivacy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;