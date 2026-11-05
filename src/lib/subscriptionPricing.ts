export type SubscriptionTier = { abonament: number; limit_dokumentow: number };
export type SubscriptionTierDraft = { abonament: string; limit_dokumentow: string };
export type SubscriptionPricingDraft = {
  kilka_abonamentow: boolean;
  abonamenty_od?: string | null;
  abonament: string;
  limit_dokumentow: string;
  abonamenty_progi: SubscriptionTierDraft[];
};

export function subscriptionPricingPayload(draft: SubscriptionPricingDraft) {
  if (!draft.kilka_abonamentow) return {
    kilka_abonamentow: false,
    abonamenty_od: null,
    abonamenty_progi: [],
    abonament: draft.abonament ? Number(draft.abonament) : null,
    limit_dokumentow: draft.limit_dokumentow ? Number(draft.limit_dokumentow) : null,
  };
  if (draft.abonamenty_progi.length < 2) throw new Error("Dodaj co najmniej dwa abonamenty.");
  const tiers = draft.abonamenty_progi.map((tier) => {
    const abonament = Number(tier.abonament.replace(",", "."));
    const limit_dokumentow = Number(tier.limit_dokumentow);
    if (!tier.abonament.trim() || !Number.isFinite(abonament) || abonament <= 0
      || Math.abs(abonament * 100 - Math.round(abonament * 100)) > 0.000001) {
      throw new Error("Każdy abonament musi mieć dodatnią kwotę z maksymalnie dwoma miejscami po przecinku.");
    }
    if (!tier.limit_dokumentow.trim() || !Number.isSafeInteger(limit_dokumentow) || limit_dokumentow <= 0 || limit_dokumentow > 2147483647) {
      throw new Error("Każdy limit musi być dodatnią, całkowitą liczbą dokumentów.");
    }
    return { abonament, limit_dokumentow };
  }).sort((a, b) => a.limit_dokumentow - b.limit_dokumentow);
  if (tiers.some((tier, index) => index > 0 && (tier.limit_dokumentow === tiers[index - 1].limit_dokumentow || tier.abonament < tiers[index - 1].abonament))) {
    throw new Error("Limity nie mogą się powtarzać, a kwoty abonamentów nie mogą maleć przy wyższych limitach.");
  }
  const parts = new Intl.DateTimeFormat("en", { year: "numeric", month: "2-digit", timeZone: "Europe/Warsaw" }).formatToParts(new Date());
  const start = draft.abonamenty_od || `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}-01`;
  return { kilka_abonamentow: true, abonamenty_od: start, abonamenty_progi: tiers,
    abonament: tiers[0].abonament, limit_dokumentow: tiers[0].limit_dokumentow };
}
