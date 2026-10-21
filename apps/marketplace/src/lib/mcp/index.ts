import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchProducts from "./tools/search_products";
import getProduct from "./tools/get_product";
import compareProducts from "./tools/compare_products";
import getShopInformation from "./tools/get_shop_information";
import getRecommendations from "./tools/get_recommendations";
import listMyOrders from "./tools/list_my_orders";
import listMyProducts from "./tools/list_my_products";
import listSellerOrders from "./tools/list_seller_orders";
import createProductDraft from "./tools/create_product";
import updateOrderStatus from "./tools/update_order_status";
import analyzeCatalog from "./tools/analyze_catalog";
import analyzeSales from "./tools/analyze_sales";
import analyzeInventory from "./tools/analyze_inventory";
import detectListingProblems from "./tools/detect_listing_problems";
import suggestProductContent from "./tools/suggest_product_content";
import recommendPrice from "./tools/recommend_price";
import monitorMarketplaceQuality from "./tools/monitor_marketplace_quality";
import forgetMemory from "./tools/forget_memory";
import bolConfigure from "./tools/bol_configure";
import bolImportProducts from "./tools/bol_import_products";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "borvat-mcp",
  title: "Borvat® Agent-Native Marketplace",
  version: "0.2.0",
  instructions: [
    "Borvat is een agent-native marketplace. De backend bepaalt rollen (buyer/seller/admin) — een AI kan geen rol wijzigen.",
    "Principe: AI stelt voor, backend valideert, gebruiker keurt gevoelige acties goed, marketplace voert uit, alles wordt gelogd.",
    "",
    "Publiek (iedereen): search_products, get_product, compare_products, get_shop_information.",
    "Koper: get_recommendations, list_my_orders. Bestellen en betalen gebeurt via de website met expliciete goedkeuring van de koper.",
    "Verkoper: analyze_catalog, analyze_sales, analyze_inventory, detect_listing_problems, list_my_products, list_seller_orders, update_order_status, create_product_draft, suggest_product_content, recommend_price, bol_configure, bol_import_products.",
    "  Suggesties (title/description/price) worden NIET automatisch toegepast — de verkoper accepteert of weigert ze in het dashboard (/seller/suggestions).",
    "  Concept-producten via create_product_draft zijn onzichtbaar tot de verkoper ze zelf publiceert.",
    "Admin: monitor_marketplace_quality. Admins ontvangen alerts en aanbevelingen; ze blokkeren gebruikers of verwijderen producten uitsluitend via het dashboard.",
    "Iedereen: forget_memory om opgeslagen voorkeuren te wissen.",
  ].join("\n"),
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    // Public
    searchProducts,
    getProduct,
    compareProducts,
    getShopInformation,
    // Buyer
    getRecommendations,
    listMyOrders,
    // Seller — read
    listMyProducts,
    listSellerOrders,
    analyzeCatalog,
    analyzeSales,
    analyzeInventory,
    detectListingProblems,
    // Seller — actions (drafts + suggestions only)
    createProductDraft,
    suggestProductContent,
    recommendPrice,
    updateOrderStatus,
    // Bol.com
    bolConfigure,
    bolImportProducts,
    // Admin
    monitorMarketplaceQuality,
    // Utility
    forgetMemory,
  ],
});
