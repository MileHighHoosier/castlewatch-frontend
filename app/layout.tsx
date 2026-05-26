import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CastleWatch",
  description: "Disney park demand dashboard for current and future ride pressure.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
