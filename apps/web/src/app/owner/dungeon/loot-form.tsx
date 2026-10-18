import {
  FIRST_CLEAR_ITEM_FIELDS,
  MAX_LOOT_CREDITS,
  MAX_LOOT_DUST,
  MAX_LOOT_EXP,
  MAX_LOOT_QUANTITY,
  MAX_LOOT_WEIGHT,
  REPEAT_POOL_FIELDS,
  defaultFirstClearCurrencies,
  type FloorLootInput,
} from '@ririko/services/dungeon';
import { NumberField, SelectField, SettingsForm } from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';

type ItemOption = { value: string; label: string; group?: string };

function numberValue(values: FloorLootInput, name: string): number | null {
  const value = values[name];
  return typeof value === 'number' ? value : null;
}

function CurrencyFields({
  prefix,
  values,
  defaults,
}: {
  prefix: 'first' | 'repeat';
  values: FloorLootInput;
  defaults: { credits: string; exp: string; dust: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <NumberField
        name={`${prefix}Credits`}
        label="Credits"
        description={`Empty: ${defaults.credits}.`}
        min={0}
        max={MAX_LOOT_CREDITS}
        defaultValue={numberValue(values, `${prefix}Credits`)}
      />
      <NumberField
        name={`${prefix}Exp`}
        label="EXP"
        description={`Empty: ${defaults.exp}.`}
        min={0}
        max={MAX_LOOT_EXP}
        defaultValue={numberValue(values, `${prefix}Exp`)}
      />
      <NumberField
        name={`${prefix}Dust`}
        label="Crafting dust"
        description={`Empty: ${defaults.dust}.`}
        min={0}
        max={MAX_LOOT_DUST}
        defaultValue={numberValue(values, `${prefix}Dust`)}
      />
    </div>
  );
}

/** First-clear and repeat-clear loot of one floor. Empty fields keep the default loot. */
export function LootForm({
  action,
  values,
  items,
  floorNumber,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  values: FloorLootInput;
  items: ItemOption[];
  floorNumber: number;
}) {
  const isBossFloor = floorNumber % 5 === 0;
  const first = defaultFirstClearCurrencies(floorNumber);
  const codeValue = (name: string) => (values[name] as string | null) ?? '';

  return (
    <SettingsForm action={action} submitLabel="Save loot">
      <h2 className="text-lg font-semibold">First clear</h2>
      <p className="-mt-4 text-sm text-zinc-400">
        Given once, the first time a player clears the floor.
      </p>
      <CurrencyFields
        prefix="first"
        values={values}
        defaults={{
          credits: first.credits.toLocaleString('en-US'),
          exp: first.exp.toLocaleString('en-US'),
          dust: first.craftingDust.toLocaleString('en-US'),
        }}
      />
      <p className="text-sm text-zinc-400">
        Items replace the default{' '}
        {isBossFloor
          ? "fallback gear; the boss's signature drop is still given"
          : 'random item from the floor bracket'}
        . Leave all rows empty to keep the default.
      </p>
      {FIRST_CLEAR_ITEM_FIELDS.map(([codeField, quantityField], index) => (
        <div key={codeField} className="grid grid-cols-[1fr_8rem] gap-4">
          <SelectField
            name={codeField}
            label={`Item ${index + 1}`}
            options={items}
            emptyLabel="None"
            defaultValue={codeValue(codeField)}
          />
          <NumberField
            name={quantityField}
            label="Quantity"
            min={1}
            max={MAX_LOOT_QUANTITY}
            defaultValue={numberValue(values, quantityField)}
          />
        </div>
      ))}

      <h2 className="text-lg font-semibold">Repeat clears</h2>
      <CurrencyFields
        prefix="repeat"
        values={values}
        defaults={{
          credits: `${floorNumber * 25} to ${floorNumber * 25 + 50}, random`,
          exp: `${floorNumber * 5} to ${floorNumber * 5 + 10}, random`,
          dust: `${floorNumber * 2} to ${floorNumber * 2 + 5}, random`,
        }}
      />
      <NumberField
        name="repeatDropChancePercent"
        label="Item drop chance (%)"
        description={`Chance of one item from the pool below. Empty means 35%.${
          isBossFloor ? " The boss's signature drop is rolled first, at 8%." : ''
        }`}
        min={0}
        max={100}
        step="any"
        defaultValue={numberValue(values, 'repeatDropChancePercent')}
      />
      <p className="text-sm text-zinc-400">
        A weighted pool replaces the floor bracket&apos;s pool: an item with weight 3 drops three
        times as often as one with weight 1. Quantity is random between the minimum and maximum
        (empty means 1). Leave all rows empty to keep the bracket&apos;s pool.
      </p>
      {REPEAT_POOL_FIELDS.map(([codeField, weightField, minField, maxField], index) => (
        <div key={codeField} className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_6rem_6rem_6rem]">
          <div className="col-span-2 sm:col-span-1">
            <SelectField
              name={codeField}
              label={`Pool item ${index + 1}`}
              options={items}
              emptyLabel="None"
              defaultValue={codeValue(codeField)}
            />
          </div>
          <NumberField
            name={weightField}
            label="Weight"
            min={1}
            max={MAX_LOOT_WEIGHT}
            defaultValue={numberValue(values, weightField)}
          />
          <NumberField
            name={minField}
            label="Min"
            min={1}
            max={MAX_LOOT_QUANTITY}
            defaultValue={numberValue(values, minField)}
          />
          <NumberField
            name={maxField}
            label="Max"
            min={1}
            max={MAX_LOOT_QUANTITY}
            defaultValue={numberValue(values, maxField)}
          />
        </div>
      ))}
    </SettingsForm>
  );
}
