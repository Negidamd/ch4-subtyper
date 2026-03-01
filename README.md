# PD-MCI Ch4 Subtyping Tool

A web-based clinical decision-support tool for MRI-based cholinergic subtyping of Parkinson's disease patients with mild cognitive impairment (PD-MCI).

**Live Tool:** [https://ch4subtyping.negida.com](https://ch4subtyping.negida.com)

## Overview

This tool implements a regression-based normative model to classify PD-MCI patients as having **Low Ch4 GMD** (disproportionate cholinergic degeneration) or **Normal Ch4 GMD** based on structural MRI measures of the nucleus basalis of Meynert (Ch4 region). The subtyping framework was developed using data from the Parkinson's Progression Markers Initiative (PPMI).

## Method

### Inputs

| Parameter | Description | Units |
|-----------|-------------|-------|
| **Standardized Ch4 GMD** | Gray matter density of the Ch4 region extracted from T1-weighted MRI using the cytoarchitectonic maps of Zaborszky et al. | 0-1 (probability) |
| **Age at MRI** | Patient age at time of MRI acquisition | Years |
| **Sex** | Biological sex | Male / Female |
| **Total Intracranial Volume (TIV)** | Total intracranial volume from segmentation | mL (supports mm3, L, or custom units) |

### Computation

1. **Scaling**: The standardized Ch4 GMD is transformed to a common metric using healthy control reference values:

   ```
   Scaled Ch4 GMD = ((Ch4_std - HC_mean) / HC_sd) * 3 + 10
   ```

   where HC_mean = 0.3985484 and HC_sd = 0.0386747 are derived from a healthy control sample.

2. **Normative Prediction**: A predicted Ch4 GMD value is computed from a multiple linear regression model adjusting for age, sex, and TIV:

   ```
   Predicted = 1.57859 + (-0.1078075 * Age) + (0.8647528 * Sex) + (0.0096637 * TIV_mL)
   ```

   where Sex is coded as Male = 1, Female = 0.

3. **Z-score**: The deviation between observed and predicted values is expressed as a z-score:

   ```
   Z = (Scaled_Ch4_GMD - Predicted) / SD_residual
   ```

   where SD_residual = 2.2252.

4. **Classification**: Patients with z < -1.0 are classified as **Low Ch4 GMD**; otherwise **Normal Ch4 GMD**.

### Outputs

| Output | Description |
|--------|-------------|
| **Scaled Ch4 GMD** | Participant's Ch4 GMD transformed to the common scale |
| **Predicted Value** | Expected Ch4 GMD based on age, sex, and TIV |
| **Z-score** | Standardized deviation from the normative prediction |
| **Classification** | Low Ch4 GMD (z < -1.0) or Normal Ch4 GMD (z >= -1.0) |

## Disclaimer

This tool is intended as a **research decision-support aid** and is not designed for standalone clinical care. Classification results should be interpreted in the context of the full clinical picture and validated imaging protocols.

## Citation

If you use this tool in your research, please cite:

> Negida A, et al. MRI-based cholinergic subtyping of Parkinson's disease with mild cognitive impairment. *[Journal, Year]*.

## Author

**Ahmed Negida, MD, PhD**
Parkinson and Movement Disorder Center
VCU Neurology, Richmond, VA

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

## Development

```sh
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## License

All rights reserved. For research use only.
