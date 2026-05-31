import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: postId } = await params;
  const { value } = await req.json(); // 1 or -1

  const existing = await prisma.vote.findUnique({
    where: { userId_postId: { userId: session.user.id!, postId } },
  });

  if (existing) {
    if (existing.value === value) {
      await prisma.vote.delete({ where: { id: existing.id } });
    } else {
      await prisma.vote.update({ where: { id: existing.id }, data: { value } });
    }
  } else {
    await prisma.vote.create({ data: { value, userId: session.user.id!, postId } });
  }

  const votes = await prisma.vote.findMany({ where: { postId } });
  const score = votes.reduce((sum, v) => sum + v.value, 0);
  return NextResponse.json({ score });
}
