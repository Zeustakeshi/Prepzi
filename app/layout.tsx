import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ôn Tập AI — Tạo bài ôn từ JSON",
  description: "Tạo bài trắc nghiệm và tự luận từ JSON, chấm tự luận bằng AI.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
