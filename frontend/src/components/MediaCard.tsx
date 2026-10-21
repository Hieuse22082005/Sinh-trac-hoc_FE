import { useState } from 'react';
import type { SecureImage } from '../types';

interface MediaCardProps {
  item: SecureImage;
  onUnlock: (filename: string, specificKey: string) => void;
  onDelete: (filename: string) => void;
  // Hàm mới gộp chung việc Đổi mật khẩu và Bật/Tắt Private
  onTogglePrivacy: (item: SecureImage, newPassword?: string) => void;
}

export default function MediaCard({ item, onUnlock, onDelete, onTogglePrivacy }: MediaCardProps) {
  const [privateInput, setPrivateInput] = useState('');

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', height: '250px', position: 'relative', backgroundColor: '#000' }}>
      
      {/* Nút Xóa */}
      <button onClick={() => onDelete(item.filename)} style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(220, 53, 69, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', zIndex: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>

      {/* Nút Đổi trạng thái Public <-> Private (Chỉ hiện khi file đã hiển thị/đã mở) */}
      {item.src && (
        <button 
          onClick={() => {
            if (item.is_private) {
              const confirm = window.confirm("Bạn muốn bỏ khóa file này thành ảnh thường (Public)?");
              if (confirm) onTogglePrivacy(item); // Không truyền pass -> Chuyển thành Public
            } else {
              const newPass = window.prompt("Nhập MẬT KHẨU để khóa file này thành Tuyệt Mật:");
              if (newPass) onTogglePrivacy(item, newPass); // Có truyền pass -> Khóa Private
            }
          }} 
          style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: item.is_private ? 'rgba(40, 167, 69, 0.9)' : 'rgba(255, 193, 7, 0.9)', color: item.is_private ? 'white' : 'black', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', zIndex: 10, fontWeight: 'bold', fontSize: '12px' }}
        >
          {item.is_private ? '🔓 Bỏ Khóa (Thành Public)' : '🔒 Đặt Mật Khẩu (Khóa lại)'}
        </button>
      )}

      {/* Trạng thái BỊ KHÓA (Nhập mật khẩu thường) */}
      {!item.src && item.is_private && (
        <>
          {item.thumb && <img src={item.thumb} alt="blurred" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.1)', opacity: 0.6, position: 'absolute', top: 0, left: 0 }} />}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: '10px' }}>
            <span style={{ fontSize: '40px' }}>🔒</span>
            <input 
              type="password" 
              placeholder="Nhập mật khẩu..." 
              value={privateInput} 
              onChange={(e) => setPrivateInput(e.target.value)}
              style={{ padding: '8px', width: '90%', marginBottom: '10px', boxSizing: 'border-box', textAlign: 'center', borderRadius: '4px', border: 'none', marginTop: '10px' }} 
            />
            <button 
              onClick={() => { onUnlock(item.filename, privateInput); setPrivateInput(''); }}
              style={{ padding: '8px 12px', backgroundColor: '#d9534f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', width: '90%', fontWeight: 'bold' }}
            >
              Mở Khóa
            </button>
          </div>
        </>
      )}

      {/* Trạng thái ĐÃ MỞ (Public hoặc Private đã giải mã) */}
      {item.src && (
        item.src.startsWith('data:video') ? (
          <video src={item.src} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <img src={item.src} alt="secure-media" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )
      )}
    </div>
  );
}