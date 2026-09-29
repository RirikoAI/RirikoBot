import {
  MAX_TCG_FLAT_GEAR_STAT,
  MAX_TCG_ITEM_PRICE,
  MAX_TCG_PURCHASE_LIMIT,
  TCG_BATTLE_PERKS,
  TCG_FLAT_GEAR_STATS,
  TCG_FRACTION_GEAR_STATS,
  TCG_GEAR_SLOTS,
  TCG_ITEM_RARITIES,
  type TcgGearStat,
} from '@ririko/core';
import {
  ListField,
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  ToggleField,
} from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';

type Action = (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;

export interface ShopFieldValues {
  isShopBuyable: boolean;
  shopPrice: number;
  maxDailyPurchases: number;
}

export interface GearFormValues extends ShopFieldValues {
  code: string;
  name: string;
  description: string;
  subtype: string;
  rarity: string;
  battlePerks: string[];
  isTradeable: boolean;
  stats: Partial<Record<TcgGearStat, number>>;
}

export const NEW_GEAR_VALUES: GearFormValues = {
  code: '',
  name: '',
  description: '',
  subtype: 'WEAPON',
  rarity: 'COMMON',
  battlePerks: [],
  isTradeable: true,
  isShopBuyable: true,
  shopPrice: 500,
  maxDailyPurchases: 3,
  stats: {},
};

const STAT_LABELS: Record<TcgGearStat, string> = {
  attack: 'Attack',
  defense: 'Defense',
  health: 'Health',
  speed: 'Speed',
  manaShield: 'Mana shield',
  manaMax: 'Max MP',
  critRate: 'Crit rate',
  critDamage: 'Crit damage',
  mitigation: 'Damage mitigation',
  elementalMastery: 'Elemental mastery',
  armorPiercing: 'Armor piercing',
  elementalResistance: 'Elemental resistance',
  manaRegen: 'MP regeneration',
};

function label(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ShopFields({ values }: { values: ShopFieldValues }) {
  return (
    <>
      <ToggleField
        name="isShopBuyable"
        label="Sold in the Town Shop"
        description="Off: players only get it from drops, crafting or rewards (and the daily rotation, for items in its pool)."
        defaultValue={values.isShopBuyable}
      />
      <NumberField
        name="shopPrice"
        label="Price (credits)"
        description="Also the base of crafting and enhancement costs."
        min={0}
        max={MAX_TCG_ITEM_PRICE}
        defaultValue={values.shopPrice}
      />
      <NumberField
        name="maxDailyPurchases"
        label="Purchase limit"
        description={`Most a player can buy in one purchase; 0 means no limit. At most ${MAX_TCG_PURCHASE_LIMIT}.`}
        min={0}
        max={MAX_TCG_PURCHASE_LIMIT}
        defaultValue={values.maxDailyPurchases}
      />
    </>
  );
}

/** The shop fields of any item; for built-in items the only editable part. */
export function ShopFieldsForm({ action, values }: { action: Action; values: ShopFieldValues }) {
  return (
    <SettingsForm action={action} submitLabel="Save shop settings">
      <ShopFields values={values} />
    </SettingsForm>
  );
}

/** Every field of a custom gear piece, shared by the new and edit pages. */
export function GearForm({
  action,
  values,
  codeLocked,
  submitLabel,
}: {
  action: Action;
  values: GearFormValues;
  codeLocked: boolean;
  submitLabel: string;
}) {
  return (
    <SettingsForm action={action} submitLabel={submitLabel}>
      {codeLocked ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-zinc-200">Code</p>
          <p className="font-mono text-sm text-zinc-300">{values.code}</p>
        </div>
      ) : (
        <TextField
          name="code"
          label="Code"
          description="2 to 40 letters, digits or underscores; saved with a CUSTOM_ prefix. It cannot change later."
          maxLength={48}
          defaultValue={values.code}
        />
      )}
      <TextField name="name" label="Name" maxLength={64} defaultValue={values.name} />
      <TextField
        name="description"
        label="Description"
        maxLength={500}
        defaultValue={values.description}
      />
      <SelectField
        name="subtype"
        label="Slot"
        options={TCG_GEAR_SLOTS.map((slot) => ({ value: slot, label: label(slot) }))}
        defaultValue={values.subtype}
      />
      <SelectField
        name="rarity"
        label="Rarity"
        description="Sets the enhancement cost multiplier."
        options={TCG_ITEM_RARITIES.map((rarity) => ({ value: rarity, label: label(rarity) }))}
        defaultValue={values.rarity}
      />
      <fieldset className="flex flex-col gap-4 rounded-md border border-edge p-4">
        <legend className="px-1 text-sm font-medium text-zinc-200">Stats</legend>
        <p className="text-xs text-zinc-400">
          Leave a stat empty if the piece does not have it. Each enhancement level adds 8% to
          whole-number stats.
        </p>
        {TCG_FLAT_GEAR_STATS.map((stat) => (
          <NumberField
            key={stat}
            name={stat}
            label={STAT_LABELS[stat]}
            min={0}
            max={MAX_TCG_FLAT_GEAR_STAT}
            defaultValue={values.stats[stat] ?? null}
          />
        ))}
        {TCG_FRACTION_GEAR_STATS.map((stat) => (
          <NumberField
            key={stat}
            name={stat}
            label={`${STAT_LABELS[stat]} (0.1 = 10%)`}
            min={0}
            max={1}
            step="any"
            defaultValue={values.stats[stat] ?? null}
          />
        ))}
      </fieldset>
      <ListField
        name="battlePerks"
        label="Battle perks"
        description="Special effects the piece gives its card in battle."
        options={TCG_BATTLE_PERKS.map((perk) => ({ value: perk, label: label(perk) }))}
        defaultValue={values.battlePerks}
        addLabel="Add a perk…"
      />
      <ToggleField
        name="isTradeable"
        label="Tradeable"
        description="Players can trade and list it on the market."
        defaultValue={values.isTradeable}
      />
      <ShopFields values={values} />
    </SettingsForm>
  );
}
