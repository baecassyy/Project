"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AdBanner from "@/components/AdBanner";

type Comment = { id: string; content: string; createdAt: string; author: { name: string } };
type Vote = { value: number; userId: string };
type Post = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { name: string };
  authorId: string;
  comments: Comment[];
  votes: Vote[];
};

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [comment, setComment] = useState("");
  const [score, setScore] = useState(0);
  const [userVote, setUserVote] = useState(0);

  useEffect(() => {
    fetch(`/api/posts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setPost(data);
        setScore(data.votes?.reduce((s: number, v: Vote) => s + v.value, 0) ?? 0);
        const uv = data.votes?.find((v: Vote) => v.userId === session?.user?.id)?.value ?? 0;
        setUserVote(uv);
      });
  }, [id, session]);

  async function vote(value: number) {
    if (!session) return;
    const res = await fetch(`/api/posts/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    const data = await res.json();
    setScore(data.score);
    setUserVote(userVote === value ? 0 : value);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !comment.trim()) return;
    const res = await fetch(`/api/posts/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: comment }),
    });
    const newComment = await res.json();
    setPost((p) => p ? { ...p, comments: [newComment, ...p.comments] } : p);
    setComment("");
  }

  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!post) return <p className="text-gray-400">Loading...</p>;

  const isOwner = session?.user?.id === post.authorId;
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  return (
    <div>
      <AdBanner slot="post-top" />
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex gap-4">
          <div className="flex flex-col items-center gap-1">
            <button onClick={() => vote(1)} className={`text-xl ${userVote === 1 ? "text-orange-500" : "text-gray-400 hover:text-orange-400"}`}>▲</button>
            <span className="font-bold text-gray-700">{score}</span>
            <button onClick={() => vote(-1)} className={`text-xl ${userVote === -1 ? "text-blue-500" : "text-gray-400 hover:text-blue-400"}`}>▼</button>
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{post.title}</h1>
            <p className="text-xs text-gray-500 mb-3">
              by <span className="font-medium">{post.author.name}</span> · {new Date(post.createdAt).toLocaleDateString()}
            </p>
            <p className="text-gray-700 whitespace-pre-wrap">{post.content}</p>
            {(isOwner || isAdmin) && (
              <button onClick={deletePost} className="text-xs text-red-400 hover:text-red-600 mt-3">
                Delete post
              </button>
            )}
          </div>
        </div>
      </div>

      <AdBanner slot="post-mid" />

      <div className="mt-6">
        <h2 className="font-semibold text-gray-700 mb-3">Comments ({post.comments.length})</h2>
        {session ? (
          <form onSubmit={submitComment} className="mb-4 flex gap-2">
            <input
              type="text"
              placeholder="Add a comment..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="flex-1 border rounded px-3 py-2 text-sm"
            />
            <button type="submit" className="bg-orange-500 text-white px-4 py-2 rounded text-sm font-semibold hover:bg-orange-600">
              Post
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-500 mb-4">Login to comment.</p>
        )}
        <div className="flex flex-col gap-3">
          {post.comments.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded p-3">
              <p className="text-xs text-gray-500 mb-1">
                <span className="font-medium">{c.author.name}</span> · {new Date(c.createdAt).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-800">{c.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
