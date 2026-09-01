import { Prisma } from "@prisma/client";
export function toNumber(value: Prisma.Decimal | number | string): number { return typeof value === "number" ? value : Number(value); }
export function variancePct(actualToDate: Prisma.Decimal | number | string, estimate: Prisma.Decimal | number | string): number { const actual = toNumber(actualToDate); const est = toNumber(estimate); return ((actual - est) / est) * 100; }
