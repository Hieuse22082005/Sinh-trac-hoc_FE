"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient"; // Điều chỉnh lại đường dẫn nếu cần

export default function EmailRecoveryForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ type: "", message: "" });
  const [isLoading, setIsLoading] = useState(false);

  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setStatus({ type: "", message: "" });

    // Lấy định danh két đang đăng nhập (giả sử bạn lưu wallet_address lúc login)
    const currentWalletAddress = localStorage.getItem("wallet_address");

    if (!currentWalletAddress) {
      setStatus({ type: "error", message: "Không tìm thấy thông tin két. Vui lòng đăng nhập lại." });
      setIsLoading(false);
      return;
    }

    // Cập nhật email vào bảng passkeys
    const { error } = await supabase
      .from("passkeys")
      .update({ recovery_email: email })
      .eq("wallet_address", currentWalletAddress);

    if (error) {
      setStatus({ type: "error", message: `Lỗi: ${error.message}` });
    } else {
      setStatus({ type: "success", message: "Đã liên kết email bảo mật thành công!" });
    }
    
    setIsLoading(false);
  };

  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-700 max-w-md mt-6">
      <h3 className="text-lg font-semibold text-white mb-2">Bảo vệ Két sắt</h3>
      <p className="text-sm text-gray-400 mb-4">
        Hãy xác nhận email nếu muốn khôi phục lại két. Một email có thể dùng cho nhiều két.
      </p>

      <form onSubmit={handleSaveEmail} className="flex flex-col gap-3">
        <input
          type="email"
          required
          placeholder="Nhập email của bạn..."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
        />
        
        <button
          type="submit"
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          {isLoading ? "Đang lưu..." : "Xác nhận Email"}
        </button>
      </form>

      {status.message && (
        <div className={`mt-3 text-sm ${status.type === "error" ? "text-red-400" : "text-green-400"}`}>
          {status.message}
        </div>
      )}
    </div>
  );
}