// src/math/volume.ts
// Compliant with Schofield Ch.11 + Basak Ch.8 (Earthworks)

export type CrossSection = {
  chainage: number;
  area: number;
  description?: string;
};

export const computeVolumeTrapezoidal = (sections: CrossSection[]): number => {
  if (sections.length < 2) throw new Error("Minimum 2 sections required");

  let volume = 0;

  for (let i = 0; i < sections.length - 1; i++) {
    const dist = sections[i + 1].chainage - sections[i].chainage;
    volume += ((sections[i].area + sections[i + 1].area) / 2) * dist;
  }

  return Number(volume.toFixed(2));
};

export const computeVolumePrismoidal = (sections: CrossSection[]): number => {
  if (sections.length < 3 || (sections.length - 1) % 2 !== 0) {
    throw new Error("Prismoidal formula requires odd number of sections (minimum 3)");
  }

  let volume = 0;
  const n = sections.length;

  for (let i = 0; i < n - 1; i += 2) {
    const d = sections[i + 1].chainage - sections[i].chainage;
    const A1 = sections[i].area;
    const Am = sections[i + 1].area;
    const A2 = sections[i + 2].area;

    volume += (d / 3) * (A1 + 4 * Am + A2);
  }

  return Number(volume.toFixed(2));
};

export const computeEarthworkVolume = (sections: CrossSection[]) => {
  const trap = computeVolumeTrapezoidal(sections);
  let prism = 0;
  let recommendation = "Trapezoidal Rule used";

  try {
    prism = computeVolumePrismoidal(sections);
    recommendation = "Prismoidal Formula (more accurate)";
  } catch (_) {
    // Fall back to trapezoidal
  }

  return {
    trapezoidalVolume: trap,
    prismoidalVolume: prism || null,
    finalVolume: prism || trap,
    methodUsed: recommendation,
    numberOfSections: sections.length
  };
};
