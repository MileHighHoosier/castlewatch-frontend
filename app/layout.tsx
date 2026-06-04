import type { Metadata } from "next";
import "./globals.css";
import ActivityMetadataCleaner from "./components/ActivityMetadataCleaner";

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
      <body>
        <ActivityMetadataCleaner />
        {children}
      </body>
    </html>
  );
}
