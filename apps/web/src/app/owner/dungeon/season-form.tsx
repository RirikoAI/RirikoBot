import {
  SCALING_MODELS,
  SEASON_AFFIX_CHOICES,
  SEASON_AFFIX_SETS,
  SEASON_THEME_ELEMENTS,
  type SeasonFormValues,
} from '@ririko/services/dungeon';
import {
  DateField,
  NumberField,
  SelectField,
  SettingsForm,
  TextField,
  ToggleField,
} from '@/components/settings-form';
import type { SettingsFormState } from '@/lib/settings-form-state';

const AFFIX_LABELS: Record<(typeof SEASON_AFFIX_CHOICES)[number], string> = {
  NONE: 'None',
  INFERNAL_CRUCIBLE: 'Infernal Crucible: Heat Haze, Scorched Earth',
  ABYSSAL_MAELSTROM: 'Abyssal Maelstrom: Torrential Deluge, Tidal Barrier',
  CELESTIAL_TWILIGHT: 'Celestial Twilight: Radiant Flare, Void Drain',
};

const MODEL_LABELS: Record<(typeof SCALING_MODELS)[number], string> = {
  LINEAR: 'Linear: base × (1 + k × (floor − 1))',
  POLYNOMIAL: 'Polynomial: base × (1 + α(floor − 1) + β(floor − 1)²)',
  EXPONENTIAL: 'Exponential: base × (1 + r)^(floor − 1)',
  HYBRID: 'Hybrid: fixed linear, then two exponential phases',
};

const TRUE_DAMAGE_OPTIONS = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

/** The dungeon season editor, shared by the new-season and edit-season pages. */
export function SeasonForm({
  action,
  values,
  isNew,
  submitLabel,
}: {
  action: (state: SettingsFormState, formData: FormData) => Promise<SettingsFormState>;
  values: SeasonFormValues;
  isNew: boolean;
  submitLabel: string;
}) {
  return (
    <SettingsForm action={action} submitLabel={submitLabel}>
      {isNew ? (
        <TextField
          name="id"
          label="Season ID"
          description="2 to 32 lowercase letters, digits or underscores, such as s2_abyssal_maelstrom. Player progress is kept by this ID, so it cannot change later."
          maxLength={32}
          defaultValue={values.id}
        />
      ) : null}
      <TextField name="name" label="Name" maxLength={80} defaultValue={values.name} />
      <TextField
        name="description"
        label="Description"
        description="Shown in /dungeon. At most 500 characters."
        maxLength={500}
        defaultValue={values.description}
      />

      <h2 className="text-lg font-semibold">Schedule</h2>
      <p className="-mt-4 text-sm text-zinc-400">
        Players climb the season that is on and inside its dates. When seasons overlap, the one that
        started last is live, so a queued season takes over on its start date. Dates are UTC.
      </p>
      <DateField name="startsAt" label="Starts" defaultValue={values.startsAt} />
      <DateField
        name="endsAt"
        label="Ends"
        description="The season closes at the start of this day."
        defaultValue={values.endsAt}
      />
      <ToggleField
        name="isActive"
        label="On"
        description="Switch a season off to take it out of rotation, whatever its dates."
        defaultValue={values.isActive}
      />

      <h2 className="text-lg font-semibold">Theme</h2>
      <SelectField
        name="themeElement"
        label="Theme element"
        description="Shown to players in /dungeon as the season's element. Fights are shaped by the affixes and bosses."
        options={SEASON_THEME_ELEMENTS.map((element) => ({ value: element, label: element }))}
        defaultValue={values.themeElement}
      />
      <SelectField
        name="affixSet"
        label="Seasonal affixes"
        description={`Battlefield effects in every fight of the season. The affixes stored are ${Object.values(
          SEASON_AFFIX_SETS,
        )
          .flat()
          .join(', ')}.`}
        options={SEASON_AFFIX_CHOICES.map((choice) => ({
          value: choice,
          label: AFFIX_LABELS[choice],
        }))}
        defaultValue={values.affixSet}
      />
      <NumberField
        name="affixStartFloor"
        label="Affixes start on floor"
        description="Earlier floors fight without affixes. Empty means floor 1."
        min={1}
        max={200}
        defaultValue={values.affixStartFloor}
      />

      <h2 className="text-lg font-semibold">Difficulty curve</h2>
      <SelectField
        name="scalingModel"
        label="Growth model"
        description="Hybrid uses fixed rates and ignores the growth parameters below; the base stats and boss multipliers still apply."
        options={SCALING_MODELS.map((model) => ({ value: model, label: MODEL_LABELS[model] }))}
        defaultValue={values.scalingModel}
      />
      <p className="-mt-2 text-sm text-zinc-400">
        Floor 1 base stats. Set all four, or leave all four empty for 1,200 HP, 120 ATK, 80 DEF and
        25 SPD.
      </p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <NumberField
          name="baseHp"
          label="HP"
          min={1}
          max={10_000_000}
          defaultValue={values.baseHp}
        />
        <NumberField
          name="baseAttack"
          label="ATK"
          min={1}
          max={1_000_000}
          defaultValue={values.baseAttack}
        />
        <NumberField
          name="baseDefense"
          label="DEF"
          min={0}
          max={1_000_000}
          defaultValue={values.baseDefense}
        />
        <NumberField
          name="baseSpeed"
          label="SPD"
          min={1}
          max={10_000}
          defaultValue={values.baseSpeed}
        />
      </div>
      <NumberField
        name="growthRate"
        label="Exponential rate r"
        description="Exponential model. Empty means 0.085."
        min={0.001}
        max={1}
        step="any"
        defaultValue={values.growthRate}
      />
      <NumberField
        name="linearK"
        label="Linear k"
        description="Linear model. Empty means 0.15."
        min={0.001}
        max={5}
        step="any"
        defaultValue={values.linearK}
      />
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="polyAlpha"
          label="Polynomial α"
          description="Empty means 0.08."
          min={0.001}
          max={5}
          step="any"
          defaultValue={values.polyAlpha}
        />
        <NumberField
          name="polyBeta"
          label="Polynomial β"
          description="Empty means 0.005."
          min={0.0001}
          max={1}
          step="any"
          defaultValue={values.polyBeta}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <NumberField
          name="miniBossMultiplier"
          label="Mini-boss multiplier"
          description="Every 5th floor. Empty means 1.75."
          min={0.1}
          max={20}
          step="any"
          defaultValue={values.miniBossMultiplier}
        />
        <NumberField
          name="majorBossMultiplier"
          label="Major boss multiplier"
          description="Every 10th floor. Empty means 3.2."
          min={0.1}
          max={20}
          step="any"
          defaultValue={values.majorBossMultiplier}
        />
      </div>

      <h2 className="text-lg font-semibold">Enrage</h2>
      <EnrageFields values={values} scope="season" />
    </SettingsForm>
  );
}

/** Enrage fields, shared with the boss editor. Empty fields fall back to the next level. */
export function EnrageFields({
  values,
  scope,
}: {
  values: Pick<SeasonFormValues, 'enrageStartTurn' | 'enragePerTurn' | 'enrageTrueDamage'>;
  scope: 'season' | 'boss';
}) {
  const fallback = scope === 'season' ? 'the default' : "the season's value";
  return (
    <>
      <p className="-mt-4 text-sm text-zinc-400">
        After a set turn the boss grows stronger every turn, so fights cannot stall. Empty fields
        use {fallback} (turn 10, +100% attack per turn, hits ignore defense).
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          name="enrageStartTurn"
          label="Starts on turn"
          min={1}
          max={50}
          defaultValue={values.enrageStartTurn}
        />
        <NumberField
          name="enragePerTurn"
          label="Attack gain per turn"
          description="1 means +100%."
          min={0}
          max={5}
          step="any"
          defaultValue={values.enragePerTurn}
        />
        <SelectField
          name="enrageTrueDamage"
          label="Hits ignore defense"
          options={TRUE_DAMAGE_OPTIONS}
          emptyLabel={scope === 'season' ? 'Default (yes)' : 'Season value'}
          defaultValue={values.enrageTrueDamage ?? ''}
        />
      </div>
    </>
  );
}
