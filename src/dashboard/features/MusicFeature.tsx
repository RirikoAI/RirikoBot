import { Flex, Heading, SimpleGrid, Text } from "@chakra-ui/layout";
import { MusicFeature, WelcomeMessageFeature } from "@dashboard/config/types";
import { ChannelSelect } from "./ChannelSelect";
import { RolesSelect } from "./RolesSelect";
import { useForm, useFormRender } from "@dashboard/hooks/forms/useForm";
import { SelectField } from "@dashboard/components/forms/SelectField";
import { createI18n } from "@dashboard/hooks/i18n";
import { provider } from "@dashboard/config/translations/provider";
import { MusicPlayer } from "@dashboard/components/music/MusicPlayer";

/**
 * Support i18n (Localization)
 */
const {T} = createI18n(provider, {
  ms: {
    message: "Mesej",
  },
  en: {
    message: "Message",
  },
  cn: {
    message: "信息",
  },
  ja: {
    message: "メッセージ",
  },
});

/**
 * Used to configure a feature
 *
 * It renders a form
 *
 * @param data The current options of music feature
 */
export function useMusicFeature(data: MusicFeature) {
  return useFormRender<Partial<MusicFeature>>({
    //we will use current options as the default value
    defaultValue: {bool: false, tags: [], ...data},
    //verify values
    verify: (v, errors) => {
      if (v.message != null && v.message.trim().length === 0) {
        errors.message = "Message can't be empty or blank";
      }
      
      if (v.count === "0") errors.count = "Can't be 0";
    },
    //define container component
    container: (f) => (<>
        <Flex direction="column" gap={ 2 } mt={ 3 }>
          {/*<Heading size="md">Currently Playing...</Heading>*/ }
          {/*<Text variant="secondary">Artist</Text>*/ }
          <MusicPlayer props={ data }/>
        </Flex>
        <SimpleGrid columns={ {base: 1, md: 2} } gap={ 3 }>
          { f }
        </SimpleGrid>
      </>
    ),
    //render form inputs
    render: ({value, update, errors, ...form}) => [
      {
        //memorize values and errors for better performance
        defaultMemorize: ["value", "error"],
      },
      // {
      //   label: <T text="message"/>,
      //   description: "Hello World!!!",
      //   type: "input",
      //   value: value.message,
      //   onChange: (message) => update({message}),
      //   error: errors.message,
      // },
      // {
      //   type: "input",
      //   label: "Count",
      //   placeholder: "Put a number",
      //   value: value.count ?? "0",
      //   onChange: (v) => update({count: v}),
      //   error: errors.count,
      //   input: {
      //     //check instantly after blur
      //     onBlur: () => form.checkValue("count"),
      //     type: "number",
      //   },
      // },
      // {
      //   type: "small-color",
      //   label: "Role Color",
      //   description: "Pick a color",
      //   value: value.color,
      //   onChange: (color) => update({color}),
      // },
      // {
      //   type: "small-date",
      //   label: "Date",
      //   description: "Select a date",
      //   value: value.date,
      //   onChange: (date: Date) => update({date}),
      // },
      // {
      //   type: "color",
      //   label: "Role Color",
      //   description: "Pick a color",
      //   value: value.color,
      //   onChange: (color) => update({color}),
      // },
      // {
      //   type: "date",
      //   label: "Date",
      //   description: "Select a date",
      //   value: value.date,
      //   onChange: (date: Date) => update({date}),
      // },
      {
        type: "custom-form",
        label: "DJ Role",
        description: "Select something",
        component: (
          <RolesSelect
            value={ value.role }
            onChange={ (role) => update({role}) }
          />
        ),
        memorize: [value.role],
      },
      {
        type: "custom-form",
        label: "Music Channel",
        description: "Select a Channel",
        component: (
          <ChannelSelect
            value={ value.channel }
            onChange={ (channel) => update({channel}) }
          />
        ),
        memorize: [value.channel],
      },
      // {
      //   type: "file",
      //   label: "Your File",
      //   helperText: "Support Gif, Jpg, Png and Svg files",
      //   value: value.file,
      //   onChange: (file) => update({file}),
      //   accept: {
      //     "image/png": [".png"],
      //     "image/jpg": [".jpg"],
      //     "image/svg": [".svg"],
      //     "image/gif": [".gif"],
      //   },
      //   picker: {
      //     maxFiles: 2,
      //   },
      // },
      // {
      //   label: "Tags",
      //   description: "Select some tags",
      //   type: "custom-form",
      //   component: (
      //     <TagMultiSelect
      //       value={ value.tags ?? [] }
      //       onChange={ (tags) => {
      //         console.log(tags);
      //         update({tags});
      //       } }
      //     />
      //   ),
      //   memorize: [value.tags],
      // },
      // {
      //   type: "switch",
      //   label: "Light",
      //   description: "Turn on/off the light",
      //   value: value.bool,
      //   onChange: (bool) => update({bool}),
      // },
    ],
  });
}

/**
 * Example for multi select
 */
function TagMultiSelect({
                          value,
                          onChange,
                        }: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const tags = ["meme", "great", "bot", "discord"];
  const render = (item: string) => {
    return {
      label: item,
      value: item,
    };
  };
  
  return (
    <SelectField<{ label: string; value: string }, true>
      isMulti
      value={ value.map(render) }
      onChange={ (e) => onChange(e.map((tag) => tag.value)) }
      options={ tags.map(render) }
    />
  );
}
