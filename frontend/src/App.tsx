import { useState } from 'react';
import CryptoJS from 'crypto-js';
import { encryptFile, decryptFile } from './utils/cryptoService';

interface SecureImage {
  filename: string;
  src: string | null;      // Ảnh gốc (Nét)
  thumb: string | null;    // Ảnh mờ (Thumbnail)
  is_private: boolean;
}

// Hàm phụ: Tự động vẽ một bản sao siêu nhỏ & mờ của bức ảnh
const generateBlurredThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // Thu nhỏ xuống 50px để nhẹ Database
        const scaleSize = 50 / img.width;
        canvas.width = 50;
        canvas.height = img.height * scaleSize;
        if(ctx) {
          ctx.filter = 'blur(2px)';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        }
        resolve(canvas.toDataURL('image/jpeg', 0.3));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

function App() {
  const [masterKey, setMasterKey] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [images, setImages] = useState<SecureImage[]>([]);
  const [status, setStatus] = useState<string>('');
  
  const [file, setFile] = useState<File | null>(null);
  const [isUploadPrivate, setIsUploadPrivate] = useState<boolean>(false);
  const [uploadLevel2Key, setUploadLevel2Key] = useState<string>('');

  const [privateInputs, setPrivateInputs] = useState<Record<string, string>>({});

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
          // Lấy ảnh MỜ giải mã bằng Master Key để làm nền
          let decryptedThumb = null;
          if (item.thumbnail) {
            try {
              const bytes = CryptoJS.AES.decrypt(item.thumbnail, masterKey);
              decryptedThumb = bytes.toString(CryptoJS.enc.Utf8);
            } catch(e) { console.error("Không giải mã được ảnh mờ"); }
          }
          processedImages.push({ filename: item.filename, src: null, thumb: decryptedThumb, is_private: true });
        } else {
          try {
            const fileRes = await fetch(`http://localhost:8000/download/${item.filename}`);
            if (fileRes.ok) {
              const blob = await fileRes.blob();
              const base64Img = await decryptFile(blob, masterKey);
              processedImages.push({ filename: item.filename, src: base64Img, thumb: null, is_private: false });
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
    if (!file) return alert("Vui lòng chọn ảnh!");
    if (isUploadPrivate && !uploadLevel2Key) return alert("Vui lòng nhập mật khẩu riêng!");

    try {
      setStatus("Đang mã hóa nhiều lớp...");
      const keyToUse = isUploadPrivate ? uploadLevel2Key : masterKey;
      
      // 1. Mã hóa ảnh GỐC
      const encryptedBlob = await encryptFile(file, keyToUse);
      
      // 2. Tạo và mã hóa ảnh MỜ (Dùng Master Key)
      let encryptedThumb = '';
      if (isUploadPrivate) {
        const thumbBase64 = await generateBlurredThumbnail(file);
        encryptedThumb = CryptoJS.AES.encrypt(thumbBase64, masterKey).toString();
      }
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');
      formData.append('is_private', isUploadPrivate ? 'true' : 'false');
      formData.append('thumbnail', encryptedThumb);

      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST', body: formData,
      });

      if (response.ok) {
        setStatus("✅ Đã cất ảnh an toàn!");
        setFile(null);
        setUploadLevel2Key('');
        handleUnlockMaster();
      }
    } catch (error) {
      setStatus("Lỗi mã hóa!");
    }
  };

  const handleUnlockSinglePrivate = async (filename: string) => {
    const specificKey = privateInputs[filename];
    if (!specificKey) return alert("Vui lòng nhập mật khẩu!");

    setStatus(`Đang giải mã...`);
    try {
      const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
      if (!fileRes.ok) throw new Error();

      const blob = await fileRes.blob();
      const base64Img = await decryptFile(blob, specificKey);

      setImages(prevImages => prevImages.map(img => 
        img.filename === filename ? { ...img, src: base64Img } : img
      ));
      setStatus("✅ Đã hiển thị ảnh nét căng!");
    } catch (error) {
      alert("Sai mật khẩu cấp 2!");
      setStatus("❌ Sai mật khẩu!");
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Két Sắt Ảnh Đa Lớp</h1>

      {!isUnlocked ? (
        <div style={{ border: '2px solid #ccc', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', margin: '50px auto' }}>
          <h2>🔒 Lớp Ngoài</h2>
          <input type="password" placeholder="Nhập Master Key" value={masterKey} onChange={(e) => setMasterKey(e.target.value)} style={{ padding: '10px', width: '90%', marginBottom: '20px' }} />
          <button onClick={handleUnlockMaster} style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '95%' }}>
            Truy Cập Thư Viện
          </button>
          <p style={{ color: 'red', fontWeight: 'bold' }}>{status}</p>
        </div>
      ) : (
        <div style={{ padding: '20px', border: '2px solid #28a745', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>🔓 Thư Viện Của Bạn</h2>
            <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Khóa Két</button>
          </div>

          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Cất thêm ảnh: </strong>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            
            <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input type="checkbox" id="priv" checked={isUploadPrivate} onChange={(e) => setIsUploadPrivate(e.target.checked)} />
              <label htmlFor="priv" style={{ color: '#d9534f', fontWeight: 'bold' }}>Ảnh Tuyệt Mật</label>
            </div>
            
            {isUploadPrivate && (
              <input type="password" placeholder="Nhập mật khẩu khóa bức ảnh này..." value={uploadLevel2Key} onChange={(e) => setUploadLevel2Key(e.target.value)} style={{ padding: '8px', width: '100%', marginBottom: '10px', boxSizing: 'border-box' }} />
            )}
            
            <button onClick={handleUpload} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Mã Hóa & Cất Giấu</button>
            <p style={{ color: 'blue', fontSize: '14px' }}>{status}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
            {images.map((img, index) => (
              <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', height: '250px', position: 'relative', backgroundColor: '#000' }}>
                
                {/* 1. NẾU ẢNH CHƯA ĐƯỢC MỞ: HIỂN THỊ NỀN MỜ VÀ FORM NHẬP PASS */}
                {!img.src && img.is_private && (
                  <>
                    {/* Lớp ảnh mờ ở dưới cùng */}
                    {img.thumb && (
                      <img src={img.thumb} alt="blurred" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.1)', opacity: 0.6, position: 'absolute', top: 0, left: 0 }} />
                    )}
                    
                    {/* Khung giao diện đè lên trên ảnh mờ */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: '10px' }}>
                      <span style={{ fontSize: '40px' }}>🔒</span>
                      <p style={{ margin: '5px 0 15px 0', fontSize: '14px', color: '#fff', fontWeight: 'bold' }}>Cần Mật Khẩu</p>
                      
                      <input 
                        type="password" 
                        placeholder="Mật khẩu riêng" 
                        value={privateInputs[img.filename] || ''} 
                        onChange={(e) => setPrivateInputs({...privateInputs, [img.filename]: e.target.value})}
                        style={{ padding: '8px', width: '90%', marginBottom: '10px', boxSizing: 'border-box', textAlign: 'center', borderRadius: '4px', border: 'none' }} 
                      />
                      
                      <button 
                        onClick={() => handleUnlockSinglePrivate(img.filename)}
                        style={{ padding: '8px 12px', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '90%', fontWeight: 'bold' }}
                      >
                        Mở Khóa Nét
                      </button>
                    </div>
                  </>
                )}

                {/* 2. NẾU ẢNH ĐÃ ĐƯỢC MỞ (HOẶC LÀ ẢNH THƯỜNG): HIỆN RÕ NÉT CĂNG */}
                {img.src && (
                  <img src={img.src} alt={`secure-img-${index}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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