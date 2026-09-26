import type {
  LabelPrintJob,
  PaymentHold,
  PrintConsoleState,
  PrintContext,
  PrintRow
} from "@live-alerts/shared";
import { formatPickCode, shortOrderId } from "./label.js";
import { holdPrintNumber, printUsername } from "@live-alerts/shared";

export class PrintController {
  private jobs: LabelPrintJob[] = [];
  private readonly seen = new Set<string>();
  private readonly failedOrders = new Set<string>();
  private readonly historyByOrder = new Map<string, PrintRow>();
  private processing = false;
  private enabled = true;
  private idleWaiters: Array<() => void> = [];
  private state: PrintConsoleState;

  constructor(
    dryRun: boolean,
    selectedWarehouseId: string,
    private readonly print: (
      job: LabelPrintJob,
      recovered: boolean
    ) => Promise<void | { fixed: boolean }>
  ) {
    this.state = {
      selectedProfileId: "",
      switchingStore: false,
      shopProfiles: [],
      dryRun,
      selectedWarehouseId,
      paused: false,
      connection: "connecting",
      contextAvailable: false,
      warehouses: [],
      current: null,
      latest: null,
      lastPrintedByWarehouse: {},
      queue: [],
      history: [],
      paymentHolds: []
    };
  }

  snapshot(): PrintConsoleState {
    return structuredClone({
      ...this.state,
      queue: this.jobs.map((job) => this.row(job, "queued"))
    });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) void this.drain();
  }

  async suspend(): Promise<void> {
    this.enabled = false;
    if (this.processing) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  connection(connection: PrintConsoleState["connection"], error?: string): void {
    this.state.connection = connection;
    if (error) this.state.connectionError = error;
    else delete this.state.connectionError;
    if (connection !== "connected") this.state.contextAvailable = false;
  }

  context(context: PrintContext): void {
    this.state.warehouses = context.warehouses;
    this.paymentHolds(context.paymentHolds);
    this.state.contextAvailable = true;
  }

  paymentHolds(holds: PaymentHold[]): void {
    this.state.paymentHolds = holds.filter((hold) => {
      const status = this.historyByOrder.get(hold.orderId)?.status;
      return status !== "submitted" && status !== "fixed" && status !== "preview";
    });
    for (const hold of this.state.paymentHolds) {
      this.failedOrders.add(hold.orderId);
      this.record(hold.orderId, {
        id: `hold-${hold.orderId}`,
        orderId: shortOrderId(hold.orderId),
        warehouseId: hold.warehouseId ?? "",
        pickCode: holdPrintNumber(hold),
        buyerDisplayName: printUsername(hold.buyerDisplayName),
        productTitle: hold.productTitle ?? "",
        status: "failed",
        updatedAt: hold.updatedAt
      });
    }
  }

  settings(settings: { warehouseId?: string | undefined; paused?: boolean | undefined }): void {
    if (settings.warehouseId !== undefined) {
      if (!this.state.warehouses.some((warehouse) => warehouse.id === settings.warehouseId)) {
        throw new Error("请选择当前店铺的有效仓库");
      }
      this.state.selectedWarehouseId = settings.warehouseId;
    }
    if (settings.paused !== undefined) this.state.paused = settings.paused;
    void this.drain();
  }

  receive(job: LabelPrintJob): void {
    const key = `${job.storeId}:${job.orderId}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (!this.state.warehouses.some((warehouse) => warehouse.id === job.warehouseId)) {
      this.state.warehouses.push({ id: job.warehouseId, name: `仓库 ${job.warehouseId}` });
    }
    this.jobs.push(job);
    void this.drain();
  }

  private row(job: LabelPrintJob, status: PrintRow["status"]): PrintRow {
    return {
      id: job.id,
      orderId: shortOrderId(job.orderId),
      warehouseId: job.warehouseId,
      pickCode: formatPickCode(job.productName, job.skuName),
      buyerDisplayName: printUsername(job.buyerNickname),
      productTitle: job.productName,
      status,
      updatedAt: status === "queued" ? job.createdAt : new Date().toISOString()
    };
  }

  private record(orderId: string, row: PrintRow): void {
    const existing = this.historyByOrder.get(orderId);
    if (existing) row.id = existing.id;
    this.historyByOrder.delete(orderId);
    this.historyByOrder.set(orderId, row);
    if (this.historyByOrder.size > 100) {
      this.historyByOrder.delete(this.historyByOrder.keys().next().value!);
    }
    this.state.history = [...this.historyByOrder.values()].reverse();
  }

  private async drain(): Promise<void> {
    if (!this.enabled || this.processing || this.state.paused || !this.state.selectedWarehouseId)
      return;
    this.processing = true;
    try {
      while (this.enabled && !this.state.paused) {
        const index = this.jobs.findIndex(
          (job) => job.warehouseId === this.state.selectedWarehouseId
        );
        if (index === -1) break;
        const job = this.jobs.splice(index, 1)[0]!;
        this.state.current = this.row(job, "printing");
        let result: PrintRow;
        try {
          const recovered = this.failedOrders.has(job.orderId);
          const outcome = await this.print(job, recovered);
          result = this.row(
            job,
            this.state.dryRun ? "preview" : recovered || outcome?.fixed ? "fixed" : "submitted"
          );
          this.state.paymentHolds = this.state.paymentHolds.filter(
            (hold) => hold.orderId !== job.orderId
          );
          this.state.latest = result;
          this.state.lastPrintedByWarehouse[job.warehouseId] = result;
        } catch {
          this.failedOrders.add(job.orderId);
          result = {
            ...this.row(job, "failed"),
            error: "打印未确认，请检查打印机及系统队列后处理，避免重复出纸。"
          };
          this.state.paused = true;
        }
        this.record(job.orderId, result);
        this.state.current = null;
      }
    } finally {
      this.processing = false;
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }
}
