import CryptoJS from 'crypto-js';

// 1. Hàm mã hóa: Biến file Ảnh thành một đống chữ lộn xộn (AES)
export const encryptFile = (file: File, secretKey: string): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // Đọc bức ảnh dưới dạng văn bản (Base64)
    reader.readAsDataURL(file); 
    
    reader.onload = () => {
      try {
        const base64Data = reader.result as string;
        
        // Chạy thuật toán AES-256 để băm nát dữ liệu dựa vào Chìa khóa (secretKey)
        const encrypted = CryptoJS.AES.encrypt(base64Data, secretKey).toString();
        
        // Đóng gói đống chữ lộn xộn đó thành một file văn bản (.txt) để chuẩn bị gửi đi
        const encryptedBlob = new Blob([encrypted], { type: 'text/plain' });
        resolve(encryptedBlob);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

// 2. Hàm giải mã: Phục hồi lại bức ảnh từ đống chữ lộn xộn tải từ Server về
export const decryptFile = (encryptedBlob: Blob, secretKey: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // Đọc file lộn xộn từ Server trả về
    reader.readAsText(encryptedBlob); 
    
    reader.onload = () => {
      try {
        const encryptedText = reader.result as string;
        
        // Dùng đúng Chìa khóa để giải mã ngược lại
        const decrypted = CryptoJS.AES.decrypt(encryptedText, secretKey);
        
        // Ép kiểu về lại dạng chuỗi ảnh ban đầu
        const originalBase64 = decrypted.toString(CryptoJS.enc.Utf8);
        
        if (!originalBase64) throw new Error("Giải mã thất bại");
        resolve(originalBase64);
      } catch (error) {
        reject(new Error("Sai chìa khóa hoặc file đã bị can thiệp!"));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};