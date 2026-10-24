/**
 * SENSEX option-chain provider readiness (not implemented — do not fake).
 *
 * Current block: YahooNseProvider / NSE option-chain-v3 serves NIFTY & BANKNIFTY only.
 * SENSEX options trade on BSE — NSE public chain does not return them.
 *
 * To go from C → A, a provider must supply:
 * 1) Instrument metadata: underlying SENSEX, exchange BSE, lot size, tick
 * 2) Expiry calendar mapping (weekly/monthly SENSEX expiries)
 * 3) Quote/chain endpoint or WS with: strike, CE/PE, LTP, bid, ask, OI, OIΔ, volume, IV?, greeks?
 * 4) Normalization into NormalizedOptionChain (same contract as NIFTY)
 * 5) as_of timestamp + provider id for LIVE/STALE
 *
 * UI already shows disabled SENSEX chip with reason — do not invent rows.
 */

export const SENSEX_OPTION_CHAIN_STATUS = {
  status: "provider_required" as const,
  exchange: "BSE",
  currentProvider: "yahoo_nse / NSE option-chain-v3",
  blocks: [
    "NSE public option-chain-v3 does not serve SENSEX",
    "No BSE option-chain adapter registered",
    "No SENSEX expiry instrument master in current provider",
  ],
  requiredCapabilities: [
    "option_chain",
    "instrument_metadata",
    "expiry_calendar",
    "live_or_polled_quotes",
  ],
  userMessage:
    "SENSEX options Unavailable from current provider (BSE feed required). NIFTY/BANKNIFTY use NSE chain.",
};
