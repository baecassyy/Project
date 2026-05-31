"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";

type Vote = { value: number; userId: string };
type Post = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { name: string };
  _count: { comments: number };
  votes: Vote[];
};

export default function PostCard({ post }: { post: Post }) {
  const { data: session } = useSession();
  const [score, setScore] = useState(post.votes.reduce((s, v) => s + v.value, 0));
  const [userVote, setUserVote] = useState(
    post.votes.find((v) => v.userId === session?.user?.id)?.value ?? 0
  );

  async function vote(value: number) {
    if (!session) return;
    const res = await fetch(`/api/posts/${post.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    setScore(data.score);
    setUserVote(userVote === value ? 0 : value);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg flex gap-0 hover:border-gray-400 transition">
      {/* Vote column */}
      <div className="flex flex-col items-center bg-gray-50 px-2 py-3 rounded-l-lg gap-1 w-10">
        <button
          onClick={() => vote(1)}
          className={`text-lg leading-none ${userVote === 1 ? "text-orange-500" : "text-gray-400 hover:text-orange-400"}`}
        >
          ▲
        </button>
        <span className="text-xs font-bold text-gray-700">{score}</span>
        <button
          onClick={() => vote(-1)}
          className={`text-lg leading-none ${userVote === -1 ? "text-blue-500" : "text-gray-400 hover:text-blue-400"}`}
        >
          ▼
        </button>
      </div>
      {/* Content */}
      <div className="p-3 flex-1 min-w-0">
        <Link href={`/posts/${post.id}`}>
          <h2 className="font-semibold text-gray-900 hover:text-orange-600 text-base leading-snug">
            {post.title}
          </h2>
        </Link>
        <p className="text-gray-500 text-xs mt-1">
          by <span className="font-medium">{post.author.name}</span> ·{" "}
          {new Date(post.createdAt).toLocaleDateString()}
        </p>
        <p className="text-gray-700 text-sm mt-1 line-clamp-2">{post.content}</p>
        <Link href={`/posts/${post.id}`} className="text-xs text-gray-500 hover:text-orange-500 mt-2 inline-block">
          💬 {post._count.comments} comments
        </Link>
      </div>
    </div>
  );
}
