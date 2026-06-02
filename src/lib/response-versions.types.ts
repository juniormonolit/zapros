/** One response line with the request item name for display. */
export interface ResponseVersionLine {
  id: string;
  requestItemId: string;
  itemName: string;
  sortOrder: number;
  priceWithVat: number | null;
  priceCash: number | null;
  priceWithoutVat: number | null;
  deliveryPrice: number | null;
  priceIncludesDelivery: boolean;
  inStock: boolean | null;
  leadTimeDays: number | null;
  lineComment: string | null;
}

/** Supplier response version with line snapshot rows. */
export interface ResponseVersionWithLines {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  comment: string | null;
  submittedAt: string;
  lines: ResponseVersionLine[];
}
