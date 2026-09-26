import {
  labelPrintJobSchema,
  paymentHoldSchema,
  printContextSchema,
  type LabelPrintJob,
  type PrintConsoleState,
  type PrintContext
} from "@live-alerts/shared";
import { PrintController } from "./printController.js";
import type { ShopProfile } from "./shopProfiles.js";
import { connectShop, type ShopConnectionFactory } from "./shopConnection.js";
import { verifyShopIdentity, WaitingForShopEvidence, type ShopIdentity } from "./shopIdentity.js";

type Settings = {
  profileId?: string | undefined;
  warehouseId?: string | undefined;
  paused?: boolean | undefined;
};
type Selection = { profileId: string; warehouseId: string };

export class ShopPrintManager {
  private readonly controllers = new Map<string, PrintController>();
  private active: ShopProfile;
  private connection: { close(): void } | undefined;
  private generation = 0;
  private switching = false;
  private changingSettings = false;
  private verified = false;
  private stopped = false;
  private verificationRetry: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly profiles: ShopProfile[],
    selection: Selection,
    dryRun: boolean,
    print: (job: LabelPrintJob, recovered: boolean) => Promise<void | { fixed: boolean }>,
    private readonly options: {
      connect?: ShopConnectionFactory;
      verify?: (profile: ShopProfile) => Promise<ShopIdentity>;
      persist?: (selection: Selection) => Promise<void>;
    } = {}
  ) {
    const active = profiles.find((profile) => profile.id === selection.profileId);
    if (!active || !active.warehouseIds.includes(selection.warehouseId))
      throw new Error("Invalid initial store/warehouse");
    this.active = active;
    for (const profile of profiles) {
      const controller = new PrintController(
        dryRun,
        profile === active ? selection.warehouseId : profile.warehouseIds[0]!,
        print
      );
      controller.setEnabled(false);
      controller.context({ warehouses: this.warehouses(profile), paymentHolds: [] });
      controller.connection("disconnected");
      this.controllers.set(profile.id, controller);
    }
  }

  start(): void {
    this.openConnection();
  }

  snapshot(): PrintConsoleState {
    return {
      ...this.controller().snapshot(),
      selectedProfileId: this.active.id,
      switchingStore: this.switching,
      shopProfiles: this.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        warehouses: this.warehouses(profile)
      }))
    };
  }

  async settings(settings: Settings): Promise<void> {
    if (this.changingSettings) throw new Error("Print settings are busy");
    this.changingSettings = true;
    try {
      await this.applySettings(settings);
    } finally {
      this.changingSettings = false;
    }
  }

  private async applySettings(settings: Settings): Promise<void> {
    if (this.switching || this.stopped) throw new Error("Store switch is busy");
    const profile = this.profiles.find(
      (candidate) => candidate.id === (settings.profileId ?? this.active.id)
    );
    if (!profile) throw new Error("Unknown shop");
    const warehouseId =
      settings.warehouseId ?? this.controllers.get(profile.id)!.snapshot().selectedWarehouseId;
    if (!profile.warehouseIds.includes(warehouseId))
      throw new Error("Warehouse does not belong to selected shop");
    if (profile.id === this.active.id) {
      if (settings.paused === false && !this.verified)
        throw new Error("Shop identity is not verified");
      await this.options.persist?.({ profileId: profile.id, warehouseId });
      this.controller().settings({
        warehouseId,
        ...(settings.paused === undefined ? {} : { paused: settings.paused })
      });
      if (!this.verified && (settings.warehouseId || settings.profileId)) {
        this.connection?.close();
        this.openConnection();
      }
      return;
    }
    this.switching = true;
    this.verified = false;
    this.generation++;
    this.connection?.close();
    const old = this.controller();
    old.connection("disconnected");
    try {
      // Stop new work, but allow the one label already in the printer to finish.
      await old.suspend();
      if (this.stopped) return;
      await this.options.persist?.({ profileId: profile.id, warehouseId });
      this.active = profile;
      this.controller().settings({
        warehouseId,
        ...(settings.paused === undefined ? {} : { paused: settings.paused })
      });
      this.openConnection();
    } catch (error) {
      this.controller().connection("error", "店铺切换失败，请重新选择店铺重试。");
      throw error;
    } finally {
      this.switching = false;
    }
  }

  // Only the local dry-run endpoint uses this entry point. Live jobs enter via
  // the authenticated connection and must pass all identity checks below.
  receive(job: LabelPrintJob): void {
    if (!this.controller().snapshot().dryRun || !this.verified || this.switching)
      throw new Error("Demo unavailable");
    this.controller().receive({ ...job, shopId: this.active.shopId, storeId: this.active.id });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.verificationRetry);
    this.generation++;
    this.verified = false;
    this.connection?.close();
    await this.controller().suspend();
  }

  private controller(): PrintController {
    return this.controllers.get(this.active.id)!;
  }
  private warehouses(profile: ShopProfile) {
    return profile.warehouseIds.map((id) => ({ id, name: `仓库 ${id}` }));
  }

  private openConnection(): void {
    if (this.stopped) return;
    clearTimeout(this.verificationRetry);
    const profile = this.active;
    const controller = this.controller();
    const generation = ++this.generation;
    let attempt = 0;
    let identity: ShopIdentity | undefined;
    let pendingContext: PrintContext | undefined;
    let pendingJobs: LabelPrintJob[] = [];
    const current = () => !this.stopped && generation === this.generation;
    controller.setEnabled(false);
    controller.connection("connecting");
    this.verified = false;
    const fail = () => {
      if (!current()) return;
      attempt++;
      identity = undefined;
      this.verified = false;
      controller.setEnabled(false);
      controller.connection(
        "error",
        "店铺身份核对失败或连接不可用，已停止打印，请检查该店铺的凭据及仓库配置。"
      );
    };
    const applyContext = (context: PrintContext) => {
      if (
        (context.shopId && context.shopId !== profile.shopId) ||
        (identity?.storeId && context.storeId && context.storeId !== identity.storeId)
      ) {
        fail();
        return;
      }
      controller.context({
        ...context,
        warehouses: this.warehouses(profile),
        paymentHolds: context.paymentHolds.filter(
          (hold) => !hold.warehouseId || profile.warehouseIds.includes(hold.warehouseId)
        )
      });
    };
    const verifyConnection = () => {
        clearTimeout(this.verificationRetry);
        if (!current()) return;
        const verificationAttempt = ++attempt;
        controller.setEnabled(false);
        controller.connection("connecting");
        this.verified = false;
        void (this.options.verify
          ? this.options.verify(profile)
          : verifyShopIdentity(profile, pendingJobs[0]))
          .then((verified) => {
            if (!current() || verificationAttempt !== attempt) return;
            if (
              verified.shopId !== profile.shopId ||
              (verified.warehouseIds &&
                profile.warehouseIds.some((id) => !verified.warehouseIds!.includes(id)))
            ) {
              fail();
              return;
            }
            identity = verified;
            if (pendingContext) applyContext(pendingContext);
            if (verificationAttempt !== attempt) return;
            if (pendingJobs.some((job) => verified.storeId && job.storeId !== verified.storeId)) {
              pendingJobs = [];
              fail();
              return;
            }
            for (const job of pendingJobs.splice(0)) controller.receive(job);
            this.verified = true;
            controller.connection("connected");
            controller.setEnabled(true);
          })
          .catch((error: unknown) => {
            if (current() && verificationAttempt === attempt) {
              fail();
              if (error instanceof WaitingForShopEvidence) {
                controller.connection("connecting", "等待店铺订单确认：旧版云端暂无历史，收到匹配订单后自动开始打印。");
              }
              const failedAttempt = attempt;
              this.verificationRetry = setTimeout(() => {
                if (current() && attempt === failedAttempt) verifyConnection();
              }, 5000);
              this.verificationRetry.unref();
            }
          });
    };
    this.connection = (this.options.connect ?? connectShop)(profile, {
      connected: verifyConnection,
      disconnected: () => {
        if (!current()) return;
        attempt++;
        identity = undefined;
        pendingContext = undefined;
        pendingJobs = [];
        this.verified = false;
        controller.setEnabled(false);
        controller.connection("disconnected");
      },
      error: fail,
      context: (payload) => {
        if (!current()) return;
        const parsed = printContextSchema.safeParse(payload);
        if (!parsed.success) {
          fail();
          return;
        }
        pendingContext = parsed.data;
        if (identity) applyContext(parsed.data);
      },
      holds: (payload) => {
        if (!current() || !identity || !this.verified) return;
        const parsed = paymentHoldSchema.array().safeParse(payload);
        if (!parsed.success) {
          fail();
          return;
        }
        controller.paymentHolds(
          parsed.data.filter(
            (hold) => !hold.warehouseId || profile.warehouseIds.includes(hold.warehouseId)
          )
        );
      },
      job: (payload) => {
        if (!current()) return;
        const parsed = labelPrintJobSchema.safeParse(payload);
        if (!parsed.success) {
          fail();
          return;
        }
        const job = parsed.data;
        if (
          job.shopId !== profile.shopId ||
          !profile.warehouseIds.includes(job.warehouseId) ||
          (identity?.storeId && job.storeId !== identity.storeId)
        ) {
          fail();
          return;
        }
        // The controller stays disabled while verification is in progress.
        // Shop + warehouse checks also protect legacy servers without identity metadata.
        if (!identity || !this.verified) {
          if (pendingJobs.length >= 1000) {
            fail();
            return;
          }
          pendingJobs.push(job);
        } else controller.receive(job);
      }
    });
  }
}
