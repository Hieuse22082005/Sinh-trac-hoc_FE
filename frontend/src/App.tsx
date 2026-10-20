import { useState } from 'react';
import { encryptFile, decryptFile } from './utils/cryptoService';

function App() {
  const [secretKey, setSecretKey] = useState<string>('');
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [images, setImages] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('');
  
  // State cho việc tải ảnh mới
  const [file, setFile] = useState<File | null>(null);

  // --- HÀM 1: MỞ KHÓA & TẢI THƯ VIỆN ẢNH ---
  const handleUnlock = async () => {
    if (!secretKey) return alert("Vui lòng nhập chìa khóa!");
    
    setStatus("Đang mở két và giải mã dữ liệu ngầm...");
    setImages([]); // Xóa ảnh cũ trên màn hình
    
    try {
      // 1. Hỏi Backend xem trong sổ có những file nào
      const res = await fetch('http://localhost:8000/photos');
      const data = await res.json();
      const filenames = data.photos;

      if (filenames.length === 0) {
        setStatus("Két sắt hiện đang trống. Hãy thêm ảnh mới!");
        setIsUnlocked(true);
        return;
      }

      const decryptedImages: string[] = [];
      
      // 2. Tải và giải mã TỰ ĐỘNG từng file một
      for (const filename of filenames) {
        try {
          const fileRes = await fetch(`http://localhost:8000/download/${filename}`);
          if (fileRes.ok) {
            const blob = await fileRes.blob();
            // Dùng chìa khóa để dịch ngược cục blob thành ảnh Base64
            const base64Img = await decryptFile(blob, secretKey);
            decryptedImages.push(base64Img);
          }
        } catch (err) {
          console.error(`Không thể giải mã file ${filename}`);
          // Bỏ qua file bị lỗi/sai pass để không làm sập cả ứng dụng
        }
      }

      // Nếu có file mà không giải mã được tấm nào -> Chắc chắn sai mật khẩu
      if (decryptedImages.length === 0 && filenames.length > 0) {
        setStatus("❌ Sai chìa khóa! Két sắt từ chối cung cấp hình ảnh.");
        return;
      }

      setImages(decryptedImages);
      setIsUnlocked(true);
      setStatus("✅ Mở két thành công!");
    } catch (error) {
      setStatus("Lỗi kết nối đến máy chủ.");
    }
  };

  // --- HÀM 2: MÃ HÓA & THÊM ẢNH MỚI (Khi két đang mở) ---
  const handleUpload = async () => {
    if (!file) return alert("Vui lòng chọn ảnh!");
    
    try {
      setStatus("Đang băm nát và cất ảnh...");
      const encryptedBlob = await encryptFile(file, secretKey); // Dùng luôn key đang mở két
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');

      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST', body: formData,
      });

      if (response.ok) {
        setStatus("✅ Đã cất ảnh an toàn! Đang tải lại két sắt...");
        setFile(null); // Xóa file ở ô input
        handleUnlock(); // Tự động load lại danh sách ảnh mới nhất
      } else {
        setStatus("Lỗi khi tải lên.");
      }
    } catch (error) {
      setStatus("Lỗi mã hóa: " + error);
    }
  };

  // --- HÀM 3: KHÓA KÉT LẠI ---
  const handleLock = () => {
    setIsUnlocked(false);
    setSecretKey(''); // Hủy chìa khóa trong RAM
    setImages([]); // Hủy ảnh đang hiển thị
    setStatus('Đã khóa két sắt an toàn.');
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center', color: '#333' }}>Két Sắt Hình Ảnh</h1>

      {/* MÀN HÌNH 1: LÚC CHƯA MỞ KHÓA */}
      {!isUnlocked ? (
        <div style={{ border: '2px solid #ccc', padding: '30px', borderRadius: '10px', textAlign: 'center', maxWidth: '400px', margin: '50px auto' }}>
          <h2>🔒 Két Đang Khóa</h2>
          <input 
            type="password" 
            placeholder="Nhập chìa khóa bảo mật" 
            value={secretKey} 
            onChange={(e) => setSecretKey(e.target.value)} 
            style={{ padding: '10px', width: '90%', marginBottom: '20px', fontSize: '16px' }}
          />
          <button onClick={handleUnlock} style={{ padding: '12px 24px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer', width: '95%' }}>
            Mở Két Sắt
          </button>
          <p style={{ color: 'red', fontWeight: 'bold', marginTop: '15px' }}>{status}</p>
        </div>
      ) : (
        /* MÀN HÌNH 2: LÚC ĐÃ MỞ KHÓA THÀNH CÔNG */
        <div style={{ padding: '20px', border: '2px solid #28a745', borderRadius: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0 }}>🔓 Thư Viện Của Bạn</h2>
            <button onClick={handleLock} style={{ padding: '8px 16px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Khóa Két Lại
            </button>
          </div>

          {/* Khu vực thêm ảnh mới */}
          <div style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <strong>Thêm ảnh mới: </strong>
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button onClick={handleUpload} style={{ padding: '8px 16px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Băm & Cất Giấu
            </button>
            <p style={{ color: 'blue', margin: '10px 0 0 0', fontSize: '14px' }}>{status}</p>
          </div>

          {/* Khu vực hiển thị danh sách ảnh (Gallery) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '15px' }}>
            {images.map((imgSrc, index) => (
              <div key={index} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0Snap,0,0.1)' }}>
                <img src={imgSrc} alt={`secure-img-${index}`} style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;