import { ReactElement } from "react";
import { Button } from "@chakra-ui/react";

export function PrimaryButton(props: { icon: ReactElement; children: string }) {
  return (
    <Button
      leftIcon={props.icon}
      variant="action"
      _light={{ bg: "white" }}
      _dark={{ bg: "navy.800" }}
    >
      {props.children}
    </Button>
  );
}