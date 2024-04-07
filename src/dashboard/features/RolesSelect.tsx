import { Icon, Image } from "@chakra-ui/react";
import { useParams } from "react-router-dom";
import { useGuildRolesQuery } from "@dashboard/stores";
import { Params } from "@dashboard/views/feature/FeatureView";
import { SelectField } from "@dashboard/components/forms/SelectField";
import { BsPeopleFill } from "react-icons/bs";
import { toRGB } from "@dashboard/utils/common";
import { Role } from "@dashboard/api/bot";

export function RolesSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (role: string) => void;
}) {
  // @ts-ignore
  const { guild } = useParams<Params>();
  const rolesQuery = useGuildRolesQuery(guild);
  const isLoading = rolesQuery.isLoading;

  const selected =
    value != null ? rolesQuery.data?.find((role) => role.id === value) : null;
  const render = (role: Role) => {
    return {
      value: role.id,
      label: role.name,
      icon:
        role.icon?.iconUrl != null ? (
          <Image
            src={role.icon?.iconUrl}
            bg={toRGB(role.color)}
            w="25px"
            h="25px"
          />
        ) : (
          <Icon as={BsPeopleFill} color={toRGB(role.color)} w="20px" h="20px" />
        ),
    };
  };

  return (
    <SelectField
      isDisabled={isLoading}
      isLoading={isLoading}
      placeholder="Select a role"
      value={selected != null && render(selected)}
      onChange={(e) => onChange(e.value)}
      options={rolesQuery.data?.map(render)}
    />
  );
}
