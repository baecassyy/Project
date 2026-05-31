"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between shadow">
      <Link href="/" className="font-bold text-xl tracking-tight">
        RedditBlog
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {session ? (
          <>
            <Link href="/submit" className="bg-white text-orange-500 px-3 py-1 rounded font-semibold hover:bg-orange-50">
              + New Post
            </Link>
            {(session.user as { role?: string }).role === "admin" && (
              <Link href="/admin" className="hover:underline">Admin</Link>
            )}
            <span className="opacity-80">{session.user?.name}</span>
            <button onClick={() => signOut()} className="hover:underline">Logout</button>
          </>
        ) : (
          <>
            <Link href="/login" className="hover:underline">Login</Link>
            <Link href="/register" className="bg-white text-orange-500 px-3 py-1 rounded font-semibold hover:bg-orange-50">
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
