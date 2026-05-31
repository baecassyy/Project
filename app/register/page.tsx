"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
    } else {
      router.push("/login");
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-10 bg-white p-6 rounded-lg shadow">
      <h1 className="text-xl font-bold mb-4">Create Account</h1>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          placeholder="Username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          required
        />
        <button type="submit" className="bg-orange-500 text-white rounded py-2 font-semibold hover:bg-orange-600">
          Sign Up
        </button>
      </form>
      <p className="text-sm text-gray-500 mt-3">
        Already have an account?{" "}
        <Link href="/login" className="text-orange-500 hover:underline">Login</Link>
      </p>
    </div>
  );
}
