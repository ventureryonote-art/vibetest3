import type { Metadata } from "next";
import "./globals.css";

// ▼ サイトのタイトル・説明。Claude Code に「タイトルを◯◯に変えて」と頼めば書き換わる。
export const metadata: Metadata = {
  title: "検査結果の連絡待ち",
  description: "返ってきた検査結果のうち、まだ電話していない方を、返ってきた順に並べます。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
