import { useToken } from "@chakra-ui/react";
import Chart, { Props as ChartProps } from "react-apexcharts";
import { useColorsExtend } from "@dashboard/theme";
import { deepmerge } from "deepmerge-ts";

export function StyledChart(props: ChartProps) {
  const { theme, ...colors } = useColorsExtend(
    { theme: "light" },
    { theme: "dark" }
  );
  const [textColorPrimary, textColorSecondary] = useToken("colors", [
    colors.textColorPrimary,
    colors.textColorSecondary,
  ]);

  const options: ApexCharts.ApexOptions = {
    chart: {
      toolbar: {
        show: false,
      },
      dropShadow: {
        enabled: true,
        top: 13,
        left: 0,
        blur: 10,
        opacity: 0.1,
        color: "#4318FF",
      },
    },
    tooltip: {
      fillSeriesColor: false,
      theme: theme,
    },
    markers: {
      size: 0,
      colors: textColorPrimary,
      strokeColors: "#7551FF",
      strokeWidth: 3,
      strokeOpacity: 0.9,
      strokeDashArray: 0,
      fillOpacity: 1,
      discrete: [],
      shape: "circle",
      radius: 2,
      offsetX: 0,
      offsetY: 0,
      showNullDataPoints: true,
    },
    stroke: {
      curve: "smooth",
    },
    legend: {
      labels: {
        colors: textColorSecondary,
      },
    },
    grid: {
      show: false,
    },
    yaxis: {
      labels: {
        style: {
          colors: textColorSecondary,
        },
      },
    },
    xaxis: {
      labels: {
        style: {
          colors: textColorSecondary,
          fontSize: "12px",
          fontWeight: "500",
        },
      },
    },
  };

  return <Chart {...props} options={deepmerge(options, props.options)} />;
}
