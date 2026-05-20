import type { DiagnoseUnpaidResponse } from "@sniffy/scraper/schemas";

export class PaymentRequiredError extends Error {
  readonly sniffId: DiagnoseUnpaidResponse["sniffId"];
  readonly payment: DiagnoseUnpaidResponse["payment"];
  readonly response: DiagnoseUnpaidResponse;

  constructor(payload: DiagnoseUnpaidResponse) {
    super(
      `Payment required for sniffId=${payload.sniffId}: ${payload.payment.amount} on ${payload.payment.network}`,
    );
    this.name = "PaymentRequiredError";
    this.sniffId = payload.sniffId;
    this.payment = payload.payment;
    this.response = payload;
  }
}
