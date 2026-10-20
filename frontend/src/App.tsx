import { useState } from 'react';
import CryptoJS from 'crypto-js';
import { encryptFile, decryptFile } from './utils/cryptoService';
import { generateBlurredThumbnail } from './utils/mediaHelper';
import MediaCard from './components/MediaCard';
import type { SecureImage } from './types';

function App() {
  const [masterKey, setMasterKey] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [images, setImages] = useState<SecureImage[]>([]);
  const [status, setStatus] = useState<string>('');
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploadPrivate, setIsUploadPrivate] = useState<boolean>(false);
  const [uploadLevel2Key, setUploadLevel2Key] = useState<string>('');

  const handleUnlockMaster = async () => {
    if (!masterKey) return alert("Vui lòng nhập Master Key!");
    setStatus("Đang tải thư viện...");
    setImages([]);
    
    try {
      const res = await fetch('http://localhost:8000/photos');
      const data = await res.json();
      const dbPhotos: {filename: string, is_private: boolean, thumbnail: string}[] = data.photos;

      if (dbPhotos.length === 0) {
        setStatus("Két sắt trống.");
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
              const bytes = CryptoJS.AES.decrypt(item.thumbnail, masterKey);
              decryptedThumb = bytes.toString(CryptoJS.enc.Utf8);
            } catch(e) {}
          }
          processedImages.push({ filename: item.filename, src: null, thumb: decryptedThumb, is_private: true });
        } else {
          try {
            const fileRes = await fetch(`http://localhost:8000/download/${item.filename}`);
            if (fileRes.ok) {
              const blob = await fileRes.blob();
              const base64Data = await decryptFile(blob, masterKey);
              processedImages.push({ filename: item.filename, src: base64Data, thumb: null, is_private: false });
              successCount++;
            }
          } catch (err) {}
        }
      }

      if (successCount === 0 && dbPhotos.filter(p => !p.is_private).length > 0) {
        setStatus("❌ Sai Master Key!");
        return;
      }

      setImages(processedImages);
      setIsUnlocked(true);
      setStatus("✅ Mở thư viện thành công!");
    } catch (error) {
      setStatus("Lỗi kết nối máy chủ.");
    }
  };

  const handleUpload = async () => {
    if (!file) return alert("Vui lòng chọn file!");
    if (isUploadPrivate && !uploadLevel2Key) return alert("Vui lòng nhập mật khẩu riêng!");

    try {
      setStatus("Đang mã hóa...");
      const keyToUse = isUploadPrivate ? uploadLevel2Key : masterKey;
      const encryptedBlob = await encryptFile(file, keyToUse);
      
      let encryptedThumb = '';
      if (isUploadPrivate) {
        const thumbBase64 = await generateBlurredThumbnail(file);
        if (thumbBase64) encryptedThumb = CryptoJS.AES.encrypt(thumbBase64, masterKey).toString();
      }
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', isUploadPrivate ? 'true' : 'false');
      formData.append('thumbnail', encryptedThumb);

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
    if (!specificKey) return alert("Vui lòng nhập mật khẩu!");
    setStatus(`Đang giải mã...`);
    try {
      const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
      if (!fileRes.ok) throw new Error();

      const blob = await fileRes.blob();
      const base64Data = await decryptFile(blob, specificKey);

      setImages(prevImages => prevImages.map(img => img.filename === filename ? { ...img, src: base64Data } : img));
      setStatus("✅ Mở khóa thành công!");
    } catch (error) {
      alert("Sai mật khẩu cấp 2!");
      setStatus("❌ Sai mật khẩu!");
    }
  };

  const handleDelete = async (filename: string) => {
    const isConfirm = window.confirm("Bạn có chắc chắn muốn xóa file này vĩnh viễn không?");
    if (!isConfirm) return;

    setStatus(`Đang xóa file...`);
    try {
      const response = await fetch(`http://localhost:8000/delete/${filename}`, { method: 'DELETE' });
      if (response.ok) {
        setImages(prevImages => prevImages.filter(img => img.filename !== filename));
        setStatus("✅ Đã xóa file thành công!");
      } else setStatus("❌ Lỗi khi xóa file!");
    } catch (error) {
      setStatus("❌ Lỗi kết nối mạng khi xóa!");
    }
  };

  const handleChangePassword = async (item: SecureImage) => {
    if (!item.src) return; 
    const newPassword = window.prompt("Nhập MẬT KHẨU CẤP 2 MỚI cho file này:");
    if (!newPassword) return; 

    setStatus("Đang thực hiện đổi mật khẩu ngầm...");
    try {
      const response = await fetch(item.src);
      const blob = await response.blob();
      const fileObj = new File([blob], `recovered_${item.filename}`, { type: blob.type });

      const encryptedBlob = await encryptFile(fileObj, newPassword);
      const thumbBase64 = await generateBlurredThumbnail(fileObj);
      const encryptedThumb = CryptoJS.AES.encrypt(thumbBase64, masterKey).toString();

      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', 'true');
      formData.append('thumbnail', encryptedThumb);

      const uploadRes = await fetch('http://localhost:8000/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error("Lỗi khi tải lên");

      await fetch(`http://localhost:8000/delete/${item.filename}`, { method: 'DELETE' });

      setStatus("✅ Đã đổi mật khẩu cấp 2 thành công!");
      handleUnlockMaster();
    } catch (error) {
      setStatus("❌ Lỗi quá trình đổi mật khẩu!");
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Két Sắt Đa Phương Tiện</h1>

      {!isUnlocked ? (
        <div style={{ border: '2px solid #ccc', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', margin: '50px auto' }}>
          <h2>🔒 Lớp Ngoài</h2>
          <input type="password" placeholder="Nhập Master Key" value={masterKey} onChange={(e) => setMasterKey(e.target.value)} style={{ padding: '10px', width: '90%', marginBottom: '20px' }} />
          <button onClick={handleUnlockMaster} style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '95%' }}>Truy Cập Thư Viện</button>
          <p style={{ color: 'red', fontWeight: 'bold' }}>{status}</p>
        </div>
      ) : (
        <div style={{ padding: '20px', border: '2px solid #28a745', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>🔓 Thư Viện Của Bạn</h2>
            <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Khóa Két</button>
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
            <button onClick={handleUpload} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Mã Hóa & Cất Giấu</button>
            <p style={{ color: 'blue', fontSize: '14px' }}>{status}</p>
          </div>

          {/* SỬ DỤNG COMPONENT MEDIA CARD ĐÃ TÁCH */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
            {images.map((item, index) => (
              <MediaCard 
                key={index}
                item={item}
                onUnlock={handleUnlockSinglePrivate}
                onDelete={handleDelete}
                onChangePassword={handleChangePassword}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;