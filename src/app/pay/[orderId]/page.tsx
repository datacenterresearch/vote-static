import { OrderStatus } from "@prisma/client";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { buildDynamicQrisPayload, generateQrisDataUrl } from "@/lib/qris";
import PayOrderClient, { PayOrderDetail } from "@/components/PayOrderClient";

export const dynamic = "force-dynamic";

export default async function PayOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const now = new Date();

  let order = await prisma.voteOrder.findUnique({
    where: { id: orderId },
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
    notFound();
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

  const initialOrder: PayOrderDetail = {
    id: order.id,
    status: order.status,
    voterName: order.voterName,
    isAnonymous: order.isAnonymous,
    supportMessage: order.supportMessage,
    voteQty: order.voteQty,
    baseAmount: order.baseAmount,
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
  };

  return <PayOrderClient initialOrder={initialOrder} />;
}
