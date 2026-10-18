import type { Metadata } from 'next';
import {
  MAX_LISTING_EXPIRY_DAYS,
  MAX_MARKET_TAX_PERCENT,
  MIN_MARKET_TAX_PERCENT,
} from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import { NumberField, SettingsForm } from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { saveTcgRules } from './actions';

export const metadata: Metadata = { title: 'Waifu TCG · Owner Console · Ririko Dashboard' };

export default async function OwnerTcgPage() {
  await requireOwner('/owner/tcg');
  const { tcgRules } = await getWebServices();
  const values = await tcgRules.get();

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/tcg" />
      <header>
        <h1 className="text-2xl font-bold">Waifu TCG</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Cards, energy and market listings belong to a player on every server, so these rules are
          set here and not per server. Card drops and the TCG Manager Role are set per server on
          each server&apos;s Waifu TCG page. The bot picks up a change within 30 seconds.
        </p>
      </header>
      <SettingsForm action={saveTcgRules}>
        <h2 className="text-lg font-semibold">Market</h2>
        <NumberField
          name="marketTaxPercent"
          label="Market tax (%)"
          description={`Taken from the seller when a listed card sells, ${MIN_MARKET_TAX_PERCENT} to ${MAX_MARKET_TAX_PERCENT}. Listings keep the tax they were listed with.`}
          min={MIN_MARKET_TAX_PERCENT}
          max={MAX_MARKET_TAX_PERCENT}
          defaultValue={values.marketTaxPercent}
        />
        <NumberField
          name="listingExpiryDays"
          label="Listing expiry (days)"
          description={`How long a new listing stays up before the card returns to its owner, 1 to ${MAX_LISTING_EXPIRY_DAYS}.`}
          min={1}
          max={MAX_LISTING_EXPIRY_DAYS}
          defaultValue={values.listingExpiryDays}
        />
        <h2 className="text-lg font-semibold">Energy</h2>
        <NumberField
          name="baseEnergyCapacity"
          label="Base energy capacity"
          description="Energy capacity at level 1, 50 to 200."
          min={50}
          max={200}
          defaultValue={values.baseEnergyCapacity}
        />
        <NumberField
          name="energyScalingPerLevel"
          label="Capacity per level"
          description="Added for each level after the first, 1 to 5. Level milestones (10, 25, 50, 75, 100) add a bonus on top."
          min={1}
          max={5}
          defaultValue={values.energyScalingPerLevel}
        />
        <NumberField
          name="globalMaxEnergyCap"
          label="Energy cap"
          description="No player's capacity goes above this, 100 to 1000, and never below the base capacity."
          min={100}
          max={1000}
          defaultValue={values.globalMaxEnergyCap}
        />
        <NumberField
          name="dailyEnergyPotionLimit"
          label="Energy potions per day"
          description="Energy potions a player can use each reset day, 1 to 10."
          min={1}
          max={10}
          defaultValue={values.dailyEnergyPotionLimit}
        />
        <NumberField
          name="maxBonusEnergyCap"
          label="Bonus energy cap"
          description="Most bonus energy a player can bank above their capacity, 0 to 500."
          min={0}
          max={500}
          defaultValue={values.maxBonusEnergyCap}
        />
        <NumberField
          name="dailyBonusEnergyIncrement"
          label="Bonus energy per day"
          description="Bonus energy added at each daily reset until the bonus cap, 0 to 50. 0 turns it off."
          min={0}
          max={50}
          defaultValue={values.dailyBonusEnergyIncrement}
        />
      </SettingsForm>
    </section>
  );
}
