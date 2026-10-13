# FloodLens — Satellite-Powered Flood Intelligence

<p align="center">
  <a href="https://floodlens-satellite-analytics.vercel.app/">
    <img src="https://img.shields.io/badge/OPEN-LIVE_DEMO-2563EB?style=for-the-badge" alt="Open FloodLens Live Demo">
  </a>
  <a href="https://github.com/subhendu1913/floodlens-satellite-analytics">
    <img src="https://img.shields.io/badge/GitHub-SOURCE_CODE-181717?style=for-the-badge&logo=github" alt="FloodLens GitHub Repository">
  </a>
</p>

<p align="center">
  <strong>Satellite observations. Geographic insight. Transparent reporting.</strong><br>
  An educational geospatial intelligence prototype for the<br>
  <strong>Multimodal AI Hackathon 2026 — Track B: Mapping Flood Damage from Space.</strong>
</p>

---

> [!IMPORTANT]
> **Respectful-use and safety notice**
>
> Floods affect real people, families, and communities. FloodLens treats disaster-related information with respect. **Do not use images of victims** in demonstrations, screenshots, presentations, or reports.
>
> FloodLens is an **educational prototype**, not an operational emergency-response system. Its outputs must not be used as the sole basis for rescue, evacuation, route-safety, or other safety-critical decisions. Always defer to official emergency guidance and verified field assessments.

## Contents

- [1. Project overview](#1-project-overview)
- [2. The problem](#2-the-problem)
- [3. Goals](#3-project-goals)
- [4. How the website works](#4-how-the-website-works)
- [5. Feature guide](#5-feature-guide)
- [6. Technology stack](#6-technology-stack)
- [7. How to use FloodLens](#7-how-to-use-floodlens)
- [8. Repository structure](#8-repository-structure)
- [9. Data sources and attribution](#9-data-sources-and-attribution)
- [10. Analysis methodology](#10-analysis-methodology)
- [11. Case study and validation](#11-case-study-and-validation)
- [12. Situation report](#12-situation-report)
- [13. Limitations and responsible interpretation](#13-limitations-and-responsible-interpretation)
- [14. Project status and reproducibility](#14-project-status-and-reproducibility)
- [15. Hackathon submission checklist](#15-hackathon-submission-checklist)
- [16. Contributing](#16-contributing)
- [17. License](#17-license)
- [Project links](#project-links)

---

## 1. Project overview

**FloodLens** is a geospatial flood-intelligence dashboard designed to bring satellite observations, geographic information, flood analysis, infrastructure exposure, settlement-connectivity analysis, and situation reporting into one interface.

Floods can change land-surface conditions, affect transport infrastructure, and interrupt access to settlements. Satellite observations and geographic datasets can help analysts investigate these conditions over a broad area. Turning those inputs into useful information, however, requires careful processing, appropriate geographic context, validation, and clear communication of uncertainty.

FloodLens explores this workflow through a map-oriented interface and response-focused reporting.

### The questions FloodLens aims to help investigate

1. **Where might flooding have occurred?** Examine suitable observations and estimate areas that may be affected.
2. **Which mapped infrastructure might be exposed?** Compare an independently generated flood estimate with suitable pre-event geographic data.
3. **Could road-network connectivity be affected?** Investigate modeled disruptions and possible settlement-access concerns.
4. **How can the findings be communicated?** Present the study area, observations, findings, sources, uncertainty, and limitations in an understandable report.

The goal is to demonstrate a transparent geospatial-analysis workflow—not to make unsupported claims about confirmed damage or live emergency conditions.

### Project links

| Resource | Link |
|---|---|
| Live website | [Open FloodLens](https://floodlens-satellite-analytics.vercel.app/) |
| Source code | [GitHub repository](https://github.com/subhendu1913/floodlens-satellite-analytics) |
| Hackathon track | Multimodal AI Hackathon 2026 — Track B: Mapping Flood Damage from Space |

---

## 2. The problem

During a flood, roads may become disrupted, access to some settlements may be reduced, and ground observations may be incomplete. Responders and analysts need timely geographic information to understand where further investigation may be useful.

Satellite imagery can provide observations across large areas, while geographic datasets can add context about roads and settlements. Yet a satellite image alone does not prove that a road is blocked or a building is damaged. Different observation dates, viewing geometry, clouds, vegetation, terrain, and data quality can all affect interpretation.

FloodLens aims to organize these elements into a workflow that helps users inspect potential flood extent, examine infrastructure exposure, explore network connectivity, and review a concise summary of the evidence.

---

## 3. Project goals

The project is intended to:

- Explore satellite-based flood-extent analysis.
- Support comparison of geographic observations across dates.
- Relate estimated flood extent to mapped infrastructure.
- Explore road-network connectivity and potential settlement-access issues.
- Present geographic findings through an understandable dashboard.
- Support situation reporting grounded in available results.
- Document data sources, attribution, validation, uncertainty, and limitations.
- Encourage responsible use of AI-assisted geospatial analysis.

**Implementation transparency:** A feature listed as a goal is not necessarily fully implemented in the current deployment. The status of each capability must be checked against the actual code and tested behavior.

---

## 4. How the website works

### Step 1 — Open the live website

Visit the [FloodLens Live Demo](https://floodlens-satellite-analytics.vercel.app/).

If the entry screen offers **Continue as Demo**, select it to enter the available demonstration environment. The current deployment identifies itself as a prototype without an authentication server, so demo access should not be mistaken for production authentication.

### Step 2 — Explore the dashboard

Use the dashboard to understand the study area and identify the analysis modules available in the deployed version. Depending on the current implementation, these may include a map, observation information, analysis summaries, infrastructure views, connectivity views, or reporting tools.

Before interpreting a result, check:

- What geographic area is shown?
- Which observation dates and data sources are identified?
- Is the result computed, sourced externally, prepared demonstration data, or simulated?
- Are uncertainty and limitations explained?

### Step 3 — Understand the satellite observations

Satellite missions observe the Earth at specific times rather than continuously. Sentinel-1 provides radar observations; Sentinel-2 provides optical observations. Their characteristics differ, and the appropriate data depends on the analysis being performed.

Official references:
- [Sentinel-1 data collection](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1)
- [Sentinel-2 data collection](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2)
- [Copernicus Data Space documentation](https://documentation.dataspace.copernicus.eu/)

These links are references to official data resources. Their inclusion does **not** mean the website currently downloads or processes new imagery automatically.

### Step 4 — Compare observations before and after an event

Before-and-after analysis compares observations from different dates. Differences may indicate changes in surface conditions, but not every change is caused by flooding.

A reliable workflow should record acquisition dates, preprocessing steps, masks, and analysis parameters. For pixel-based Sentinel-1 comparison, observations with compatible viewing geometry—preferably from the same relative orbit track—are important. Different geometry can create apparent differences unrelated to flood conditions.

### Step 5 — Review potential flood extent

Flood-extent analysis aims to estimate areas that may be covered by floodwater. A trustworthy result should be traceable to its input products and method, including preprocessing, thresholds, masking, and uncertainty.

An estimated flood polygon is not confirmation of physical damage. If the deployed website displays prepared or simulated results, those results must be labeled as such rather than presented as newly processed satellite observations.

### Step 6 — Examine infrastructure exposure

An analysis can overlay a flood estimate with suitable pre-event infrastructure data to identify mapped features that intersect the estimated flood area.

An intersection means **potential exposure**, not proof that a road, bridge, or building has been damaged or is impassable. The quality and date of the infrastructure data also matter.

OpenStreetMap reference: [Copyright and licensing](https://www.openstreetmap.org/copyright).

### Step 7 — Explore settlement connectivity

Where a road-network analysis is implemented, roads and intersections can be represented as a graph. A modeled disruption can then be used to examine whether a path between selected locations remains available in that graph.

A model may omit roads, footpaths, bridges, or current travel conditions. Therefore, modeled disconnection is not proof that a settlement is physically inaccessible, and a suggested alternative route is not a verified safe route.

### Step 8 — Review AI-assisted explanations

An AI-assisted explanation, where available, should summarize evidence that exists in the underlying analysis. Useful explanations identify the study area, observations, estimated flood extent, potentially exposed infrastructure, uncertainty, and data sources.

AI-generated text must not invent casualty counts, affected-population totals, confirmed damage, or rescue routes. If evidence is missing, the system should say that the information is unavailable.

### Step 9 — Generate or inspect a situation report

If the deployed version supports reporting, open the report feature and inspect the result. A report should summarize the study area, observation dates, map, analysis findings, sources, validation status, and limitations.

Check that numerical claims come from actual computation or a cited source. If PDF export is available, confirm that the exported file contains the correct map, text, attribution, and layout.

### Step 10 — Review validation and uncertainty

Validation compares independently generated predictions against appropriate reference data. It should be performed only after the predictions have been generated from permitted inputs. See [Case study and validation](#11-case-study-and-validation).

> **Important:** The steps above explain the intended user and analysis workflow. They do not assert that every step is fully connected to real satellite-processing services in the current deployment. Only describe a feature as operational after verifying its implementation.

---

## 5. Feature guide

The following table describes the intended role of the project components. Confirm the actual state of each feature in the deployed application.

| Component | Purpose | What users should verify |
|---|---|---|
| Geospatial dashboard | Presents the study area and available results | Map loads, layers behave as expected, and the data status is clear |
| Satellite observation exploration | Organizes observation dates and product information | Product source, identifier, and acquisition date are genuine and traceable |
| Before-and-after comparison | Helps inspect changes between dates | Observations are compatible and preprocessing is documented |
| Flood-extent analysis | Estimates potential floodwater extent | Result is computed from documented inputs rather than merely displayed |
| Infrastructure exposure | Identifies mapped infrastructure intersecting the flood estimate | Infrastructure source and date are recorded; exposure is not called confirmed damage |
| Settlement connectivity | Explores potential network disruptions | Connectivity is computed from a documented road-network method |
| Route exploration | Supports examination of alternative paths | Routes are labeled as modeled and are not presented as verified safe routes |
| AI-assisted explanations | Explains results in readable language | Explanations are grounded in actual outputs and do not invent facts |
| Situation reporting | Summarizes findings and their provenance | Report reflects the current analysis and preserves uncertainty |
| Validation | Compares predictions with reference data | Metrics are computed correctly and reference data are used only as allowed |

---

## 6. Technology stack

The current repository is configured as a frontend application.

| Technology | Role |
|---|---|
| React | Component-based user interface |
| TypeScript | Typed application code |
| Vite | Development server and production build |
| Tailwind CSS | Interface styling |
| Leaflet | Interactive map functionality |
| React Leaflet | React integration for Leaflet |
| Lucide React | Interface icons |
| Browser storage | Persistence for supported local application state |

The authoritative dependency list is in [`package.json`](https://github.com/subhendu1913/floodlens-satellite-analytics/blob/main/package.json).

A separate production backend, shared database, or complete satellite-processing service should not be assumed to exist unless it is implemented in the repository and documented with tested setup instructions.

---

## 7. How to Use FloodLens

FloodLens provides a web-based dashboard for exploring flood-related information through a satellite-intelligence interface.

### Access the Website

Open the live application:

**[Launch FloodLens — Live Demo](https://floodlens-satellite-analytics.vercel.app/)**

You can explore the available dashboard and demonstration features directly in your browser without installing the project locally.

### Getting Started

1. **Open FloodLens:** Visit the live demo using the link above.
2. **Enter the application:** If the sign-in page offers a **Continue as Demo** option, select it to explore the demonstration environment.
3. **Explore the dashboard:** Familiarize yourself with the available map, information panels, and navigation options.
4. **Select an available scenario:** If demonstration locations or scenarios are provided, select one to explore the information displayed by the application.
5. **Explore map information:** Use the available map controls to examine the displayed geographic area and any flood-related information provided.
6. **Review the results:** Explore the available observation summaries, change information, infrastructure-related information, and analytical explanations, where supported by the selected scenario.
7. **View situation reports:** If report-generation functionality is available, open the report section to review or generate a summary of the displayed information.

*Note: Available features and displayed information depend on the current implementation and selected demonstration scenario. Sample or illustrative data should not be interpreted as verified satellite-analysis results.*

### Run FloodLens Locally

To explore the source code or run the application on your computer, follow these steps.

**Prerequisites**

Install:
- [Node.js](https://nodejs.org/) — includes npm.
- [Git](https://git-scm.com/).
- A code editor such as [Visual Studio Code](https://code.visualstudio.com/).

Verify your installations:

```bash
node --version
npm --version
git --version
```

**Step 1: Clone the repository**

```bash
git clone https://github.com/subhendu1913/floodlens-satellite-analytics.git
```

**Step 2: Enter the project directory**

```bash
cd floodlens-satellite-analytics
```

**Step 3: Install dependencies**

```bash
npm install
```

**Step 4: Start the development server**

```bash
npm run dev
```

Open the local URL displayed in the terminal. It is commonly:

`http://localhost:5173/`

**Step 5: Build the application**

```bash
npm run build
```

The production build is generated in the `dist/` directory.

**Step 6: Preview the production build**

```bash
npm run preview
```

Open the preview URL displayed in the terminal.

### Troubleshooting

**The website does not open**
- Check your internet connection when accessing the live demo.
- For a local installation, confirm that dependencies installed successfully.
- Use the URL displayed after running `npm run dev`.

**The application does not start locally**
- Ensure you are inside the project directory containing `package.json`.
- Run `npm install` and then `npm run dev`.
- Review any errors shown in the terminal.

**The application does not build**
- Run `npm run build`.
- Review the reported error and resolve it before attempting another build.

### Source Code

Explore the project repository to understand its implementation and technical structure.

**[View FloodLens on GitHub](https://github.com/subhendu1913/floodlens-satellite-analytics)**

FloodLens is an educational prototype intended to support the exploration of satellite-based flood intelligence. Its displayed information should not replace official emergency guidance or verified field assessments.

---

## 8. Repository structure

The project includes frontend code and supporting analysis, data, and reporting modules. The exact contents should be kept synchronized with the repository.

```text
floodlens-satellite-analytics/
├── src/
│   ├── analysis/       # Analysis-related modules
│   ├── components/     # Reusable UI components
│   ├── copilot/        # Assistant and report-related modules
│   ├── data/           # Scenario data and attribution information
│   ├── lib/             # Shared utilities
│   ├── pages/           # Application pages
│   ├── reports/         # Report-related functionality
│   ├── state/           # Application state management
│   ├── App.tsx          # Main application component
│   └── main.tsx         # Application entry point
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

This is a guide to the expected organization, not a guarantee that every listed directory contains a complete production implementation. Update the tree when files change.

---

## 9. Data sources and attribution

Use traceable, permitted data and record the actual products that were used. Official reference pages are listed below.

| Source | Potential role | Reference |
|---|---|---|
| Copernicus Sentinel-1 | Radar observations for flood-related change analysis | [Sentinel-1 data collection](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1) |
| Copernicus Sentinel-2 | Optical observations and complementary surface analysis | [Sentinel-2 data collection](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2) |
| Copernicus Data Space Ecosystem | Data access and technical documentation | [Official documentation](https://documentation.dataspace.copernicus.eu/) |
| Copernicus DEM | Terrain context, where suitable and actually used | [DEM documentation](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM.html) |
| OpenStreetMap | Geographic features and road-network context | [Copyright and licensing](https://www.openstreetmap.org/copyright) |
| Copernicus Emergency Management Service | Reference material for validation, subject to challenge rules | [EMSR927 activation](https://mapping.emergency.copernicus.eu/activations/EMSR927/) |

These are references, not proof of data integration. For every dataset actually used, record:
- Dataset and product name.
- Provider and direct source.
- Product identifier, where available.
- Acquisition date and geographic coverage.
- Preprocessing and relevant parameters.
- Role in the workflow.
- License and required attribution.

### Required attribution

When the corresponding Sentinel data is actually used, include the challenge-required wording:

> Contains modified Copernicus Sentinel data 2026.

When OpenStreetMap data is used, include:

> © OpenStreetMap contributors.

Link to the [OpenStreetMap copyright page](https://www.openstreetmap.org/copyright).

If a Copernicus DEM or WorldDEM product is used, include the attribution and license applicable to that exact product. Do not apply WorldDEM wording to a different elevation product.

Training datasets must be cited by their actual names, versions, providers, publications, and applicable licenses. Do not cite a dataset as used if it was not used.

### Input data versus validation data

Follow the hackathon's data rules carefully.

**Potential permitted inputs**, subject to the official rules and actual implementation:
- Sentinel-1 imagery.
- Sentinel-2 imagery.
- Copernicus DEM.
- Pre-event OpenStreetMap data.
- Training datasets explicitly permitted by the challenge.

**Validation-only materials**, as specified in the challenge instructions:
- Copernicus EMS reference maps, including EMSR927.
- UNOSAT damage maps.
- Other published damage maps restricted to validation.
- OpenStreetMap edits made after the event.

Do not use validation-only reference maps to create or tune predicted maps in a way that violates the challenge rules. Generate predictions independently from permitted inputs, then compare them with allowed reference material.

---

## 10. Analysis methodology

The intended analytical workflow consists of the following stages.

### 10.1 Define the study area

Select the area of interest and relevant observation dates. Record the boundary and how it was defined.

### 10.2 Select satellite observations

Identify permitted observations covering the area. Record acquisition dates and product identifiers. Check that the observations are suitable for the comparison.

### 10.3 Preprocess observations

Prepare imagery using a documented procedure. Record any calibration, filtering, co-registration, masking, resampling, or other preprocessing that is actually performed.

For pixel-based Sentinel-1 change detection, prefer observations from the same relative orbit track and compatible viewing geometry. Differences in geometry can otherwise look like changes in surface conditions.

### 10.4 Estimate flood extent

Apply a documented method to estimate potential flood extent. Record thresholds, masks, handling of permanent water, and other relevant parameters.

### 10.5 Assess infrastructure exposure

Overlay the independently generated flood estimate with suitable pre-event infrastructure data. Identify intersecting features and summarize potential exposure. Do not equate spatial intersection with confirmed damage.

### 10.6 Analyze network connectivity

If the network-analysis component is implemented, model the road network and examine connectivity under clearly stated disruption assumptions. Document the graph construction and the method used to identify potentially disconnected destinations.

### 10.7 Produce a report

Summarize the study area, observations, findings, sources, uncertainty, and limitations. Use values from actual computations or cited sources.

### 10.8 Validate results

Compare independently generated predictions with suitable reference data under the challenge rules. Document alignment, resolution, valid-data masks, and evaluation methods.

**Implementation note:** This describes the intended method. Do not claim an end-to-end workflow until each required stage is implemented and tested on actual permitted data.

---

## 11. Case study and validation

The Trishuli Valley flood case study associated with EMSR927 may be used where suitable permitted inputs are available and the challenge's data rules are followed.

- [Official EMSR927 activation](https://mapping.emergency.copernicus.eu/activations/EMSR927/)
- [EMSR927 areas of interest](https://mapping.emergency.copernicus.eu/activations/EMSR927/aois/)

Use EMSR927 as reference material for validation, not as an input for producing the independent prediction where prohibited.

A reproducible case study should document:
1. Study-area boundary.
2. Permitted satellite products and acquisition dates.
3. Preprocessing procedure.
4. Independent flood prediction.
5. Infrastructure-exposure method.
6. Connectivity method, if implemented.
7. Reference data and validation procedure.
8. Computed results.
9. Uncertainty and known limitations.

### Evaluation metrics

If compatible predicted and reference flood masks are available, compute:

**Intersection over Union (IoU)**

`IoU = TP / (TP + FP + FN)`

**Precision**

`Precision = TP / (TP + FP)`

**Recall**

`Recall = TP / (TP + FN)`

**F1 score**

`F1 = 2 × Precision × Recall / (Precision + Recall)`

Where:
- **TP** = true-positive pixels.
- **FP** = false-positive pixels.
- **FN** = false-negative pixels.

The masks must have compatible coverage, resolution, alignment, and valid-data masks. Handle zero denominators explicitly. Document how reference labels were prepared and what area was evaluated.

Do not invent accuracy, flood-area totals, road counts, or other metrics. If suitable independent predictions and reference labels are unavailable, mark quantitative validation as **Pending**.

---

## 12. Situation report

Where the current implementation supports report generation, a situation report should communicate the analysis clearly and concisely.

Recommended contents:
- Study title, area, and report date.
- Satellite observation dates and product information.
- Overview map.
- Estimated flood extent and uncertainty.
- Potentially exposed infrastructure.
- Modeled settlement-connectivity concerns, if calculated.
- Data sources and processing details.
- Validation status and metrics, if computed.
- Limitations and recommended verification.

The report must be generated from actual analysis results rather than unsupported hardcoded claims. Mark missing values as unavailable. Distinguish estimated exposure from confirmed physical damage.

If PDF export is offered, test the resulting PDF for correct content, attribution, readability, and page layout before submission.

---

## 13. Limitations and responsible interpretation

FloodLens is an educational prototype. Its outputs require careful interpretation.

- **Observation timing:** Satellites do not continuously observe every location. Revisit intervals and acquisition availability can delay assessment.
- **Optical imagery:** Clouds and cloud shadows can obscure the ground.
- **Radar interpretation:** Vegetation, urban structures, terrain, and viewing geometry can affect results.
- **Detection uncertainty:** Algorithms and thresholds can produce false positives and false negatives.
- **Geographic data quality:** Road networks and other map data may be incomplete or outdated.
- **Infrastructure exposure:** An intersection with estimated flood extent is not proof of structural damage.
- **Connectivity models:** A modeled disconnection does not prove actual inaccessibility.
- **AI-generated content:** Explanations can be incorrect if they are not grounded in verified analysis.
- **Demonstration outputs:** Prepared or simulated data must not be presented as new satellite observations.
- **Operational safety:** The prototype is not an authoritative source for rescue routes, evacuation decisions, or emergency instructions.

Do not claim confirmed casualties, affected-population figures, physical damage, or safe routes without suitable evidence. FloodLens does not replace field verification or official emergency guidance.

### Respectful presentation

- Do not include images of victims in demos, reports, or screenshots.
- Avoid sensationalized language and imagery.
- Use neutral, evidence-based descriptions.
- Protect sensitive information about affected individuals and communities.
- Clearly disclose uncertainty and the prototype's non-operational status.

---

## 14. Project status and reproducibility

Record the actual state of each component before presenting the project.

| Component | Evidence required before marking complete |
|---|---|
| Website | Deployed interface loads and available navigation is tested |
| Satellite-data integration | Actual permitted products can be retrieved or supplied to the pipeline |
| Flood analysis | Predictions are generated from documented inputs |
| Infrastructure analysis | Exposure is computed from the prediction and suitable geographic data |
| Connectivity analysis | Results are generated by a documented network method |
| AI explanation | Text is grounded in the actual results and sources |
| Situation report | Output reflects the current analysis and has been tested |
| Validation | Metrics are computed from suitable predictions and reference data |
| Data attribution | All actually used datasets have correct attribution and citations |
| Demo video | Video exists, is reviewed, and is linked in the submission |

For reproducibility, record the study area, observation dates, product IDs, relative orbit where relevant, preprocessing parameters, detection settings, infrastructure snapshot date, validation method, and software version.

Do not mark a feature complete merely because a button or page exists.

---

## 15. Hackathon submission checklist

The intended submission deliverables are:

- [ ] Working map dashboard.
- [ ] One-page situation report generated by the system.
- [ ] GitHub repository with a README explaining how to run the project.
- [ ] Technical report of no more than six pages, including limitations.
- [ ] Three-minute demo video.
- [ ] Required data attributions and training-dataset citations.
- [ ] Case-study comparison against EMSR927 reference maps, following the challenge rules.
- [ ] Verified, reproducible results and an honest account of limitations.
- [ ] No victim images in the demo, screenshots, or reports.

Only mark an item complete after checking the actual artifact or test result. Do not invent a video, report, validation metric, or download link.

---

## 16. Contributing

Contributions that improve usability, reproducibility, data transparency, and analytical reliability are welcome.

Before submitting changes:
1. Review the existing project structure.
2. Keep documentation consistent with implemented behavior.
3. Do not commit passwords, API keys, or other secrets.
4. Preserve third-party data attribution and licensing requirements.
5. Avoid victim imagery and sensationalized disaster content.
6. Run `npm run build` and address errors before proposing a change.
7. Describe which tests were actually performed.

---

## 17. License

No repository license is specified in this README. Before distributing the source code for reuse, add an appropriate `LICENSE` file and ensure it reflects the project's intended terms.

Third-party datasets may have separate licensing and attribution conditions. Review each source's terms before redistributing its data or products.

---

## Project links

- **Live Demo:** [floodlens-satellite-analytics.vercel.app](https://floodlens-satellite-analytics.vercel.app/)
- **GitHub Repository:** [subhendu1913/floodlens-satellite-analytics](https://github.com/subhendu1913/floodlens-satellite-analytics)
- **Sentinel-1:** [Copernicus Data Space](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-1)
- **Sentinel-2:** [Copernicus Data Space](https://dataspace.copernicus.eu/data-collections/copernicus-sentinel-missions/sentinel-2)
- **OpenStreetMap attribution:** [Copyright and licensing](https://www.openstreetmap.org/copyright)
- **EMSR927 reference:** [Copernicus Emergency Management Service](https://mapping.emergency.copernicus.eu/activations/EMSR927/)

---

<p align="center">
  <strong>FloodLens</strong><br>
  <em>Geospatial insight with transparency, responsibility, and respect for affected communities.</em>
</p>
