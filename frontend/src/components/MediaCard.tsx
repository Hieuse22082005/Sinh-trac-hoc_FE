import { useState } from 'react';
import type { SecureImage } from '../types';

interface MediaCardProps {
  item: SecureImage;
  onUnlock: (filename: string, specificKey: string) => void;
  onDelete: (filename: string) => void;
  onChangePassword: (item: SecureImage) => void;
}

export default function MediaCard({ item, onUnlock, onDelete, onChangePassword }: MediaCardProps) {
  const [privateInput, setPrivateInput] = useState('');

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', height: '250px', position: 'relative', backgroundColor: '#000' }}>
      
      {/* Nút Xóa */}
      <button onClick={() => onDelete(item.filename)} style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(220, 53, 69, 0.9)', color: 'white', border: 'none', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer', zIndex: 10, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        ✕
      </button>

      {/* Nút Đổi Pass */}
      {item.src && item.is_private && (
        <button onClick={() => onChangePassword(item)} style={{ position: 'absolute', top: '8px', left: '8px', backgroundColor: 'rgba(0, 123, 255, 0.9)', color: 'white', border: 'none', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer', zIndex: 10, fontWeight: 'bold', fontSize: '12px' }}>
          🔑 Đổi Pass
        </button>
      )}

      {/* Trạng thái BỊ KHÓA */}
      {!item.src && item.is_private && (
        <>
          {item.thumb && <img src={item.thumb} alt="blurred" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(10px)', transform: 'scale(1.1)', opacity: 0.6, position: 'absolute', top: 0, left: 0 }} />}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: '10px' }}>
            <span style={{ fontSize: '40px' }}>🔒</span>
            <p style={{ margin: '5px 0 15px 0', fontSize: '14px', color: '#fff', fontWeight: 'bold' }}>Cần Mật Khẩu</p>
            <input 
              type="password" 
              placeholder="Mật khẩu riêng" 
              value={privateInput} 
              onChange={(e) => setPrivateInput(e.target.value)}
              style={{ padding: '8px', width: '90%', marginBottom: '10px', boxSizing: 'border-box', textAlign: 'center', borderRadius: '4px', border: 'none' }} 
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

      {/* Trạng thái ĐÃ MỞ (Hiển thị Ảnh hoặc Video) */}
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