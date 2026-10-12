/** Required attributions — keep verbatim. Shown in the footer, provenance panel and every exported report. */
export const ATTRIBUTIONS: string[] = [
  "Contains modified Copernicus Sentinel data 2026.",
  "Produced using Copernicus WorldDEM-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.",
  "© OpenStreetMap contributors.",
];

export const TRAINING_DATA_STATEMENT =
  "No machine-learning model or training dataset is used in this prototype: detection is rule-based on sample evidence layers. Any training dataset used by a future backend must be cited here.";

export const EMSR_STATEMENT =
  "Copernicus EMSR927 reference maps are isolated to a post-analysis validation/comparison workflow. They are never used as inputs for detection, training or any derived result. Validation lives on the Case-Study Validation page, runs only after an analysis is complete and only when a reference extent is loaded by the user; no EMSR927 data is bundled with this build.";
