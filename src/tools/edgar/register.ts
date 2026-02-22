import { toolRegistry } from "../registry.js";
import { edgarSearchCompany } from "./company-search.js";
import { edgarGetFilings } from "./filing-fetch.js";
import { edgarGetFinancialFacts } from "./xbrl-facts.js";

/** Register all SEC EDGAR tools — always available (no API key needed) */
export function registerEdgarTools(): void {
  toolRegistry.register(edgarSearchCompany);
  toolRegistry.register(edgarGetFilings);
  toolRegistry.register(edgarGetFinancialFacts);
}
