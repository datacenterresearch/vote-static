import { OrderStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildDynamicQrisPayload, generateQrisDataUrl } from "@/lib/qris";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const now = new Date();

  let order = await prisma.voteOrder.findUnique({
    where: { id },
    include: {
      event: true,
      candidate: true,
      proofs: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Order tidak ditemukan" },
      { status: 404 }
    );
  }

  if (order.status === OrderStatus.PENDING && order.expiresAt <= now) {
    await prisma.voteOrder.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING },
      data: { status: OrderStatus.EXPIRED },
    });
    order = { ...order, status: OrderStatus.EXPIRED };
  }

  let dynamicQrisDataUrl: string | null = null;
  let dynamicQrisPayload: string | null = null;
  if (order.event.qrisRawPayload && order.status === OrderStatus.PENDING) {
    try {
      dynamicQrisPayload = buildDynamicQrisPayload(
        order.event.qrisRawPayload,
        order.totalAmount
      );
      dynamicQrisDataUrl = await generateQrisDataUrl(dynamicQrisPayload);
    } catch {
      dynamicQrisDataUrl = null;
      dynamicQrisPayload = null;
    }
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      voterName: order.voterName,
      voteQty: order.voteQty,
      baseAmount: order.baseAmount,
      uniqueCode: order.uniqueCode,
      totalAmount: order.totalAmount,
      expiresAt: order.expiresAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      serverNow: now.toISOString(),
      event: {
        id: order.event.id,
        slug: order.event.slug,
        title: order.event.title,
        pricePerVote: order.event.pricePerVote,
        qrisImageUrl: order.event.qrisImagePath
          ? `/api/files/${order.event.qrisImagePath}`
          : null,
      },
      candidate: {
        id: order.candidate.id,
        number: order.candidate.number,
        name: order.candidate.name,
        photoUrl: order.candidate.photoPath
          ? `/api/files/${order.candidate.photoPath}`
          : null,
      },
      dynamicQrisDataUrl,
      dynamicQrisPayload,
      latestProof: order.proofs[0]
        ? {
            id: order.proofs[0].id,
            status: order.proofs[0].status,
            rrnInput: order.proofs[0].rrnInput,
            createdAt: order.proofs[0].createdAt.toISOString(),
            imageUrl: `/api/files/${order.proofs[0].imagePath}`,
          }
        : null,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const sessionKeyHeader = req.headers.get("x-session-key")?.trim();

  const order = await prisma.voteOrder.findUnique({
    where: { id },
    select: { id: true, status: true, sessionKey: true },
  });

  if (!order) {
    return NextResponse.json(
      { error: "Order tidak ditemukan" },
      { status: 404 }
    );
  }

  if (sessionKeyHeader && sessionKeyHeader !== order.sessionKey) {
    return NextResponse.json(
      { error: "Session key tidak sesuai" },
      { status: 403 }
    );
  }

  const updated = await prisma.voteOrder.updateMany({
    where: { id: order.id, status: OrderStatus.PENDING },
    data: { status: OrderStatus.CANCELLED },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: `Order berstatus ${order.status}, tidak dapat dibatalkan.` },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, status: OrderStatus.CANCELLED });
}
