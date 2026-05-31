import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "RedditBlog",
  description: "Community blog with upvotes and comments",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-100 min-h-screen">
        <Providers>
          <Navbar />
          <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
