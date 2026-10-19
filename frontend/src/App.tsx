import { useState } from 'react';
import { encryptFile, decryptFile } from './utils/cryptoService'; // Nhúng thêm hàm giải mã

function App() {
  // --- STATE CHO PHẦN TẢI LÊN ---
  const [file, setFile] = useState<File | null>(null);
  const [secretKey, setSecretKey] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [uploadedFilename, setUploadedFilename] = useState<string>('');

  // --- STATE CHO PHẦN TẢI VỀ & GIẢI MÃ ---
  const [downloadName, setDownloadName] = useState<string>('');
  const [downloadKey, setDownloadKey] = useState<string>('');
  const [downloadStatus, setDownloadStatus] = useState<string>('');
  const [decryptedImage, setDecryptedImage] = useState<string | null>(null);

  // HÀM 1: MÃ HÓA & TẢI LÊN (Giữ nguyên như cũ)
  const handleUpload = async () => {
    if (!file || !secretKey) return alert("Vui lòng chọn ảnh và nhập chìa khóa!");
    try {
      setUploadStatus("1. Đang băm nát ảnh...");
      const encryptedBlob = await encryptFile(file, secretKey);
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted.txt');

      setUploadStatus("2. Đang cất vào két...");
      const response = await fetch('http://localhost:8000/upload', {
        method: 'POST', body: formData,
      });

      const result = await response.json();
      if (response.ok) {
        setUploadStatus(`Thành công! Tên file: ${result.filename}`);
        setUploadedFilename(result.filename); // Lưu lại tên file để lát copy cho dễ
        setDownloadName(result.filename); // Tự động điền luôn tên file xuống ô bên dưới
      } else {
        setUploadStatus(`Lỗi máy chủ: ${result.detail}`);
      }
    } catch (error) {
      setUploadStatus("Lỗi: " + error);
    }
  };

  // HÀM 2: TẢI VỀ & GIẢI MÃ
  const handleDownloadAndDecrypt = async () => {
    if (!downloadName || !downloadKey) return alert("Vui lòng nhập tên file và chìa khóa!");
    
    try {
      setDecryptedImage(null); // Xóa ảnh cũ nếu có
      setDownloadStatus("1. Đang tải cục dữ liệu lộn xộn từ Két về...");
      
      const response = await fetch(`http://localhost:8000/download/${downloadName}`);
      if (!response.ok) throw new Error("Không tìm thấy file trên server!");
      
      const encryptedBlob = await response.blob();

      setDownloadStatus("2. Đang dùng chìa khóa ráp lại bức ảnh...");
      // Gọi hàm giải mã AES
      const originalImageBase64 = await decryptFile(encryptedBlob, downloadKey);
      
      setDecryptedImage(originalImageBase64);
      setDownloadStatus("3. Giải mã thành công!");
    } catch (error) {
      setDownloadStatus(`Lỗi: Sai mật khẩu hoặc file đã bị hỏng!`);
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ textAlign: 'center' }}>Két Sắt Hình Ảnh</h1>
      
      {/* KHU VỰC 1: CẤT GIẤU */}
      <div style={{ border: '2px solid #ccc', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0 }}>🔒 Phần 1: Mã Hóa & Cất Giấu</h3>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginBottom: '10px' }}/>
        <input type="password" placeholder="Chìa khóa bảo mật" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} style={{ padding: '8px', width: '100%', marginBottom: '10px' }}/>
        <button onClick={handleUpload} style={{ padding: '10px', width: '100%', backgroundColor: '#007bff', color: 'white', border: 'none', cursor: 'pointer' }}>Khóa & Lưu Trữ</button>
        <p style={{ color: 'blue', fontWeight: 'bold' }}>{uploadStatus}</p>
        {uploadedFilename && <p style={{ color: 'gray', fontSize: '12px' }}>Tên file vừa lưu: {uploadedFilename}</p>}
      </div>

      {/* KHU VỰC 2: MỞ KHÓA */}
      <div style={{ border: '2px solid #28a745', padding: '20px', borderRadius: '8px' }}>
        <h3 style={{ marginTop: 0 }}>🔓 Phần 2: Giải Mã & Xem Ảnh</h3>
        <input type="text" placeholder="Nhập tên file (VD: abcd-123.enc)" value={downloadName} onChange={(e) => setDownloadName(e.target.value)} style={{ padding: '8px', width: '100%', marginBottom: '10px' }}/>
        <input type="password" placeholder="Nhập chìa khóa để giải mã" value={downloadKey} onChange={(e) => setDownloadKey(e.target.value)} style={{ padding: '8px', width: '100%', marginBottom: '10px' }}/>
        <button onClick={handleDownloadAndDecrypt} style={{ padding: '10px', width: '100%', backgroundColor: '#28a745', color: 'white', border: 'none', cursor: 'pointer' }}>Tải Về & Giải Mã</button>
        <p style={{ color: 'red', fontWeight: 'bold' }}>{downloadStatus}</p>
        
        {/* Nếu giải mã thành công, thẻ img này mới hiện ra */}
        {decryptedImage && (
          <div style={{ marginTop: '20px', textAlign: 'center' }}>
            <h4>Bức ảnh của bạn:</h4>
            <img src={decryptedImage} alt="Decrypted" style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #ccc' }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;