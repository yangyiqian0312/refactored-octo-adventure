export type TikTokOrderDetails = {
  orderId: string;
  buyerDisplayName?: string;
  productTitle: string;
  quantity: number;
  imageUrl?: string;
};

export interface TikTokOrderClient {
  getOrderDetails(orderId: string): Promise<TikTokOrderDetails | undefined>;
}

export class PlaceholderTikTokOrderClient implements TikTokOrderClient {
  async getOrderDetails(_orderId: string): Promise<TikTokOrderDetails | undefined> {
    // TODO: Implement with official TikTok Shop Partner Order API signing,
    // endpoint paths, headers, rate limits, and response schemas.
    return undefined;
  }
}
