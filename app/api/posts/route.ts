import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      _count: { select: { comments: true, votes: true } },
      votes: true,
    },
  });
  return NextResponse.json(posts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { title, content } = await req.json();
  if (!title || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const post = await prisma.post.create({
    data: { title, content, authorId: session.user.id! },
  });
  return NextResponse.json(post);
}
