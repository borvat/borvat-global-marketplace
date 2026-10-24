import React from "react";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BuyerJourney } from "../../../apps/marketplace/src/components/commercial/buyer-journey";
import { createCommercialDemoAdapter } from "../../../apps/marketplace/src/lib/commercial/demo-adapter";
import { createHostBuyerNavigation } from "../../../apps/marketplace/src/lib/commercial/buyer-navigation";

test("Arabic and English initial SSR carry the selected language, heading and direction without a Dutch hero", () => {
  for (const [language, heading, direction] of [
    ["ar", "لبيتك وحديقتك، على ذوقك.", "rtl"],
    ["en", "Home and garden, your way.", "ltr"],
  ]) {
    const href = "/discover?lang=" + language;
    const navigation = createHostBuyerNavigation({
      initialLocation: href,
      getLocation: () => href,
      subscribe: () => () => {},
      navigate: () => {},
    });
    const html = renderToStaticMarkup(
      <BuyerJourney
        adapter={createCommercialDemoAdapter()}
        navigation={navigation}
      />,
    );
    assert.ok(html.includes(heading));
    assert.ok(html.includes('dir="' + direction + '"'));
    assert.ok(html.includes('lang="' + language + '-NL"'));
    assert.ok(!html.includes("Wonen en tuin, op jouw manier."));
  }
});
