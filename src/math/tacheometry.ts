// src/math/tacheometry.ts
// Standard Stadia Tacheometry per both textbooks

export type StadiaReading = {
  staffReading: number;
  topHair: number;
  bottomHair: number;
  verticalAngle: number;
};

export const reduceStadiaReading = (
  reading: StadiaReading,
  instrumentHeight: number,
  constant: number = 100
) => {
  const { staffReading, topHair, bottomHair, verticalAngle } = reading;
  
  const stadiaInterval = topHair - bottomHair;
  const verticalAngleRad = (verticalAngle * Math.PI) / 180;
  
  const horizDist = constant * stadiaInterval * Math.cos(verticalAngleRad) ** 2;
  
  const verticalDist = constant * stadiaInterval * Math.sin(2 * verticalAngleRad) / 2 + instrumentHeight - staffReading;
  
  const reducedLevel = verticalDist;

  return {
    horizontalDistance: Number(horizDist.toFixed(3)),
    verticalDistance: Number(verticalDist.toFixed(3)),
    reducedLevel: Number(reducedLevel.toFixed(3)),
    stadiaInterval
  };
};
