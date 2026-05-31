import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;
  const { content } = await req.json();
  if (!content) return NextResponse.json({ error: "Missing content" }, { status: 400 });

  const comment = await prisma.comment.create({
    data: { content, postId, authorId: session.user.id! },
    include: { author: { select: { name: true } } },
  });
  return NextResponse.json(comment);
}
