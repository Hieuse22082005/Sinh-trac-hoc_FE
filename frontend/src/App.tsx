import { useState } from 'react';
import { encryptFile, decryptFile } from './utils/cryptoService';

// Định nghĩa cấu trúc dữ liệu cho 1 bức ảnh trong Két
interface SecureImage {
  filename: string;
  src: string | null;
  is_private: boolean;
}

function App() {
  const [masterKey, setMasterKey] = useState<string>('');
  const [level2Key, setLevel2Key] = useState<string>(''); // Chìa khóa cấp 2
  
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [images, setImages] = useState<SecureImage[]>([]);
  const [status, setStatus] = useState<string>('');
  
  // State upload
  const [file, setFile] = useState<File | null>(null);
  const [isUploadPrivate, setIsUploadPrivate] = useState<boolean>(false); // Checkbox bật pass cấp 2

  // --- HÀM 1: MỞ KÉT (Chỉ giải mã ảnh thường) ---
  const handleUnlockMaster = async () => {
    if (!masterKey) return alert("Vui lòng nhập Master Key!");
    setStatus("Đang mở két và tải dữ liệu...");
    setImages([]);
    
    try {
      const res = await fetch('http://localhost:8000/photos');
      const data = await res.json();
      const dbPhotos: {filename: string, is_private: boolean}[] = data.photos;

      if (dbPhotos.length === 0) {
        setStatus("Két sắt trống.");
        setIsUnlocked(true);
        return;
      }

      const processedImages: SecureImage[] = [];
      let successCount = 0;
      
      for (const item of dbPhotos) {
        if (item.is_private) {
          // Nếu là ảnh cấp 2, KHÔNG giải mã ngay, chỉ lưu giữ chỗ (placeholder)
          processedImages.push({ filename: item.filename, src: null, is_private: true });
        } else {
          // Nếu là ảnh cấp 1, dùng Master Key giải mã
          try {
            const fileRes = await fetch(`http://localhost:8000/download/${item.filename}`);
            if (fileRes.ok) {
              const blob = await fileRes.blob();
              const base64Img = await decryptFile(blob, masterKey);
              processedImages.push({ filename: item.filename, src: base64Img, is_private: false });
              successCount++;
            }
          } catch (err) {
            console.error("Master key không giải mã được file này");
          }
        }
      }

      if (successCount === 0 && dbPhotos.filter(p => !p.is_private).length > 0) {
        setStatus("❌ Sai Master Key!");
        return;
      }

      setImages(processedImages);
      setIsUnlocked(true);
      setStatus("✅ Mở két cấp 1 thành công!");
    } catch (error) {
      setStatus("Lỗi kết nối máy chủ.");
    }
  };

  // --- HÀM 2: MỞ KHÓA ẢNH CẤP 2 ---
  const handleUnlockLevel2 = async () => {
    if (!level2Key) return alert("Vui lòng nhập mật khẩu cấp 2!");
    setStatus("Đang giải mã ảnh tuyệt mật...");
    
    const updatedImages = [...images];
    let successCount = 0;

    for (let i = 0; i < updatedImages.length; i++) {
      const img = updatedImages[i];
      if (img.is_private && !img.src) {
        try {
          const fileRes = await fetch(`http://localhost:8000/download/${img.filename}`);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            // Dùng Mật khẩu cấp 2 để giải mã
            const base64Img = await decryptFile(blob, level2Key);
            updatedImages[i].src = base64Img; // Lắp ảnh thật vào placeholder
            successCount++;
          }
        } catch (err) {
          console.error("Sai pass cấp 2 cho file", img.filename);
        }
      }
    }

    if (successCount > 0) {
      setImages(updatedImages);
      setStatus(`✅ Đã giải mã thành công ${successCount} ảnh tuyệt mật!`);
    } else {
      setStatus("❌ Mật khẩu cấp 2 không đúng!");
    }
  };

  // --- HÀM 3: TẢI ẢNH LÊN ---
  const handleUpload = async () => {
    if (!file) return alert("Vui lòng chọn ảnh!");
    
    try {
      setStatus("Đang mã hóa...");
      // Nếu là ảnh tuyệt mật -> dùng Pass Cấp 2. Nếu ảnh thường -> dùng Master Key
      const keyToUse = isUploadPrivate ? level2Key : masterKey;
      
      if (isUploadPrivate && !level2Key) {
        return alert("Vui lòng nhập Mật khẩu cấp 2 để khóa bức ảnh này!");
      }

      const encryptedBlob = await encryptFile(file, keyToUse);
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', isUploadPrivate ? 'true' : 'false');

      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST', body: formData,
      });

      if (response.ok) {
        setStatus("✅ Đã cất ảnh an toàn!");
        setFile(null);
        handleUnlockMaster(); // Tải lại Thư viện
      }
    } catch (error) {
      setStatus("Lỗi mã hóa: " + error);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Két Sắt Đa Lớp</h1>

      {!isUnlocked ? (
        <div style={{ border: '2px solid #ccc', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', margin: '50px auto' }}>
          <h2>🔒 Lớp Ngoài (Cấp 1)</h2>
          <input type="password" placeholder="Nhập Master Key" value={masterKey} onChange={(e) => setMasterKey(e.target.value)} style={{ padding: '10px', width: '90%', marginBottom: '20px' }} />
          <button onClick={handleUnlockMaster} style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '95%' }}>
            Mở Két Sắt
          </button>
          <p style={{ color: 'red', fontWeight: 'bold' }}>{status}</p>
        </div>
      ) : (
        <div style={{ padding: '20px', border: '2px solid #28a745', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>🔓 Thư Viện</h2>
            <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px' }}>Khóa Két</button>
          </div>

          {/* KHU VỰC UPLOAD MỚI CÓ PHÂN QUYỀN */}
          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Cất thêm ảnh: </strong>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id="priv" checked={isUploadPrivate} onChange={(e) => setIsUploadPrivate(e.target.checked)} />
              <label htmlFor="priv" style={{ color: 'red', fontWeight: 'bold' }}>Ảnh Tuyệt Mật (Yêu cầu Mật khẩu cấp 2)</label>
            </div>
            
            <button onClick={handleUpload} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px' }}>Băm & Cất Giấu</button>
            <p style={{ color: 'blue', fontSize: '14px' }}>{status}</p>
          </div>

          {/* KHU VỰC MỞ KHÓA CẤP 2 DÀNH CHO ẢNH BỊ CHE */}
          {images.some(img => img.is_private && !img.src) && (
            <div style={{ marginBottom: '20px', padding: '15px', border: '2px dashed red', borderRadius: '8px', textAlign: 'center' }}>
              <p style={{ color: 'red', margin: '0 0 10px 0', fontWeight: 'bold' }}>Phát hiện có ảnh Tuyệt Mật đang bị khóa!</p>
              <input type="password" placeholder="Nhập Mật Khẩu Cấp 2" value={level2Key} onChange={(e) => setLevel2Key(e.target.value)} style={{ padding: '8px', marginRight: '10px' }} />
              <button onClick={handleUnlockLevel2} style={{ padding: '8px 16px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '5px' }}>Giải Mã Vùng Kín</button>
            </div>
          )}

          {/* LƯỚI HIỂN THỊ ẢNH */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
            {images.map((img, index) => (
              <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', height: '200px', backgroundColor: img.is_private && !img.src ? '#333' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {img.src ? (
                  <img src={img.src} alt={`secure-img-${index}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: 'white', textAlign: 'center' }}>
                    <span style={{ fontSize: '40px' }}>🔒</span>
                    <p style={{ margin: '5px 0 0 0' }}>Tuyệt Mật</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;