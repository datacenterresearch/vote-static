export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateTimeId(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export function splitUniqueTotalDisplay(totalAmount: number): {
  prefix: string;
  uniqueSuffix: string;
} {
  const formatted = new Intl.NumberFormat("id-ID").format(totalAmount);
  if (formatted.length <= 3) {
    return { prefix: "", uniqueSuffix: formatted };
  }
  return {
    prefix: formatted.slice(0, -3),
    uniqueSuffix: formatted.slice(-3),
  };
}
