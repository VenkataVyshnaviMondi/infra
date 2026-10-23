export function pricePerSqft(
  categoryId: string,
  price: unknown,
  property?: { plotArea?: unknown; superArea?: unknown } | null,
): number | null {
  const area = Number(
    categoryId === "plots"
      ? property?.plotArea
      : categoryId === "flats"
        ? property?.superArea
        : 0,
  );
  const total = Number(price);
  if (
    !Number.isFinite(area) ||
    !Number.isFinite(total) ||
    area <= 0 ||
    total <= 0
  )
    return null;
  const rate = total / area;
  return Number.isFinite(rate) ? rate : null;
}
