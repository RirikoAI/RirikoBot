import { dashboard } from "@dashboard/config/translations/dashboard";
import { useColors } from "@dashboard/theme";
import { Flex, HStack, Spacer, Text } from "@chakra-ui/layout";
import { Avatar, Hide, Icon, IconButton, Image, Progress } from "@chakra-ui/react";
import { BsEyeFill as ViewIcon, BsPlay, BsPlayBtn, BsShareFill } from "react-icons/bs";
import { BiSkipNext, BiSkipPrevious } from "react-icons/bi";
import { AiFillDislike, AiFillLike } from "react-icons/ai";
import { PrimaryButton } from "@dashboard/components/button/PrimaryButton";
import { useParams } from "react-router-dom";
import { Params } from "@dashboard/views/feature/FeatureView";

export function MusicPlayer(data) {
  const props = data.props;
  const t = dashboard.useTranslations();
  const {cardBg, textColorSecondary, brand} = useColors();
  const {guild} = useParams<Params>();
  return (
    <>
      <Flex direction="row" gap={ 5 }>
        <Image
          rounded="xl"
          src={ props.cover_url }
          bg={ brand }
          w="409.8px"
          h="230.4px"
          display={ {base: "none", md: "block"} }
          boxShadow="0px 5px 30px #ff5bff6e"
          _dark={ {
            boxShadow: "0px 5px 30px #c03bc06e",
          } }
        />
        <Flex
          direction="column"
          bg={ cardBg }
          rounded="xl"
          gap={ 3 }
          p={ 3 }
          flex={ 1 }
          _light={ {boxShadow: "14px 17px 30px 4px rgb(112 144 176 / 13%)"} }
        >
          <HStack
            color={ textColorSecondary }
            display={ {base: "none", md: "flex"} }
          >
            <BsPlayBtn/>
            <Text>{ t.music["now playing"] }</Text>
          </HStack>
          <HStack>
            {/*<Avatar name="Stay with me" size="sm"/>*/}
            <Text fontSize={ {base: "lg", md: "2xl"} } fontWeight="bold">
              { props.now_playing }
            </Text>
          </HStack>
          <HStack>
            {/*<Avatar name="Stay with me" size="sm"/>*/}
            <Text fontWeight="bold">
              Requested by:
            </Text>
            <Text>
              { props.requested_by }
            </Text>
          </HStack>
          
          <HStack mt="auto" justify="space-between" fontWeight="bold">
            <IconButton
              fontSize="4xl"
              icon={ <Icon as={ BiSkipPrevious }/> }
              aria-label="previous"
              variant="action"
            />
            <IconButton
              p={ 1 }
              h="fit-content"
              fontSize="4xl"
              icon={ <Icon as={ BsPlay }/> }
              aria-label="pause"
              variant="brand"
              rounded="full"
            />
            <IconButton
              fontSize="4xl"
              icon={ <Icon as={ BiSkipNext }/> }
              aria-label="next"
              variant="action"
            />
          </HStack>
          <HStack px={ 3 }>
            <Text>{ props.current_time }</Text>
            <Progress w="full" value={ 50 }/>
            <Text>{ props.maximum_time }</Text>
          </HStack>
        </Flex>
      </Flex>
      {/*<HStack mt={ 2 }>*/}
      {/*  <PrimaryButton icon={ <AiFillLike/> }>1203</PrimaryButton>*/}
      {/*  <PrimaryButton icon={ <AiFillDislike/> }>297</PrimaryButton>*/}
      {/*  <PrimaryButton icon={ <BsShareFill/> }>103</PrimaryButton>*/}
      {/*  <Hide below="2sm">*/}
      {/*    <Spacer/>*/}
      {/*    <PrimaryButton icon={ <ViewIcon/> }>4258</PrimaryButton>*/}
      {/*  </Hide>*/}
      {/*</HStack>*/}
    </>
  );
}