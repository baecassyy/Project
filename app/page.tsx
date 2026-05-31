"use client";

import { useEffect, useState } from "react";
import PostCard from "@/components/PostCard";
import AdBanner from "@/components/AdBanner";

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

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/posts")
      .then((r) => r.json())
      .then((data) => { setPosts(data); setLoading(false); });
  }, []);

  return (
    <div>
      <AdBanner slot="top-banner" />
      <h1 className="text-lg font-bold text-gray-700 mb-3">Hot Posts</h1>
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : posts.length === 0 ? (
        <p className="text-gray-500">No posts yet. Be the first to post!</p>
      ) : (
        <div className="flex flex-col gap-3">
          {posts.map((post, i) => (
            <div key={post.id}>
              <PostCard post={post} />
              {i === 2 && <AdBanner slot="mid-feed" />}
            </div>
          ))}
        </div>
      )}
      <AdBanner slot="bottom-banner" />
    </div>
  );
}
