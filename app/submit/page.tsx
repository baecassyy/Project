"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SubmitPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  if (status === "loading") return <p>Loading...</p>;
  if (!session) {
    return (
      <p className="text-gray-600">
        You must <Link href="/login" className="text-orange-500 underline">login</Link> to post.
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
    } else {
      router.push(`/posts/${data.id}`);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Create Post</h1>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          required
          maxLength={200}
        />
        <textarea
          placeholder="Text (optional)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="border rounded px-3 py-2 text-sm h-32 resize-none"
          required
        />
        <button type="submit" className="bg-orange-500 text-white rounded py-2 font-semibold hover:bg-orange-600">
          Submit Post
        </button>
      </form>
    </div>
  );
}
