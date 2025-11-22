// Extract Google Ads API schema from TypeScript definitions
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_PATH = path.join(__dirname, "../../docs/google-ads-api-repo/src/protos/autogen");
const OUTPUT_PATH = path.join(__dirname, "../../docs/API-knowledge/google-ads-schema-extracted.json");

function extractSchema() {
  const fieldsPath = path.join(REPO_PATH, "fields.ts");
  const fieldsContent = fs.readFileSync(fieldsPath, "utf8");

  // Extract asset_group_asset fields
  const assetGroupAssetFields = [];
  const fieldPattern = /"asset_group_asset\.([\w.]+)":\s*"([\w]+)"/g;
  let match;
  while ((match = fieldPattern.exec(fieldsContent)) !== null) {
    assetGroupAssetFields.push({
      field: match[1],
      type: match[2]
    });
  }

  // Extract campaign_asset fields
  const campaignAssetFields = [];
  const campaignFieldPattern = /"campaign_asset\.([\w.]+)":\s*"([\w]+)"/g;
  while ((match = campaignFieldPattern.exec(fieldsContent)) !== null) {
    campaignAssetFields.push({
      field: match[1],
      type: match[2]
    });
  }

  const schema = {
    extracted_at: new Date().toISOString(),
    source: "google-ads-api TypeScript definitions",
    resources: {
      asset_group_asset: {
        fields: assetGroupAssetFields,
        service: "AssetGroupAssetService",
        methods: ["mutateAssetGroupAssets"],
        resource_name_format: "customers/{customer_id}/assetGroupAssets/{asset_group_id}~{asset_id}~{field_type}"
      },
      campaign_asset: {
        fields: campaignAssetFields,
        service: "CampaignAssetService",
        methods: ["mutateCampaignAssets"],
        resource_name_format: "customers/{customer_id}/campaignAssets/{campaign_id}~{asset_id}~{field_type}"
      }
    },
    notes: [
      "All field names use snake_case in google-ads-api library",
      "field_type is always snake_case, never fieldType or camelCase",
      "Mutations use operations array with create/update/remove",
      "Resource names use tilde (~) as delimiter"
    ]
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(schema, null, 2), "utf8");
  console.log(`Schema extracted to ${OUTPUT_PATH}`);
  console.log(`\nAssetGroupAsset fields found: ${assetGroupAssetFields.length}`);
  console.log(`CampaignAsset fields found: ${campaignAssetFields.length}`);
}

try {
  extractSchema();
} catch (error) {
  console.error("Error extracting schema:", error.message);
  process.exit(1);
}
