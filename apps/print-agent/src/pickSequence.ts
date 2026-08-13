export type PickSequenceResult = {
  late: boolean;
  previousMax?: number;
};

export class PickSequenceTracker {
  private readonly maxBySeries = new Map<string, number>();

  observe(pickCode: string): PickSequenceResult {
    const parsed = parsePickCode(pickCode);
    if (!parsed) {
      return { late: false };
    }

    const previousMax = this.maxBySeries.get(parsed.series);
    if (previousMax === undefined || parsed.number > previousMax) {
      this.maxBySeries.set(parsed.series, parsed.number);
      return { late: false };
    }

    return parsed.number < previousMax
      ? { late: true, previousMax }
      : { late: false };
  }
}

function parsePickCode(pickCode: string): { series: string; number: number } | undefined {
  const match = pickCode.trim().match(/^(?:(?<series>[A-Z])\s+)?(?<number>\d+)$/i);
  if (!match?.groups) {
    return undefined;
  }

  return {
    series: (match.groups.series ?? "default").toUpperCase(),
    number: Number(match.groups.number)
  };
}
