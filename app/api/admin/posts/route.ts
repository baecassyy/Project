import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if ((session?.user as { role?: string })?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { name: true, email: true } }, _count: { select: { comments: true } } },
  });
  return NextResponse.json(posts);
}
