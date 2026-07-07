export interface RawQuote {
  price: number;
  currency: string;
  asOf: Date;
}

export interface PriceProvider {
  fetchQuote(providerSymbol: string): Promise<RawQuote>;
}
