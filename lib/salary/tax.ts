import { query } from "@/lib/db";
import type { TaxConfig, TaxRegime, TaxSlab } from "@/lib/salary/types";

const DEFAULT_NEW_REGIME: TaxConfig = {
  financialYear: "FY 2025-26",
  regime: "new_regime",
  standardDeduction: 75000,
  rebateThreshold: 1275000,
  cessPercent: 4,
  slabs: [
    { minAmount: 0, maxAmount: 400000, ratePercent: 0 },
    { minAmount: 400001, maxAmount: 800000, ratePercent: 5 },
    { minAmount: 800001, maxAmount: 1200000, ratePercent: 10 },
    { minAmount: 1200001, maxAmount: 1600000, ratePercent: 15 },
    { minAmount: 1600001, maxAmount: 2000000, ratePercent: 20 },
    { minAmount: 2000001, maxAmount: 2400000, ratePercent: 25 },
    { minAmount: 2400001, maxAmount: null, ratePercent: 30 },
  ],
};

const DEFAULT_OLD_REGIME: TaxConfig = {
  financialYear: "FY 2025-26",
  regime: "old_regime",
  standardDeduction: 50000,
  rebateThreshold: 500000,
  cessPercent: 4,
  slabs: [
    { minAmount: 0, maxAmount: 250000, ratePercent: 0 },
    { minAmount: 250001, maxAmount: 500000, ratePercent: 5 },
    { minAmount: 500001, maxAmount: 1000000, ratePercent: 20 },
    { minAmount: 1000001, maxAmount: null, ratePercent: 30 },
  ],
};

function defaultConfigForRegime(regime: TaxRegime): TaxConfig {
  return regime === "old_regime" ? DEFAULT_OLD_REGIME : DEFAULT_NEW_REGIME;
}

export async function loadActiveTaxConfig(regime: TaxRegime): Promise<TaxConfig> {
  if (regime === "manual_tds") return DEFAULT_NEW_REGIME;
  const cfgRes = await query(
    `
    SELECT id, financial_year, regime, standard_deduction, rebate_threshold, cess_percent
    FROM tax_configs
    WHERE regime = $1 AND is_active = TRUE
    ORDER BY updated_at DESC, id DESC
    LIMIT 1
    `,
    [regime]
  );
  if (cfgRes.rowCount === 0) return defaultConfigForRegime(regime);
  const row = cfgRes.rows[0] as any;
  const slabRes = await query(
    `
    SELECT min_amount, max_amount, rate_percent
    FROM tax_slabs
    WHERE tax_config_id = $1
    ORDER BY sort_order ASC, min_amount ASC
    `,
    [Number(row.id)]
  );
  const slabs: TaxSlab[] = slabRes.rows.map((s: any) => ({
    minAmount: Number(s.min_amount || 0),
    maxAmount: s.max_amount == null ? null : Number(s.max_amount),
    ratePercent: Number(s.rate_percent || 0),
  }));
  return {
    financialYear: String(row.financial_year || "FY 2025-26"),
    regime: row.regime === "old_regime" ? "old_regime" : "new_regime",
    standardDeduction: Number(row.standard_deduction || 0),
    rebateThreshold: Number(row.rebate_threshold || 0),
    cessPercent: Number(row.cess_percent || 0),
    slabs: slabs.length ? slabs : defaultConfigForRegime(regime).slabs,
  };
}

export function calculateAnnualTaxFromConfig(grossAnnualTaxableSalary: number, config: TaxConfig) {
  const taxableIncome = Math.max(0, grossAnnualTaxableSalary - config.standardDeduction);
  if (taxableIncome <= config.rebateThreshold) {
    return {
      taxableIncome,
      annualTaxBeforeCess: 0,
      annualTax: 0,
    };
  }
  let tax = 0;
  for (const slab of config.slabs) {
    if (taxableIncome < slab.minAmount) continue;
    const upper = slab.maxAmount == null ? taxableIncome : Math.min(taxableIncome, slab.maxAmount);
    const width = upper - slab.minAmount + 1;
    if (width <= 0) continue;
    tax += width * (slab.ratePercent / 100);
  }
  const cess = tax * (config.cessPercent / 100);
  return {
    taxableIncome,
    annualTaxBeforeCess: tax,
    annualTax: tax + cess,
  };
}

