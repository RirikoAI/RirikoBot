import {
  ITEM_EFFECT_TYPES,
  ITEM_RARITIES,
  MAX_ITEM_CREDITS_AWARDED,
  MAX_ITEM_DAILY_PURCHASE_LIMIT,
  MAX_ITEM_DAILY_USAGE_CEILING,
  MAX_ITEM_ENERGY_RESTORED,
  MAX_ITEM_PRICE,
  MAX_ITEM_XP_AWARDED,
  type ItemEffectTypeName,
  type ItemRarity,
} from '@ririko/core';
import {
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  ToggleField,
} from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';

export interface ItemFormValues {
  code: string;
  name: string;
  description: string;
  price: number;
  rarity: ItemRarity | string;
  categoryId: string | null;
  iconUrl: string | null;
  isPurchasable: boolean;
  dailyPurchaseLimit: number | null;
  itemType: ItemEffectTypeName;
  energyRestored: number | null;
  dailyUsageCeiling: number | null;
  xpAwarded: number | null;
  creditsAwarded: number | null;
}

export const NEW_ITEM_VALUES: ItemFormValues = {
  code: '',
  name: '',
  description: '',
  price: 100,
  rarity: 'COMMON',
  categoryId: null,
  iconUrl: null,
  isPurchasable: true,
  dailyPurchaseLimit: null,
  itemType: 'GENERIC',
  energyRestored: null,
  dailyUsageCeiling: null,
  xpAwarded: null,
  creditsAwarded: null,
};

const EFFECT_LABELS: Record<ItemEffectTypeName, string> = {
  ENERGY_RESTORE: 'Restores TCG energy',
  XP_GRANT: 'Grants XP (in the server where it is used)',
  CREDITS_GRANT: 'Grants credits',
  PROFILE_BG_TOKEN: 'Profile background voucher',
  GENERIC: 'No effect (collectible)',
};

/** The shop item editor, shared by the new-item and edit-item pages. */
export function ItemForm({
  action,
  values,
  categories,
  codeLocked,
  submitLabel,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  values: ItemFormValues;
  categories: { id: string; name: string }[];
  /** A saved code cannot change: members type it in `/shop buy`. */
  codeLocked: boolean;
  submitLabel: string;
}) {
  return (
    <SettingsForm action={action} submitLabel={submitLabel}>
      {codeLocked ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-zinc-200">Code</p>
          <p className="font-mono text-sm text-zinc-300">{values.code}</p>
          <p className="text-xs text-zinc-400">
            Members buy the item with <code>/shop buy {values.code}</code>. A code cannot change.
          </p>
        </div>
      ) : (
        <TextField
          name="code"
          label="Code"
          description="What members type in /shop buy: 2 to 32 lowercase letters, digits or underscores. It cannot change later."
          maxLength={32}
          defaultValue={values.code}
        />
      )}
      <TextField name="name" label="Name" maxLength={64} defaultValue={values.name} />
      <TextField
        name="description"
        label="Description"
        description="Shown in /shop. At most 500 characters."
        maxLength={500}
        defaultValue={values.description}
      />
      <NumberField
        name="price"
        label="Price (credits)"
        min={0}
        max={MAX_ITEM_PRICE}
        defaultValue={values.price}
      />
      <SelectField
        name="rarity"
        label="Rarity"
        options={ITEM_RARITIES.map((rarity) => ({ value: rarity, label: rarity }))}
        defaultValue={values.rarity}
      />
      <SelectField
        name="categoryId"
        label="Category"
        description="/shop lists items under their category."
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        emptyLabel="No category"
        defaultValue={values.categoryId ?? ''}
      />
      <TextField
        name="iconUrl"
        label="Icon URL"
        description="Optional https:// image."
        maxLength={500}
        defaultValue={values.iconUrl ?? ''}
      />
      <ToggleField
        name="isPurchasable"
        label="On sale"
        description="Retired items stay in members' inventories but cannot be bought."
        defaultValue={values.isPurchasable}
      />
      <NumberField
        name="dailyPurchaseLimit"
        label="Daily purchase limit"
        description={`Most a member can buy per day. Leave empty for no limit. At most ${MAX_ITEM_DAILY_PURCHASE_LIMIT}.`}
        min={1}
        max={MAX_ITEM_DAILY_PURCHASE_LIMIT}
        defaultValue={values.dailyPurchaseLimit}
      />
      <SelectField
        name="itemType"
        label="Effect when used"
        description="Only the amount for the chosen effect is saved."
        options={ITEM_EFFECT_TYPES.map((type) => ({ value: type, label: EFFECT_LABELS[type] }))}
        defaultValue={values.itemType}
      />
      <NumberField
        name="energyRestored"
        label="Energy restored"
        description={`For "Restores TCG energy". At most ${MAX_ITEM_ENERGY_RESTORED}.`}
        min={1}
        max={MAX_ITEM_ENERGY_RESTORED}
        defaultValue={values.energyRestored}
      />
      <NumberField
        name="dailyUsageCeiling"
        label="Uses per day"
        description={`For "Restores TCG energy": how many a member can use per day. Empty means 3. At most ${MAX_ITEM_DAILY_USAGE_CEILING}.`}
        min={1}
        max={MAX_ITEM_DAILY_USAGE_CEILING}
        defaultValue={values.dailyUsageCeiling}
      />
      <NumberField
        name="xpAwarded"
        label="XP granted"
        description={`For "Grants XP". At most ${MAX_ITEM_XP_AWARDED.toLocaleString('en-US')}.`}
        min={1}
        max={MAX_ITEM_XP_AWARDED}
        defaultValue={values.xpAwarded}
      />
      <NumberField
        name="creditsAwarded"
        label="Credits granted"
        description={`For "Grants credits". Keep it below the price, or buying and using the item creates credits. At most ${MAX_ITEM_CREDITS_AWARDED.toLocaleString('en-US')}.`}
        min={1}
        max={MAX_ITEM_CREDITS_AWARDED}
        defaultValue={values.creditsAwarded}
      />
    </SettingsForm>
  );
}
