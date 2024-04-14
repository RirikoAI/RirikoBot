import { ChakraProvider } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { LoadingPanel } from "@dashboard/components/panel/LoadingPanel";
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { client, useLoginQuery } from "@dashboard/stores";
import { theme } from "@dashboard/theme";
import { QueryStatus } from "@dashboard/components/panel/QueryPanel";
import "./index.css";
import { layouts } from "./layouts";
import { NormalLayout } from "./utils/routeUtils";
import { createRoot } from "react-dom/client";
import { commonI18b } from "@dashboard/utils/translationProvider";

function RootRoutes({ loggedIn }: { loggedIn: boolean }) {
  function mapNestedLayout(layout: NormalLayout, key: string | number) {
    if (layout.index === true) {
      return <Route index key={key} element={layout.component} />;
    } else {
      return (
        <Route key={key} path={layout.path} element={layout.component}>
          {layout.subLayouts && layout.subLayouts.map(mapNestedLayout)}
        </Route>
      );
    }
  }
  return (
    <Routes>
      {layouts.map((layout, key) =>
        layout.loggedIn === loggedIn || layout.loggedIn === undefined
          ? mapNestedLayout(layout, key)
          : null
      )}
    </Routes>
  );
}

function Pages() {
  const t = commonI18b.useTranslations();
  const query = useLoginQuery();

  return (
    <QueryStatus
      query={query}
      error={t.fail.login}
      loading={<LoadingPanel size="lg" />}
    >
      <RootRoutes loggedIn={query.data != null} />
    </QueryStatus>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(
  <ChakraProvider theme={theme}>
    <QueryClientProvider client={client}>
      <React.StrictMode>
        <BrowserRouter>
          <Pages />
        </BrowserRouter>
      </React.StrictMode>
    </QueryClientProvider>
  </ChakraProvider>
);
