import { BOSS_WARD_FIELDS, DUNGEON_ELEMENTS, type BossFormValues } from '@ririko/services/dungeon';
import { NumberField, SelectField, SettingsForm, TextField } from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { EnrageFields } from './season-form';

const ELEMENT_OPTIONS = DUNGEON_ELEMENTS.map((element) => ({ value: element, label: element }));

/** Combat settings and signature drop of one dungeon boss. */
export function BossForm({
  action,
  values,
  items,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  values: BossFormValues;
  /** TCG items a boss can drop, as code and label. */
  items: { value: string; label: string; group?: string }[];
}) {
  return (
    <SettingsForm action={action} submitLabel="Save boss">
      <h2 className="text-lg font-semibold">Stats</h2>
      <p className="-mt-4 text-sm text-zinc-400">
        Multipliers on the season curve&apos;s stats for this boss&apos;s floor. Empty means 1.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(
          [
            ['hpMultiplier', 'HP ×'],
            ['attackMultiplier', 'ATK ×'],
            ['defenseMultiplier', 'DEF ×'],
            ['speedMultiplier', 'SPD ×'],
          ] as const
        ).map(([name, label]) => (
          <NumberField
            key={name}
            name={name}
            label={label}
            min={0.1}
            max={20}
            step="any"
            defaultValue={values[name]}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="critRatePercent"
          label="Crit rate (%)"
          description="Empty means 10%."
          min={0}
          max={100}
          defaultValue={values.critRatePercent}
        />
        <NumberField
          name="critDamage"
          label="Crit damage ×"
          description="Empty means 1.5."
          min={1}
          max={5}
          step="any"
          defaultValue={values.critDamage}
        />
      </div>
      <NumberField
        name="maxTurns"
        label="Turn limit"
        description="The fight is lost when it runs out, 5 to 50. Empty means 25."
        min={5}
        max={50}
        defaultValue={values.maxTurns}
      />

      <h2 className="text-lg font-semibold">Skill</h2>
      <p className="-mt-4 text-sm text-zinc-400">
        Leave all empty for the generic skill. A name and MP cost are needed to set one.
      </p>
      <TextField
        name="skillName"
        label="Name"
        maxLength={64}
        defaultValue={values.skillName ?? ''}
      />
      <TextField
        name="skillDescription"
        label="Description"
        maxLength={300}
        defaultValue={values.skillDescription ?? ''}
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="skillMpCost"
          label="MP cost"
          min={1}
          max={100}
          defaultValue={values.skillMpCost}
        />
        <NumberField
          name="skillPower"
          label="Power ×"
          description="Damage over a basic attack. Empty means 1.5."
          min={0.1}
          max={10}
          step="any"
          defaultValue={values.skillPower}
        />
      </div>

      <h2 className="text-lg font-semibold">Enrage</h2>
      <EnrageFields values={values} scope="boss" />

      <h2 className="text-lg font-semibold">Ward shields</h2>
      <p className="-mt-4 text-sm text-zinc-400">
        Layers the player breaks in order before hitting the boss. Hits of the layer&apos;s element
        break it fastest; other elements only chip it. The HP share is a percentage of the
        boss&apos;s max HP. With no layers, bosses from floor 20 get generated wards.
      </p>
      {BOSS_WARD_FIELDS.map(([elementField, percentField], index) => (
        <div key={elementField} className="grid grid-cols-2 gap-4">
          <SelectField
            name={elementField}
            label={`Layer ${index + 1} element`}
            options={ELEMENT_OPTIONS}
            emptyLabel="None"
            defaultValue={values[elementField] ?? ''}
          />
          <NumberField
            name={percentField}
            label="HP share (%)"
            min={1}
            max={200}
            defaultValue={values[percentField]}
          />
        </div>
      ))}

      <h2 className="text-lg font-semibold">Drop</h2>
      <SelectField
        name="signatureDropCode"
        label="Signature drop"
        description="Given on the first clear of the boss's floor, and sometimes on repeat clears."
        options={items}
        emptyLabel="None (the floor's fallback reward)"
        defaultValue={values.signatureDropCode ?? ''}
      />
    </SettingsForm>
  );
}
