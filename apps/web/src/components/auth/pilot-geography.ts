// Public, approximate pilot geography for the sign-in globe. Mirrors the
// basin and river outlines seeded in packages/db/src/seed/reference.ts, kept
// here so the signed-out page needs no API call. Monitoring sites, alerts and
// field reports are deliberately left out: the sign-in page is public and those
// locations are protected (brief principle 6).

type Position = readonly [lon: number, lat: number];

export const PILOT_CENTER: Position = [-1.9, 5.35];

export const PILOT_BASINS: readonly { name: string; ring: readonly Position[] }[] = [
  {
    name: "Ankobra",
    ring: [
      [-2.45, 4.85],
      [-2.05, 4.85],
      [-1.85, 5.3],
      [-1.95, 5.95],
      [-2.3, 5.95],
      [-2.4, 5.4],
    ],
  },
  {
    name: "Pra",
    ring: [
      [-1.85, 4.98],
      [-1.45, 4.98],
      [-1.35, 5.7],
      [-1.7, 5.75],
      [-1.85, 5.3],
    ],
  },
];

export const PILOT_RIVERS: readonly {
  name: string;
  label: Position;
  course: readonly Position[];
}[] = [
  {
    name: "Ankobra",
    label: [-2.2, 5.62],
    course: [
      [-2.08, 5.78],
      [-2.04, 5.66],
      [-2.05, 5.57],
      [-2.1, 5.49],
      [-2.14, 5.43],
      [-2.17, 5.3],
      [-2.19, 5.18],
      [-2.22, 5.05],
      [-2.25, 4.93],
      [-2.27, 4.88],
    ],
  },
  {
    name: "Bonsa",
    label: [-1.98, 5.27],
    course: [
      [-1.95, 5.45],
      [-2.0, 5.37],
      [-2.03, 5.33],
      [-2.1, 5.24],
      [-2.19, 5.18],
    ],
  },
  {
    name: "Pra",
    label: [-1.5, 5.4],
    course: [
      [-1.52, 5.7],
      [-1.55, 5.61],
      [-1.58, 5.45],
      [-1.6, 5.38],
      [-1.63, 5.25],
      [-1.65, 5.15],
      [-1.66, 5.07],
      [-1.63, 5.01],
    ],
  },
];
