import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jin Gyan",
  description:
    "A jain trivia game, learning more about jain dharma one step at a time",
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
