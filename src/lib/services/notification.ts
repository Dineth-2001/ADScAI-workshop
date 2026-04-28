import { prisma } from "@/lib/prisma";

export class NotificationService {
  static async listForUser(userId: string, take = 5) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }
}
