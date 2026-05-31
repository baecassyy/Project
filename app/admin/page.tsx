"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type Post = {
  id: string;
  title: string;
  createdAt: string;
  author: { name: string; email: string };
  _count: { comments: number };
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);

  useEffect(() => {
    if (status === "loading") return;
    if ((session?.user as { role?: string })?.role !== "admin") {
      router.push("/");
      return;
    }
    fetch("/api/admin/posts")
      .then((r) => r.json())
      .then(setPosts);
  }, [session, status, router]);

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    await fetch(`/api/posts/${id}`, { method: "DELETE" });
    setPosts((p) => p.filter((post) => post.id !== id));
  }

  if (status === "loading") return <p>Loading...</p>;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h1 className="text-xl font-bold mb-4">Admin Panel</h1>
      <p className="text-sm text-gray-500 mb-4">{posts.length} total posts</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="pb-2 pr-4">Title</th>
              <th className="pb-2 pr-4">Author</th>
              <th className="pb-2 pr-4">Comments</th>
              <th className="pb-2 pr-4">Date</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-medium max-w-xs truncate">{post.title}</td>
                <td className="py-2 pr-4 text-gray-600">{post.author.name}</td>
                <td className="py-2 pr-4 text-gray-600">{post._count.comments}</td>
                <td className="py-2 pr-4 text-gray-600">{new Date(post.createdAt).toLocaleDateString()}</td>
                <td className="py-2">
                  <button
                    onClick={() => deletePost(post.id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
